"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { isMode, MODES, type Mode } from "@/lib/modes";
import Stage from "./Stage";

const ORDER: Mode[] = ["cascade", "live", "live-nobackend"];
type Conn = { token: string; url: string; roomName: string };

export default function Demo() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("mode");
  const [mode, setMode] = useState<Mode>(isMode(initial) ? initial : "live");
  const [conn, setConn] = useState<Conn | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (m: Mode) => {
    setMode(m);
    router.replace(`/?mode=${m}`, { scroll: false });
  };

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
      if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
      setConn(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [mode]);

  const d = MODES[mode];

  return (
    <div className="wrap">
      <div className="top">
        <div className="wordmark">
          Sam <span>· Maple Court leasing</span>
        </div>
        <div className="seg" role="group" aria-label="Voice architecture">
          {ORDER.map((m) => (
            <button key={m} aria-pressed={m === mode} onClick={() => pick(m)} disabled={!!conn}>
              {MODES[m].short}
            </button>
          ))}
        </div>
      </div>

      {!conn ? (
        <div className="hero">
          <button className="play" onClick={start} disabled={busy} aria-label="Start conversation">
            {busy ? <Spinner /> : <PlayIcon />}
          </button>
          <h1>{d.label}</h1>
          <p className="mono" style={{ color: "var(--faint)" }}>{d.stack}</p>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <LiveKitRoom serverUrl={conn.url} token={conn.token} connect audio video={false} onDisconnected={() => setConn(null)} onError={(e) => setError(e.message)}>
          <RoomAudioRenderer />
          <Stage mode={mode} onLeave={() => setConn(null)} />
          {error && <p className="error">{error}</p>}
        </LiveKitRoom>
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden style={{ animation: "spin 1s linear infinite" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}
