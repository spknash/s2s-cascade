export type Mode = "cascade" | "live" | "live-nobackend";

export const MODES: Record<
  Mode,
  { label: string; short: string; stack: string; blurb: string; accent: string }
> = {
  cascade: {
    label: "Cascade pipeline",
    short: "Cascade",
    stack: "Deepgram Nova-3 → GPT-4.1 → ElevenLabs Flash v2.5, on LiveKit Agents",
    blurb:
      "The production stack most voice agents run today. Three hops per turn: transcribe, think, synthesize.",
    accent: "#d97706",
  },
  live: {
    label: "GPT-Live (full duplex)",
    short: "GPT-Live",
    stack: "gpt-live-1 voice model, delegating tools to gpt-6-luna, on LiveKit Agents",
    blurb:
      "One speech-to-speech model that listens while it talks. Reasoning and tool calls are delegated to a backend model mid-conversation.",
    accent: "#2563eb",
  },
  "live-nobackend": {
    label: "GPT-Live, no backend",
    short: "GPT-Live (no tools)",
    stack: "gpt-live-1 alone, nothing delegated",
    blurb:
      "Same voice model with delegation switched off. Shows why the backend is what makes tool calls work.",
    accent: "#7c3aed",
  },
};

export function isMode(x: unknown): x is Mode {
  return typeof x === "string" && x in MODES;
}
