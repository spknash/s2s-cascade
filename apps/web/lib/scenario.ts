export const SCENARIO = [
  {
    step: 1,
    say: "Hi, do you have any two-bedrooms opening up in the next month?",
    tests: "Tool call: availability lookup with bedrooms=2.",
  },
  {
    step: 2,
    say: "Actually, wait... make that a one-bedroom.",
    tests: "Interrupt mid-answer. Does it stop, re-run the lookup, and not repeat the old result?",
  },
  {
    step: 3,
    say: "Book me a tour Saturday at two... no, three pm. My name is Ana Reyes.",
    tests: "Tool call with a self-correction inside one sentence. Check the time it books.",
  },
  {
    step: 4,
    say: "One more thing, I'm in unit 5A and my kitchen sink is leaking. Can you log that?",
    tests: "Second tool call, different tool. Should flag it as urgent.",
  },
] as const;
