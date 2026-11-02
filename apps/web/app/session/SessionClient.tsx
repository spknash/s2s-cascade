"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { isMode, MODES } from "@/lib/modes";
import Session from "@/components/Session";

export default function SessionClient() {
  const params = useSearchParams();
  const mode = params.get("mode");
  if (!isMode(mode)) {
    return (
      <p>
        Unknown mode. <Link href="/">Pick one</Link>.
      </p>
    );
  }
  const d = MODES[mode];
  return (
    <main>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <span className="modeTag" style={{ background: d.accent }}>{d.label}</span>
        <span className="stack" style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{d.stack}</span>
      </div>
      <Session mode={mode} />
    </main>
  );
}
