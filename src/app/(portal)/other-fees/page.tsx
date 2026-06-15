import { Suspense } from "react";
import OtherFeesForm from "./OtherFeesForm";

export default function OtherFeesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">Other Fees Entry</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record one-time fees — bag, admission, books, bus, and more. Synced to the{" "}
          <strong>Other Fees Log</strong> tab on Google Sheets. Amounts are entered manually per student for now.
        </p>
      </div>
      <Suspense>
        <OtherFeesForm />
      </Suspense>
    </div>
  );
}
