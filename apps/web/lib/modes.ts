export type Mode = "cascade" | "live" | "live-nobackend";

export const MODES: Record<
  Mode,
  { label: string; short: string; stack: string; blurb: string; accent: string }
> = {
  cascade: {
    label: "Cascade pipeline",
    short: "Cascade",
    stack: "deepgram nova-3 → gpt-4.1 → elevenlabs flash v2.5",
    blurb:
      "The production stack most voice agents run today. Three hops per turn: transcribe, think, synthesize.",
    accent: "#d97706",
  },
  live: {
    label: "GPT-Live (full duplex)",
    short: "GPT-Live",
    stack: "gpt-live-1 → gpt-6-luna for tools",
    blurb:
      "One speech-to-speech model that listens while it talks. Reasoning and tool calls are delegated to a backend model mid-conversation.",
    accent: "#2563eb",
  },
  "live-nobackend": {
    label: "GPT-Live, no backend",
    short: "GPT-Live, no tools",
    stack: "gpt-live-1, no tools",
    blurb:
      "Same voice model with delegation switched off. Shows why the backend is what makes tool calls work.",
    accent: "#7c3aed",
  },
};

export function isMode(x: unknown): x is Mode {
  return typeof x === "string" && x in MODES;
}
