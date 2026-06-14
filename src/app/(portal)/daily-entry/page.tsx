import { Suspense } from "react";
import DailyEntryForm from "./DailyEntryForm";

export default function DailyEntryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">Daily Fees Entry</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record individual fee payments — each entry is logged with date and amount, and synced to the Daily Fees Log tab on Google Sheets
        </p>
      </div>
      <Suspense>
        <DailyEntryForm />
      </Suspense>
    </div>
  );
}
