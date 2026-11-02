"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarVisualizer,
  DisconnectButton,
  useDataChannel,
  useLocalParticipant,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import type { Mode } from "@/lib/modes";
import { SCENARIO } from "@/lib/scenario";
import { emptyTally, reduceEvent, type DemoEvent, type Tally } from "@/lib/events";
import { cascadeCost, liveCost } from "@/lib/pricing";

const dec = new TextDecoder();

type Segment = { id: string; who: "user" | "agent"; text: string; final: boolean; at: number };

export default function Stage({ mode, roomName, onLeave }: { mode: Mode; roomName: string; onLeave: () => void }) {
  const { state, audioTrack, agent } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const startedAt = useRef(Date.now());
  const [clock, setClock] = useState(0);

  useDataChannel("demo", (msg) => {
    try {
      const e = JSON.parse(dec.decode(msg.payload)) as DemoEvent;
      setEvents((prev) => [...prev, e]);
      setTally((t) => reduceEvent(t, e));
    } catch {
      /* ignore malformed */
    }
  });

  useEffect(() => {
    const id = setInterval(() => setClock(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // transcripts: LiveKit text streams on lk.transcription, one per participant segment
  const raw = useTranscriptions();
  const segments: Segment[] = useMemo(() => {
    const me = localParticipant?.identity;
    return raw.map((s) => {
      const info = s.streamInfo as { id: string; timestamp?: number; attributes?: Record<string, string> };
      const who: "user" | "agent" = s.participantInfo?.identity === me ? "user" : "agent";
      return {
        id: info.id,
        who,
        text: s.text,
        final: info.attributes?.["lk.transcription_final"] === "true",
        at: info.timestamp ?? 0,
      };
    });
  }, [raw, localParticipant?.identity]);

  const transcriptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [segments.length, segments[segments.length - 1]?.text]);

  const elapsed = Math.max(clock, tally.elapsedSec);
  const cost = mode === "cascade" ? cascadeCost(elapsed, tally.llmTokens, tally.ttsChars) : liveCost(elapsed, tally.delegatedTurns);
  const total = cost.reduce((a, b) => a + b.usd, 0);
  const measured = tally.turns.filter((t) => t.ttfaMs !== undefined);
  const medianTtfa = median(measured.map((t) => t.ttfaMs!));
  const toolsOk = tally.tools.filter((t) => t.status === "completed" && !t.isError).length;

  return (
    <div className="session">
      <div className="stage">
        <div className="card">
          <div className="viz">
            <BarVisualizer state={state} trackRef={audioTrack} barCount={7} options={{ minHeight: 8 }} style={{ height: 90 }} />
          </div>
          <div className="state" style={{ marginTop: 10, justifyContent: "space-between" }}>
            <span>
              <span className={`dot ${state}`} /> &nbsp;Sam is <b>{state}</b>
              {agent ? "" : " (waiting for the agent to join…)"}
            </span>
            <span>
              {fmtClock(elapsed)} &middot; <span className="note">{roomName}</span>
            </span>
          </div>
        </div>

        <div className="card">
          <h2>Transcript</h2>
          <div className="transcript" ref={transcriptRef}>
            {segments.length === 0 && <p className="note">Say hello. The transcript appears here as it is recognised.</p>}
            {segments.map((s) => (
              <div className={`msg ${s.who}`} key={s.id}>
                <span className="who">{s.who === "user" ? "You" : "Sam"}</span>
                {s.text}
              </div>
            ))}
          </div>
        </div>

        <div className="card scenario">
          <h2>Script</h2>
          <ol>
            {SCENARIO.map((s) => (
              <li key={s.step}>
                <div className="say">&ldquo;{s.say}&rdquo;</div>
                <div className="tests">{s.tests}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="stage">
        <div className="card">
          <h2>Live metrics</h2>
          <div className="metrics">
            <Metric k="Median time to first audio" v={medianTtfa === null ? "–" : `${medianTtfa} ms`} s={`${measured.length} turn${measured.length === 1 ? "" : "s"}`} />
            <Metric k="Interruptions" v={String(tally.interruptions)} s={tally.falseInterruptions ? `${tally.falseInterruptions} false` : "handled by agent"} />
            <Metric k="Tool calls" v={`${toolsOk}/${tally.tools.length}`} s="succeeded / attempted" />
            <Metric k="Cost so far" v={`$${total.toFixed(4)}`} s={`$${((total / Math.max(elapsed, 1)) * 60).toFixed(3)} per min`} />
          </div>

          {tally.turns.length > 0 && (
            <table className="turns" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Turn</th>
                  <th>TTFA</th>
                  {mode === "cascade" && (
                    <>
                      <th>EOU</th>
                      <th>LLM TTFT</th>
                      <th>TTS TTFB</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {tally.turns.slice(-8).map((t) => (
                  <tr key={t.index}>
                    <td>#{t.index}</td>
                    <td>{t.ttfaMs === undefined ? "…" : `${t.ttfaMs} ms`}</td>
                    {mode === "cascade" && (
                      <>
                        <td>{ms(t.breakdown?.eou)}</td>
                        <td>{ms(t.breakdown?.llmTtft)}</td>
                        <td>{ms(t.breakdown?.ttsTtfb)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="note" style={{ marginTop: 8 }}>
            TTFA is measured in the worker: from the moment it decides you stopped speaking to the first agent audio frame.
            {mode !== "cascade" && " Full-duplex turns overlap, so treat it as indicative."}
          </p>
        </div>

        <div className="card">
          <h2>Tool calls</h2>
          <div className="toollog">
            {tally.tools.length === 0 && <p className="note">Nothing yet. Steps 1, 3 and 4 of the script should each produce one.</p>}
            {tally.tools.map((t) => (
              <div className="tool" key={t.callId}>
                <span className="name">{t.name}</span>({t.arguments}){" "}
                <span className={t.endedAt === undefined ? "pending" : t.isError || t.status === "error" ? "err" : "ok"}>
                  {t.endedAt === undefined ? "running" : t.isError ? "error" : `${Math.round((t.endedAt - t.startedAt) * 1000)} ms`}
                </span>
                {t.output !== undefined && <pre>{typeof t.output === "string" ? t.output : JSON.stringify(t.output)}</pre>}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Cost</h2>
          <div className="cost">
            {cost.map((c) => (
              <div key={c.label}>
                <span>
                  {c.label} {c.note && <span className="note">({c.note})</span>}
                </span>
                <span>${c.usd.toFixed(4)}</span>
              </div>
            ))}
            <div className="total">
              <span>Total</span>
              <span>${total.toFixed(4)}</span>
            </div>
          </div>
          {tally.stack && (
            <p className="note" style={{ marginTop: 8, fontFamily: "var(--mono)" }}>
              {Object.entries(tally.stack)
                .map(([k, v]) => `${k}=${v}`)
                .join("  ")}
            </p>
          )}
          {tally.errors.length > 0 && <p className="err">{tally.errors[tally.errors.length - 1]}</p>}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <DisconnectButton className="btn danger" onClick={onLeave}>
            End session
          </DisconnectButton>
          <button
            className="btn"
            onClick={() => {
              const blob = new Blob([JSON.stringify({ mode, roomName, events, tally }, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${roomName}.json`;
              a.click();
            }}
          >
            Download run log
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ k, v, s }: { k: string; v: string; s?: string }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

function ms(x?: number) {
  return x === undefined ? "–" : `${Math.round(x * 1000)}`;
}
function fmtClock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
