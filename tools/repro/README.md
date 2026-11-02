# Client-side reproduction without audio

Drives the web UI with a fake agent so page crashes can be reproduced headlessly.

1. Run a local LiveKit server in dev mode (`--dev --bind 127.0.0.1`; binary from livekit/livekit-server, or the Docker image).
2. Start the web app against it: `cd apps/web && env $(cat ../../tools/repro/web.env | xargs) pnpm dev -p 3126`.
3. `node tools/repro/run.cjs http://localhost:3126 live <python-with-livekit-sdk> tools/repro/fake_agent.py`

`fake_agent.py` joins the newest occupied room as an AGENT participant and replays what the real
worker publishes: `lk.agent.state` attributes, `lk.transcription` text streams for both sides, and
JSON events on the `demo` data topic. `run.cjs` opens the page in headless Chromium with a fake
microphone, clicks play, runs the fake agent, and prints the page text and console errors.
