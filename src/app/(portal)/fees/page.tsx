import { getAllFees } from "@/lib/sheets/fees";
import FeesTable from "./FeesTable";

export const dynamic = "force-dynamic";

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student } = await searchParams;
  let fees: Awaited<ReturnType<typeof getAllFees>> = [];
  let error: string | null = null;

  try {
    fees = await getAllFees();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load fees";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Fees</h1>
        <p className="text-sm text-slate-500 mt-1">
          {fees.length} students · click any cell to update payment amount
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <FeesTable fees={fees} highlightStudent={student} />
    </div>
  );
}
