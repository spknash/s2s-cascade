import Link from "next/link";
import { MODES, type Mode } from "@/lib/modes";
import { SCENARIO } from "@/lib/scenario";

const ORDER: Mode[] = ["cascade", "live", "live-nobackend"];

export default function Home() {
  return (
    <main>
      <h1>Same agent. Two voice architectures.</h1>
      <p className="lede">
        Sam is a leasing-office receptionist with four tools: check availability, book a tour, file a
        maintenance request, look up office hours. Talk to Sam on each stack, read the same four lines, and
        watch latency, interruption handling, tool calls and cost side by side.
      </p>

      <div className="grid" style={{ marginBottom: 24 }}>
        {ORDER.map((m) => {
          const d = MODES[m];
          return (
            <div className="card" key={m} style={{ borderTopColor: d.accent, borderTopWidth: 3 }}>
              <h3>{d.label}</h3>
              <div className="stack">{d.stack}</div>
              <p>{d.blurb}</p>
              <Link className={`btn ${m === "live" ? "primary" : ""}`} href={`/session?mode=${m}`}>
                Talk to Sam on {d.short}
              </Link>
            </div>
          );
        })}
      </div>

      <div className="card scenario">
        <h2>The script</h2>
        <p className="note" style={{ marginBottom: 12 }}>
          Read these aloud, in order, on each stack. Step 2 is meant to be said while Sam is still answering step 1.
        </p>
        <ol>
          {SCENARIO.map((s) => (
            <li key={s.step}>
              <div className="say">&ldquo;{s.say}&rdquo;</div>
              <div className="tests">{s.tests}</div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
