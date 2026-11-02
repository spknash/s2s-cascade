import type { Metadata } from "next";
import "./globals.css";
import "@livekit/components-styles";

export const metadata: Metadata = {
  title: "GPT-Live vs cascade: one voice agent, two engines",
  description: "Talk to the same leasing-office agent powered by a full-duplex speech-to-speech model and by a cascaded STT, LLM, TTS pipeline.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <div className="topbar">
            <a className="brand" href="/">
              s2s vs cascade <small>Maple Court leasing demo</small>
            </a>
            <a className="pill" href="https://github.com/spknash/s2s-cascade" target="_blank" rel="noreferrer">
              source
            </a>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
