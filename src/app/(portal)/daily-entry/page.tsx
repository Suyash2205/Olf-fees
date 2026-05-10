import { getAllFees } from "@/lib/sheets/fees";
import DailyEntryForm from "./DailyEntryForm";

export const dynamic = "force-dynamic";

export default async function DailyEntryPage() {
  let fees: Awaited<ReturnType<typeof getAllFees>> = [];
  let error: string | null = null;

  try {
    fees = await getAllFees();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load students";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Daily Entry</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record individual fee payments — each entry is logged with date and amount, and synced to Google Sheets
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <DailyEntryForm fees={fees} />
    </div>
  );
}
