# s2s-cascade: GPT-Live vs cascaded voice pipeline demo

Goal: a Vercel-hosted web app where a visitor talks to the same voice agent twice,
once powered by GPT-Live (full-duplex speech-to-speech) and once by the cascaded
stack Ruchir's team runs today (LiveKit + Deepgram/Soniox STT + GPT-4.1 + ElevenLabs TTS),
and sees the difference in feel, latency, interruption handling, tool-call reliability and cost.

## 1. Who it is for and what it has to prove

From the Oct 30 call with Ruchir (housing-industry AI communication, LiveKit cascade for most customers):

1. Full duplex with reliable tool calling. They tested GPT-Live ~5 hours and found tool calling weak.
   The demo must show tool calls succeeding through GPT-Live's delegation backend.
2. Conversational tone. Their agents sound like they are "reading an email". The demo must show
   natural pauses, back-channels, and interruptions handled mid-sentence.
3. Cost. Show a live per-minute cost estimate for both sides.

Scenario: a leasing-office receptionist for an apartment community. Tools: check unit availability,
schedule a tour, file a maintenance request, look up office hours. Generic tenant vocabulary, which
matches what they said about STT not being the bottleneck.

## 2. Demo format (recommended)

Single page, two panels, one agent persona, one scenario card.

- Panel A "Cascade": Deepgram (or Soniox) STT -> GPT-4.1 -> ElevenLabs TTS, orchestrated by LiveKit Agents.
- Panel B "GPT-Live": gpt-live-1 with Responses delegation to gpt-6-luna, same tools, same persona.
- Scenario card with 4 scripted prompts the visitor reads aloud, each designed to expose a difference:
  1. "Hi, do you have any two-bedrooms available next month?"  (tool call: availability)
  2. Interrupt the answer mid-sentence: "actually, make that a one-bedroom"  (barge-in + correction)
  3. "Book me a tour Saturday at 2... no wait, 3pm, and my name is ..."  (tool call with self-correction)
  4. "My sink is leaking, can you log that?"  (tool call: maintenance)
- Live metrics strip under each panel: time-to-first-audio per turn, number of interruptions handled,
  tool calls attempted / succeeded, running cost estimate.
- Transcript + tool-call log side by side, so a viewer can verify the tool arguments were right.

Modes:
- Live: visitor talks to one panel at a time (same mic), toggles, repeats the script.
- Replay: pre-recorded run of the scripted scenario on both sides, synced, with metrics. This is the
  version to send to Ruchir and to post; live demos fail on bad wifi.
- Optional third toggle from the Notion ideas list: GPT-Live with no backend vs with backend,
  to show why delegation is what makes tool calling work.

## 3. Architecture

Both agents run as LiveKit Agents workers so the transport is identical and the comparison is fair.
GPT-Live has a first-party LiveKit plugin (OpenAI plugin >= 1.8 Python / 1.x Node, or LiveKit Inference
model id `openai/gpt-live-1`).

```
Browser (Next.js on Vercel)
  |  WebRTC via LiveKit client SDK
  v
LiveKit Cloud room  <---- token minted by Next.js API route (LIVEKIT_API_KEY/SECRET)
  |
  +-- agent "cascade":  Deepgram STT -> GPT-4.1 -> ElevenLabs TTS   (LiveKit Agents, Python)
  +-- agent "live":     gpt-live-1, delegation=responses, backend gpt-6-luna
                        tools run in the worker, results returned via function_call_output
```

- Vercel hosts only the Next.js app and its API routes (token minting, cost math, metrics ingest).
  Vercel cannot host the long-running agent worker. Run the worker on LiveKit Cloud hosted agents
  (simplest), or Railway/Fly.io.
- Room metadata or a job dispatch name selects which agent joins ("cascade" or "live").
- Metrics come from LiveKit Agents metrics events (EOU delay, LLM TTFT, TTS TTFB) for the cascade,
  and from GPT-Live session events for the live side; both get published to the frontend over the
  LiveKit data channel and rendered in the strip.

Alternative considered and rejected: GPT-Live direct WebRTC from the browser (server only exchanges SDP,
which Vercel can do) plus a browser-orchestrated cascade. Fewer moving parts, but it is not Ruchir's
stack and client-side orchestration would make the cascade look worse than it is.

## 4. Cost model (verified from OpenAI pricing page, Nov 2 2026)

| Component | Price |
| --- | --- |
| gpt-live-1 session | $0.05 / minute, billed per second |
| gpt-6-luna backend (delegation) | $0.10 in / $0.50 out per 1M tokens |
| gpt-4.1 (cascade LLM) | $2.00 in / $8.00 out per 1M tokens |
| gpt-realtime-2.1 (for reference, not used) | $32 audio in / $64 audio out per 1M tokens |

Deepgram, Soniox and ElevenLabs per-minute rates: fill from their pricing pages before publishing numbers.

## 5. Repo layout

```
apps/web/          Next.js 15, App Router, Tailwind, @livekit/components-react
agents/            Python LiveKit Agents worker (both agents, selected by dispatch name)
  cascade_agent.py
  live_agent.py
  tools.py         shared fake leasing-office tools (deterministic, seeded data)
  metrics.py       publishes per-turn metrics to the room data channel
infra/             Dockerfile for the worker, livekit agent config
docs/              scenario script, recording checklist
```

## 6. Credentials needed and where to get them

| Secret | Get it at | Used by |
| --- | --- | --- |
| VERCEL_TOKEN | https://vercel.com/account/tokens | deploying from this environment |
| OPENAI_API_KEY (paid tier; GPT-Live is not on Free) | https://platform.openai.com/api-keys | both agents |
| LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET | https://cloud.livekit.io  (project -> Settings -> Keys) | web token route + worker |
| DEEPGRAM_API_KEY | https://console.deepgram.com/ | cascade STT |
| ELEVENLABS_API_KEY | https://elevenlabs.io/app/settings/api-keys | cascade TTS |
| SONIOX_API_KEY (optional, to A/B against Deepgram) | https://console.soniox.com/ | cascade STT |

Store them in the s2s-cascase cloud environment (cloud environment menu in the session title bar ->
Edit -> Network secrets) so future sessions have them, and in Vercel project env vars for the deployed app.

## 7. Build order

1. Scaffold Next.js app + LiveKit token route, deploy empty shell to Vercel.
2. Cascade agent with the four tools, verify end to end in the browser.
3. GPT-Live agent with Responses delegation and the same tools. Confirm tool calls land.
4. Metrics strip + transcript/tool log.
5. Scenario card, side-by-side layout, cost estimator.
6. Record the replay, polish, share.
