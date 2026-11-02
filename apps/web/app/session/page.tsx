import { Suspense } from "react";
import SessionClient from "./SessionClient";

export default function SessionPage() {
  return (
    <Suspense fallback={<p className="note">Loading…</p>}>
      <SessionClient />
    </Suspense>
  );
}
