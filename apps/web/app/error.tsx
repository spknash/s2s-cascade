"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wrap">
      <div className="hero">
        <h1>Something broke in the page</h1>
        <p className="mono" style={{ color: "var(--err)", whiteSpace: "pre-wrap", textAlign: "left", maxWidth: 720 }}>
          {error.message}
          {error.digest ? `\n(digest ${error.digest})` : ""}
          {error.stack ? `\n\n${error.stack.split("\n").slice(0, 6).join("\n")}` : ""}
        </p>
        <button className="stop" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
