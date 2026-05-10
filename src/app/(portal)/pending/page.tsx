import { getPendingFees } from "@/lib/sheets/fees";
import Link from "next/link";
import { AlertCircle, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function PendingFeesPage() {
  let pending: Awaited<ReturnType<typeof getPendingFees>> = [];
  let error: string | null = null;

  try {
    pending = await getPendingFees();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load pending fees";
  }

  const totalPending = pending.reduce((s, f) => s + f.balance, 0);
  const totalExpected = pending.reduce((s, f) => s + f.totalFee, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Pending Fees</h1>
        <p className="text-sm text-slate-500 mt-1">
          {pending.length} students with outstanding balance
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total Outstanding</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{fmt(totalPending)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Students Pending</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{pending.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">% of Expected Unpaid</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">
            {totalExpected > 0 ? ((totalPending / totalExpected) * 100).toFixed(1) : "0"}%
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Fee</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paid</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Balance</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Progress</th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pending.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <AlertCircle className="w-8 h-8" />
                    <p>All fees are up to date!</p>
                  </div>
                </td>
              </tr>
            ) : (
              pending.map((f, i) => (
                <tr key={`${f.srNo}-${i}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 text-xs">{f.srNo}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{f.studentName}</td>
                  <td className="px-4 py-3 text-slate-500">{f.className || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(f.totalFee)}</td>
                  <td className="px-4 py-3 text-green-700">{fmt(f.totalPaid)}</td>
                  <td className="px-4 py-3 font-bold text-red-600">{fmt(f.balance)}</td>
                  <td className="px-4 py-3 w-32">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div
                          className="bg-amber-400 h-1.5 rounded-full"
                          style={{ width: `${Math.min(f.percentPaid, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-10 text-right">
                        {f.percentPaid.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/fees?student=${encodeURIComponent(f.studentName)}`}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                      title="Update fees"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
