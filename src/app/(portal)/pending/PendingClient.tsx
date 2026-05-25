"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, RefreshCw } from "lucide-react";
import type { PendingFeeSummary } from "@/lib/sheets/fees";
import { compareByGradeThenName } from "@/lib/sort-by-grade";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function PendingClient() {
  const [pending, setPending] = useState<PendingFeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fees");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const fees = await res.json();
      const result: PendingFeeSummary[] = fees
        .filter((f: { balance: number }) => f.balance > 0)
        .map((f: { srNo: string; studentName: string; className: string; totalFee: number; totalPaid: number; balance: number }) => ({
          srNo: f.srNo,
          studentName: f.studentName,
          className: f.className,
          totalFee: f.totalFee,
          totalPaid: f.totalPaid,
          balance: f.balance,
          percentPaid: f.totalFee > 0 ? (f.totalPaid / f.totalFee) * 100 : 0,
        }))
        .sort((a: PendingFeeSummary, b: PendingFeeSummary) => {
          const byGrade = compareByGradeThenName(
            a.className,
            b.className,
            a.studentName,
            b.studentName
          );
          if (byGrade !== 0) return byGrade;
          return a.studentName.localeCompare(b.studentName, "en", { sensitivity: "base" });
        });
      setPending(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading pending fees…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={load} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Retry
        </button>
      </div>
    );
  }

  const totalPending = pending.reduce((s, f) => s + f.balance, 0);
  const totalExpected = pending.reduce((s, f) => s + f.totalFee, 0);

  return (
    <>
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
                        <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${Math.min(f.percentPaid, 100)}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 w-10 text-right">{f.percentPaid.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/fees?student=${encodeURIComponent(f.studentName)}`} className="text-slate-400 hover:text-blue-600 transition-colors" title="Update fees">
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
