/**
 * Per-session cost model. Rates verified against the OpenAI pricing page on 2026-11-02
 * are marked VERIFIED. Third-party rates are list prices that depend on plan and volume;
 * they are marked ESTIMATE and should be edited to match the account being demoed.
 */
export const PRICING = {
  live: {
    sessionPerMinute: 0.05, // VERIFIED gpt-live-1, billed per second
    backendInPerMTok: 0.1, // VERIFIED gpt-6-luna input
    backendOutPerMTok: 0.5, // VERIFIED gpt-6-luna output
    // rough tokens per delegated turn when the backend usage is not reported
    assumedBackendTokensPerTurn: { in: 1200, out: 120 },
  },
  cascade: {
    sttPerMinute: 0.0077, // ESTIMATE Deepgram Nova-3 streaming, pay-as-you-go
    llmInPerMTok: 2.0, // VERIFIED gpt-4.1 input
    llmOutPerMTok: 8.0, // VERIFIED gpt-4.1 output
    ttsPerCharacter: 0.00012, // ESTIMATE ElevenLabs Flash v2.5 at ~$0.12 per 1k chars
  },
} as const;

export type CostBreakdown = { label: string; usd: number; note?: string }[];

export function liveCost(elapsedSec: number, delegatedTurns: number, backendTokens?: { in: number; out: number }): CostBreakdown {
  const p = PRICING.live;
  const tok = backendTokens ?? {
    in: delegatedTurns * p.assumedBackendTokensPerTurn.in,
    out: delegatedTurns * p.assumedBackendTokensPerTurn.out,
  };
  return [
    { label: "gpt-live-1 session", usd: (elapsedSec / 60) * p.sessionPerMinute },
    {
      label: "gpt-6-luna backend",
      usd: (tok.in / 1e6) * p.backendInPerMTok + (tok.out / 1e6) * p.backendOutPerMTok,
      note: backendTokens ? undefined : "est. from turn count",
    },
  ];
}

export function cascadeCost(elapsedSec: number, llmTokens: { in: number; out: number }, ttsChars: number): CostBreakdown {
  const p = PRICING.cascade;
  return [
    { label: "Deepgram STT", usd: (elapsedSec / 60) * p.sttPerMinute, note: "est." },
    { label: "gpt-4.1", usd: (llmTokens.in / 1e6) * p.llmInPerMTok + (llmTokens.out / 1e6) * p.llmOutPerMTok },
    { label: "ElevenLabs TTS", usd: ttsChars * p.ttsPerCharacter, note: "est." },
  ];
}
