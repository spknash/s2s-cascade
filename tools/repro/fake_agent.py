"""Joins the newest room on a local LiveKit server as an AGENT participant and replays what the
real worker does on the wire: agent-state attributes, lk.transcription text streams for both
sides, and JSON events on the 'demo' data topic. No audio. Used to reproduce client crashes."""
import asyncio, json, os, sys, time, uuid
from livekit import api, rtc

URL = os.environ.get("LK_URL", "ws://127.0.0.1:7880")
HTTP = URL.replace("ws://", "http://")
KEY, SECRET = "devkey", "secret"

async def newest_room():
    c = api.LiveKitAPI(HTTP, KEY, SECRET)
    try:
        for _ in range(60):
            r = await c.room.list_rooms(api.ListRoomsRequest())
            live = [x for x in r.rooms if x.num_participants > 0]
            if live:
                return sorted(live, key=lambda x: x.creation_time)[-1].name
            await asyncio.sleep(0.5)
    finally:
        await c.aclose()
    raise SystemExit("no room appeared")

async def stream(room: rtc.Room, text: str, *, sender: str | None, track_id: str | None, final: bool, seg: str):
    attrs = {"lk.segment_id": seg, "lk.transcription_final": "true" if final else "false"}
    if track_id: attrs["lk.transcribed_track_id"] = track_id
    kw = dict(topic="lk.transcription", attributes=attrs)
    if sender: kw["sender_identity"] = sender
    w = await room.local_participant.stream_text(**kw)
    for word in text.split(" "):
        await w.write(word + " ")
        await asyncio.sleep(0.03)
    await w.aclose()

async def main():
    room_name = await newest_room()
    print("joining", room_name, flush=True)
    tok = (api.AccessToken(KEY, SECRET).with_identity("agent-fake").with_kind("agent")
           .with_grants(api.VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=True, can_publish_data=True, can_update_own_metadata=True)).to_jwt())
    room = rtc.Room()
    await room.connect(URL, tok)
    t0 = time.time()
    async def pub(type_, **p):
        msg = {"type": type_, "mode": "live", "ts": round(time.time() - t0, 3), **p}
        await room.local_participant.publish_data(json.dumps(msg).encode(), topic="demo", reliable=True)
    async def state(s):
        await room.local_participant.set_attributes({"lk.agent.state": s})
    await asyncio.sleep(1)
    user = next((p for p in room.remote_participants.values()), None)
    user_id = user.identity if user else None
    user_track = next((t.sid for t in (user.track_publications.values() if user else [])), None)
    print("user", user_id, "track", user_track, flush=True)
    await state("initializing"); await pub("hello", agent="fake", stack={"s2s": "fake"})
    await asyncio.sleep(0.5); await state("listening"); await pub("agent_state", old="initializing", new="listening")
    # user speaks
    await pub("user_state", old="listening", new="speaking")
    seg = uuid.uuid4().hex[:12]
    await stream(room, "Hi do you have any two bedrooms", sender=user_id, track_id=user_track, final=False, seg=seg)
    await stream(room, "Hi, do you have any two-bedrooms opening up next month?", sender=user_id, track_id=user_track, final=True, seg=seg)
    await pub("user_state", old="speaking", new="listening"); await pub("user_final", text="Hi, do you have any two-bedrooms opening up next month?")
    await pub("metrics", kind="eou_metrics", data={"end_of_utterance_delay": 0.42, "transcription_delay": 0.1})
    await state("thinking"); await pub("agent_state", old="listening", new="thinking")
    await pub("tool", phase="started", call_id="c1", name="check_availability", arguments='{"bedrooms": 2}')
    await asyncio.sleep(0.3)
    await pub("tool", phase="ended", call_id="c1", status="completed", message=None)
    await pub("tool_result", call_id="c1", name="check_availability", arguments='{"bedrooms": 2}', output={"count": 2}, is_error=None)
    await state("speaking"); await pub("agent_state", old="thinking", new="speaking")
    aseg = uuid.uuid4().hex[:12]
    await stream(room, "Sure, two are opening up: 5A at twenty one fifty and 7D at nineteen ninety.", sender=None, track_id=None, final=True, seg=aseg)
    await pub("metrics", kind="realtime_model_metrics", data={"input_tokens": 120, "output_tokens": 40})
    await pub("overlap", is_interruption=True, agent_ended=True)
    await state("listening"); await pub("agent_state", old="speaking", new="listening")
    await asyncio.sleep(3)
    print("done", flush=True)
    await room.disconnect()

asyncio.run(main())
