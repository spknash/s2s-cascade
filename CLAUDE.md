# s2s-cascade: working notes for Claude

- Owner: Suhaas (GitHub spknash). Deliverable: a Vercel demo comparing GPT-Live (speech-to-speech) with a cascaded STT/LLM/TTS pipeline, aimed at Ruchir's team (LiveKit + Deepgram/Soniox + GPT-4.1 + ElevenLabs).
- Secrets live in `agents/.env` and `apps/web/.env.local` (gitignored) and in the s2s-cascase cloud environment's secrets. Never commit them. The Vercel token is in the environment, not the repo.
- Deploy targets: web -> Vercel project `s2s-cascade` (https://s2s-cascade.vercel.app); worker -> LiveKit Cloud agent `CA_z3eTUx9VxRZs` in us-east (`lk agent deploy` from `agents/`). The `lk` CLI is built from source with `-tags portaudio_system` because the vendored PortAudio submodule is not in the Go module cache.
- Preference: when a token, key or manual step is needed, give the direct link immediately. Do not ask the user to paste secrets into chat.
- The container cannot open WebSockets to livekit.cloud directly (no DNS outside the proxy), so the worker cannot run here. Test end to end against the deployed app with the Playwright runner in the scratchpad (fake microphone from a WAV).
