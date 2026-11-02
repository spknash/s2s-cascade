/** Messages the worker publishes on the "demo" data topic. Mirrors agents/agent.py. */
export type DemoEvent =
  | { type: "hello"; mode: string; ts: number; agent: string; stack: Record<string, string> }
  | { type: "metrics"; mode: string; ts: number; kind: string; data: Record<string, unknown> }
  | { type: "agent_state"; mode: string; ts: number; old: string; new: string }
  | { type: "user_state"; mode: string; ts: number; old: string; new: string }
  | { type: "user_final"; mode: string; ts: number; text: string }
  | { type: "tool"; mode: string; ts: number; phase: "started"; call_id: string; name: string; arguments: string }
  | { type: "tool"; mode: string; ts: number; phase: "ended"; call_id: string; status: string; message?: string }
  | { type: "tool_result"; mode: string; ts: number; call_id: string; name: string; arguments: string; output: unknown; is_error: boolean | null }
  | { type: "overlap"; mode: string; ts: number; is_interruption: boolean; agent_ended: boolean }
  | { type: "false_interruption"; mode: string; ts: number }
  | { type: "error"; mode: string; ts: number; error: string; source?: string | null };

export type ToolCall = {
  callId: string;
  name: string;
  arguments: string;
  startedAt: number;
  endedAt?: number;
  status?: string;
  output?: unknown;
  isError?: boolean | null;
};

export type Turn = {
  index: number;
  userEndedAt: number; // worker-relative seconds
  agentStartedAt?: number;
  ttfaMs?: number;
  breakdown?: { eou?: number; llmTtft?: number; ttsTtfb?: number };
};

export type Tally = {
  elapsedSec: number;
  turns: Turn[];
  tools: ToolCall[];
  interruptions: number;
  falseInterruptions: number;
  llmTokens: { in: number; out: number };
  ttsChars: number;
  realtimeTokens: { in: number; out: number };
  delegatedTurns: number;
  errors: string[];
  stack?: Record<string, string>;
};

export const emptyTally = (): Tally => ({
  elapsedSec: 0,
  turns: [],
  tools: [],
  interruptions: 0,
  falseInterruptions: 0,
  llmTokens: { in: 0, out: 0 },
  ttsChars: 0,
  realtimeTokens: { in: 0, out: 0 },
  delegatedTurns: 0,
  errors: [],
});

/** Fold one worker event into the running tally. Pure, so it is easy to test and to replay. */
export function reduceEvent(t: Tally, e: DemoEvent): Tally {
  const n: Tally = { ...t, turns: [...t.turns], tools: [...t.tools], errors: [...t.errors] };
  n.elapsedSec = Math.max(n.elapsedSec, e.ts);
  switch (e.type) {
    case "hello":
      n.stack = e.stack;
      break;
    case "user_state":
      // user stopped speaking -> open a turn waiting for agent audio
      if (e.old === "speaking" && e.new === "listening") {
        const last = n.turns[n.turns.length - 1];
        if (!last || last.agentStartedAt !== undefined) {
          n.turns.push({ index: n.turns.length + 1, userEndedAt: e.ts });
        } else {
          last.userEndedAt = e.ts; // user resumed and stopped again; measure from the latest stop
        }
      }
      break;
    case "agent_state":
      if (e.new === "speaking") {
        const open = [...n.turns].reverse().find((x) => x.agentStartedAt === undefined);
        if (open) {
          open.agentStartedAt = e.ts;
          open.ttfaMs = Math.max(0, Math.round((e.ts - open.userEndedAt) * 1000));
        }
      }
      break;
    case "metrics": {
      const d = e.data as Record<string, number | undefined>;
      const last = n.turns[n.turns.length - 1];
      if (e.kind === "eou_metrics" && last) {
        last.breakdown = { ...last.breakdown, eou: d.end_of_utterance_delay };
      } else if (e.kind === "llm_metrics") {
        n.llmTokens = { in: n.llmTokens.in + (d.prompt_tokens ?? 0), out: n.llmTokens.out + (d.completion_tokens ?? 0) };
        if (last) last.breakdown = { ...last.breakdown, llmTtft: d.ttft };
      } else if (e.kind === "tts_metrics") {
        n.ttsChars += d.characters_count ?? 0;
        if (last && last.breakdown?.ttsTtfb === undefined) last.breakdown = { ...last.breakdown, ttsTtfb: d.ttfb };
      } else if (e.kind === "realtime_model_metrics") {
        n.realtimeTokens = { in: n.realtimeTokens.in + (d.input_tokens ?? 0), out: n.realtimeTokens.out + (d.output_tokens ?? 0) };
      }
      break;
    }
    case "tool":
      if (e.phase === "started") {
        n.tools.push({ callId: e.call_id, name: e.name, arguments: e.arguments, startedAt: e.ts });
        n.delegatedTurns += 1;
      } else {
        const tc = n.tools.find((x) => x.callId === e.call_id);
        if (tc) {
          tc.endedAt = e.ts;
          tc.status = e.status;
        }
      }
      break;
    case "tool_result": {
      let tc = n.tools.find((x) => x.callId === e.call_id);
      if (!tc) {
        tc = { callId: e.call_id, name: e.name, arguments: e.arguments, startedAt: e.ts };
        n.tools.push(tc);
        n.delegatedTurns += 1;
      }
      tc.output = e.output;
      tc.isError = e.is_error;
      tc.endedAt = tc.endedAt ?? e.ts;
      tc.status = tc.status ?? (e.is_error ? "error" : "completed");
      break;
    }
    case "overlap":
      if (e.is_interruption) n.interruptions += 1;
      break;
    case "false_interruption":
      n.falseInterruptions += 1;
      break;
    case "error":
      n.errors.push(e.error);
      break;
  }
  return n;
}
