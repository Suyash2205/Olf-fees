import { Suspense } from "react";
import AttendanceRecordClient from "./AttendanceRecordClient";

export default function AttendanceRecordPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      }
    >
      <AttendanceRecordClient />
    </Suspense>
  );
}
