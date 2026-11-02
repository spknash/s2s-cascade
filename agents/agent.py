"""LiveKit Agents worker for the s2s-cascade demo.

One worker, one dispatch name (s2s-cascade). The web app's token carries
{"mode": "cascade" | "live" | "live-nobackend"} as job metadata and the worker
builds the matching AgentSession. Every session publishes a JSON event stream on
the "demo" data topic that the web UI renders as metrics, a tool log and turn timings.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    cli,
    function_tool,
    inference,
    metrics,
)
from livekit.agents.voice import events as ev
from livekit.plugins import deepgram, elevenlabs, openai, silero

import prompts
from tools import BackOffice

load_dotenv()
logger = logging.getLogger("s2s-cascade")

AGENT_NAME = os.environ.get("AGENT_NAME", "s2s-cascade")
DATA_TOPIC = "demo"

# ------------------------------------------------------------------ event publishing


class Publisher:
    """Fire-and-forget JSON messages to the room on the demo topic."""

    def __init__(self, room: rtc.Room, mode: str) -> None:
        self.room = room
        self.mode = mode
        self.t0 = time.time()

    def send(self, type_: str, **payload: Any) -> None:
        msg = {"type": type_, "mode": self.mode, "ts": round(time.time() - self.t0, 3), **payload}

        async def _go() -> None:
            try:
                await self.room.local_participant.publish_data(
                    json.dumps(msg, default=str).encode(), topic=DATA_TOPIC, reliable=True
                )
            except Exception as e:  # noqa: BLE001
                logger.debug("publish_data failed: %s", e)

        asyncio.create_task(_go())


# ------------------------------------------------------------------ shared agent + tools


class LeasingAgent(Agent):
    """Same four tools in both modes. The tool bodies are trivial on purpose: the point is
    whether each architecture *invokes* them correctly, with the right arguments, after
    interruptions and corrections."""

    def __init__(self, *, instructions: str, llm: Any, office: BackOffice, pub: Publisher, **kw: Any) -> None:
        super().__init__(instructions=instructions, llm=llm, **kw)
        self.office = office
        self.pub = pub

    @function_tool()
    async def check_availability(
        self, ctx: RunContext, bedrooms: int | None = None, move_in_date: str | None = None
    ) -> dict:
        """Look up available apartments.

        Args:
            bedrooms: Number of bedrooms the caller wants (1, 2 or 3). Omit for all.
            move_in_date: Desired move-in date as YYYY-MM-DD, if the caller gave one.
        """
        return self.office.check_availability(bedrooms, move_in_date)

    @function_tool()
    async def schedule_tour(
        self, ctx: RunContext, caller_name: str, day: str, time: str, unit: str | None = None
    ) -> dict:
        """Book a tour of the community or a specific unit.

        Args:
            caller_name: The caller's name.
            day: Day of the tour, e.g. "Saturday" or "2026-11-08".
            time: Time of the tour, e.g. "3pm".
            unit: Unit number if the caller asked for a specific one.
        """
        return self.office.schedule_tour(caller_name, day, time, unit)

    @function_tool()
    async def file_maintenance_request(
        self, ctx: RunContext, unit: str, issue: str, urgency: str = "normal"
    ) -> dict:
        """File a maintenance request for a resident.

        Args:
            unit: The resident's unit number.
            issue: Short description of the problem.
            urgency: "normal" or "urgent" (water leaks, no heat, lockouts are urgent).
        """
        return self.office.file_maintenance_request(unit, issue, urgency)

    @function_tool()
    async def office_hours(self, ctx: RunContext, day: str | None = None) -> dict:
        """Get the leasing office hours, optionally for one day of the week."""
        return self.office.office_hours(day)


# ------------------------------------------------------------------ session builders


def build_cascade(office: BackOffice, pub: Publisher) -> tuple[AgentSession, Agent]:
    """Ruchir's production shape: Deepgram STT -> GPT-4.1 -> ElevenLabs TTS."""
    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="en-US"),
        llm=openai.LLM(model="gpt-4.1"),
        tts=elevenlabs.TTS(
            voice_id=os.environ.get("ELEVEN_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),  # Sarah (premade)
            model="eleven_flash_v2_5",
        ),
        vad=silero.VAD.load(),
        turn_handling={"turn_detection": inference.TurnDetector()},
    )
    agent = LeasingAgent(instructions=prompts.CASCADE_INSTRUCTIONS, llm=openai.LLM(model="gpt-4.1"), office=office, pub=pub)
    return session, agent


def build_live(office: BackOffice, pub: Publisher, *, with_backend: bool) -> tuple[AgentSession, Agent]:
    """GPT-Live full duplex. Tools run in this process, called by the backend Responses model."""
    responses_options: dict[str, Any] = {
        "model": os.environ.get("LIVE_BACKEND_MODEL", "gpt-6-luna"),
        "instructions": prompts.LIVE_BACKEND_INSTRUCTIONS if with_backend else prompts.LIVE_NOBACKEND_BACKEND_INSTRUCTIONS,
        "text": {"verbosity": "low"},
    }
    if with_backend:
        responses_options["parallel_tool_calls"] = True
    model = openai.realtime.GPTLiveModel(
        model=os.environ.get("LIVE_MODEL", "gpt-live-1"),
        voice=os.environ.get("LIVE_VOICE", "marin"),
        delegation="responses",
        responses_options=responses_options,  # type: ignore[arg-type]
    )
    session = AgentSession(llm=model)
    if with_backend:
        agent = LeasingAgent(instructions=prompts.LIVE_VOICE_INSTRUCTIONS, llm=model, office=office, pub=pub)
    else:
        agent = Agent(instructions=prompts.LIVE_VOICE_INSTRUCTIONS, llm=model, tools=[])
    return session, agent


# ------------------------------------------------------------------ telemetry wiring


def wire_events(session: AgentSession, pub: Publisher) -> None:
    usage = metrics.UsageCollector()

    @session.on("metrics_collected")
    def _on_metrics(e: ev.MetricsCollectedEvent) -> None:
        m = e.metrics
        usage.collect(m)
        data = m.model_dump(exclude_none=True) if hasattr(m, "model_dump") else {}
        data.pop("metadata", None)
        pub.send("metrics", kind=getattr(m, "type", type(m).__name__), data=data)

    @session.on("agent_state_changed")
    def _on_agent_state(e: ev.AgentStateChangedEvent) -> None:
        pub.send("agent_state", old=e.old_state, new=e.new_state)

    @session.on("user_state_changed")
    def _on_user_state(e: ev.UserStateChangedEvent) -> None:
        pub.send("user_state", old=e.old_state, new=e.new_state)

    @session.on("user_input_transcribed")
    def _on_user_tx(e: ev.UserInputTranscribedEvent) -> None:
        if e.is_final:
            pub.send("user_final", text=e.transcript)

    @session.on("tool_execution_updated")
    def _on_tool_update(e: ev.ToolExecutionUpdatedEvent) -> None:
        u = e.update
        if u.type == "tool_call_started":
            fc = u.function_call
            pub.send("tool", phase="started", call_id=fc.call_id, name=fc.name, arguments=fc.arguments)
        elif u.type == "tool_call_ended":
            pub.send("tool", phase="ended", call_id=u.call_id, status=u.status, message=u.message)

    @session.on("function_tools_executed")
    def _on_tools_done(e: ev.FunctionToolsExecutedEvent) -> None:
        for fc, out in zip(e.function_calls, e.function_call_outputs):
            pub.send(
                "tool_result",
                call_id=fc.call_id,
                name=fc.name,
                arguments=fc.arguments,
                output=(out.output if out else None),
                is_error=(out.is_error if out else None),
            )

    @session.on("overlapping_speech")
    def _on_overlap(e: ev.OverlappingSpeechEvent) -> None:
        pub.send("overlap", is_interruption=e.is_interruption, agent_ended=e.agent_ended)

    @session.on("agent_false_interruption")
    def _on_false_int(e: ev.AgentFalseInterruptionEvent) -> None:
        pub.send("false_interruption")

    @session.on("error")
    def _on_error(e: ev.ErrorEvent) -> None:
        pub.send("error", error=str(e.error), source=type(e.source).__name__ if e.source else None)


# ------------------------------------------------------------------ entrypoint

server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    try:
        meta = json.loads(ctx.job.metadata or "{}")
    except json.JSONDecodeError:
        meta = {}
    mode = meta.get("mode", "cascade")
    if mode not in ("cascade", "live", "live-nobackend"):
        mode = "cascade"
    ctx.log_context_fields = {"room": ctx.room.name, "mode": mode}
    logger.info("starting session mode=%s room=%s", mode, ctx.room.name)

    await ctx.connect()
    pub = Publisher(ctx.room, mode)
    office = BackOffice()

    if mode == "cascade":
        session, agent = build_cascade(office, pub)
    else:
        session, agent = build_live(office, pub, with_backend=(mode == "live"))

    wire_events(session, pub)
    pub.send("hello", agent=AGENT_NAME, stack=describe(mode))

    await session.start(agent=agent, room=ctx.room)

    if mode == "cascade":
        await session.generate_reply(
            instructions="Greet the caller in one short sentence as Sam from Maple Court and ask how you can help."
        )
    # GPT-Live opens the conversation itself from its persona.


def describe(mode: str) -> dict[str, str]:
    if mode == "cascade":
        return {"stt": "deepgram/nova-3", "llm": "gpt-4.1", "tts": "elevenlabs/eleven_flash_v2_5", "transport": "livekit"}
    if mode == "live":
        return {"s2s": "gpt-live-1", "backend": os.environ.get("LIVE_BACKEND_MODEL", "gpt-6-luna"), "transport": "livekit"}
    return {"s2s": "gpt-live-1", "backend": "none (no tools)", "transport": "livekit"}


if __name__ == "__main__":
    cli.run_app(server)
