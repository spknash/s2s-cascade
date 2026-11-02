"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DisconnectButton, useDataChannel, useLocalParticipant, useTranscriptions, useVoiceAssistant } from "@livekit/components-react";
import type { Mode } from "@/lib/modes";
import { SCENARIO } from "@/lib/scenario";
import { emptyTally, reduceEvent, type DemoEvent, type Tally } from "@/lib/events";
import { cascadeCost, liveCost } from "@/lib/pricing";

const dec = new TextDecoder();
type Segment = { id: string; who: "user" | "agent"; text: string };

export default function Stage({ mode, onLeave }: { mode: Mode; onLeave: () => void }) {
  const { state, agent } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const [tally, setTally] = useState<Tally>(emptyTally);
  const startedAt = useRef(Date.now());
  const [clock, setClock] = useState(0);

  useDataChannel("demo", (msg) => {
    try {
      const e = JSON.parse(dec.decode(msg.payload)) as DemoEvent;
      setTally((t) => reduceEvent(t, e));
    } catch {
      /* ignore */
    }
  });

  useEffect(() => {
    const id = setInterval(() => setClock(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const raw = useTranscriptions();
  const segments: Segment[] = useMemo(() => {
    const me = localParticipant?.identity;
    return raw.map((s) => ({
      id: (s.streamInfo as { id: string }).id,
      who: s.participantInfo?.identity === me ? "user" : "agent",
      text: s.text,
    }));
  }, [raw, localParticipant?.identity]);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [segments.length, segments[segments.length - 1]?.text]);

  const elapsed = Math.max(clock, tally.elapsedSec);
  const cost = mode === "cascade" ? cascadeCost(elapsed, tally.llmTokens, tally.ttsChars) : liveCost(elapsed, tally.delegatedTurns);
  const total = cost.reduce((a, b) => a + b.usd, 0);
  const ttfa = tally.turns.filter((t) => t.ttfaMs !== undefined).map((t) => t.ttfaMs!);
  const med = median(ttfa);
  const usedTools = new Set(tally.tools.map((t) => t.name));
  const stepDone = [usedTools.has("check_availability"), tally.interruptions > 0, usedTools.has("schedule_tour"), usedTools.has("file_maintenance_request")];

  return (
    <div className="live">
      <div>
        <div className="status">
          <span className={`dot ${state}`} />
          <span>{agent ? state : "connecting"}</span>
          {med !== null && (
            <span>
              · first audio {med} ms{tally.interruptions ? ` · ${tally.interruptions} interruption${tally.interruptions > 1 ? "s" : ""}` : ""}
            </span>
          )}
          <span className="right mono">{fmt(elapsed)}</span>
        </div>

        <div className="transcript">
          {segments.length === 0 && <div className="empty">Say hello.</div>}
          {segments.map((s) => (
            <div className={`line ${s.who}`} key={s.id}>
              <span className="who">{s.who === "user" ? "you" : "sam"}</span>
              {s.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <DisconnectButton className="stop" onClick={onLeave}>
          <i /> End
        </DisconnectButton>
      </div>

      <aside className="side">
        <section>
          <h4>Try saying</h4>
          <ol>
            {SCENARIO.map((s, i) => (
              <li key={s.step} className={stepDone[i] ? "done" : ""}>
                {s.say}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h4>Tool calls</h4>
          <div className="tools mono">
            {tally.tools.length === 0 && <span className="kv">none yet</span>}
            {tally.tools.map((t) => (
              <div key={t.callId} title={t.arguments}>
                <span>{t.name}</span>
                <span className={t.endedAt === undefined ? "pending" : t.isError ? "err" : "ok"}>
                  {t.endedAt === undefined ? "…" : t.isError ? "error" : `${Math.round((t.endedAt - t.startedAt) * 1000)} ms`}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4>Cost</h4>
          <div className="kv">
            <b>${total.toFixed(3)}</b> so far · <b>${((total / Math.max(elapsed, 1)) * 60).toFixed(3)}</b>/min
          </div>
          <div className="mono" style={{ color: "var(--faint)", marginTop: 4 }}>
            {cost.map((c) => `${c.label} $${c.usd.toFixed(3)}`).join(" · ")}
          </div>
        </section>

        {tally.errors.length > 0 && <p className="error">{tally.errors[tally.errors.length - 1]}</p>}
      </aside>
    </div>
  );
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
