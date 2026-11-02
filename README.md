# s2s-cascade

One voice agent, two architectures, side by side:

- **Cascade**: Deepgram Nova-3 (STT) → GPT-4.1 → ElevenLabs Flash v2.5 (TTS), orchestrated by LiveKit Agents. The stack most production voice agents run today.
- **GPT-Live**: OpenAI's `gpt-live-1` full-duplex speech-to-speech model, delegating reasoning and tool calls to `gpt-6-luna`, also on LiveKit Agents.
- **GPT-Live, no tools**: the same voice model with nothing to delegate to, to show why the backend is what makes tool calling work.

The agent, "Sam", is a leasing-office receptionist with four tools (availability, book a tour, maintenance request, office hours). Visitors read a four-line script on each stack and the UI shows time-to-first-audio per turn, interruptions handled, tool calls attempted and succeeded, and a running cost estimate.

## Layout

```
apps/web/    Next.js app (Vercel). Mints LiveKit tokens with an agent-dispatch entry, renders the session UI.
agents/      Python LiveKit Agents worker (LiveKit Cloud). One dispatch name, three modes picked by job metadata.
PLAN.md      Why it is built this way.
```

## Run locally

Web:

```bash
cd apps/web
cp .env.example .env.local   # fill in LiveKit creds
pnpm install && pnpm dev
```

Worker (needs OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVEN_API_KEY, LIVEKIT_* in `agents/.env`):

```bash
cd agents
uv sync
uv run agent.py dev
```

## Deploy

```bash
# worker -> LiveKit Cloud (builds from the Dockerfile, injects agents/.env as secrets)
cd agents && lk agent create --region us-east --secrets-file .env .
# later updates
lk agent deploy

# web -> Vercel
cd apps/web && vercel deploy --prod
```

Vercel env vars: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `AGENT_NAME=s2s-cascade`.

## How the comparison stays fair

Both agents run in the same framework, same room transport, same tools, same persona, same scripted inputs. The worker publishes every state change, metric and tool call on a data channel, and the UI folds them into one tally per session (`apps/web/lib/events.ts`). Time-to-first-audio is measured in the worker from end-of-user-speech to first agent audio. Cost uses OpenAI list prices and editable estimates for Deepgram and ElevenLabs (`apps/web/lib/pricing.ts`).
