import { Suspense } from "react";
import CompleteAdmissionClient from "./CompleteAdmissionClient";

export default function CompleteAdmissionPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-slate-400 text-sm">Loading…</div>
      }
    >
      <CompleteAdmissionClient />
    </Suspense>
  );
}
