import { Suspense } from "react";
import Demo from "@/components/Demo";

export default function Home() {
  return (
    <Suspense>
      <Demo />
    </Suspense>
  );
}
