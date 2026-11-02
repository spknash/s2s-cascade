"use client";

import { useCallback, useEffect, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import type { Mode } from "@/lib/modes";
import Stage from "./Stage";

type Conn = { token: string; url: string; roomName: string };

export default function Session({ mode }: { mode: Mode }) {
  const [conn, setConn] = useState<Conn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    setConn(null);
  }, [mode]);

  if (!conn) {
    return (
      <div className="card">
        <h2>Ready when you are</h2>
        <p className="note">
          Your browser will ask for the microphone. A fresh room is created per session and the {MODE_LABEL[mode]} agent
          is dispatched into it. Use headphones so Sam does not hear itself.
        </p>
        <button className="btn primary" onClick={start} disabled={busy}>
          {busy ? "Connecting…" : "Start talking"}
        </button>
        {error && <p className="err">{error}</p>}
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={conn.url}
      token={conn.token}
      connect
      audio
      video={false}
      onDisconnected={() => setConn(null)}
      onError={(e) => setError(e.message)}
      data-lk-theme="default"
    >
      <RoomAudioRenderer />
      <Stage mode={mode} roomName={conn.roomName} onLeave={() => setConn(null)} />
      {error && <p className="err">{error}</p>}
    </LiveKitRoom>
  );
}

const MODE_LABEL: Record<Mode, string> = { cascade: "cascade", live: "GPT-Live", "live-nobackend": "GPT-Live (no tools)" };
