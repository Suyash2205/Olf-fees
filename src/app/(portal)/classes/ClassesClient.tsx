"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { GraduationCap, Users, IndianRupee, AlertCircle, RefreshCw } from "lucide-react";
import type { FeeRecord } from "@/lib/sheets/fees";
import { canonicalClassLabel } from "@/lib/fees/structure";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { feesListUrl, portalFetch } from "@/lib/portal-fetch";
import { classSortIndex } from "@/lib/sort-by-grade";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ClassesClient() {
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch(feesListUrl(true));
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: FeeRecord[] = await res.json();
      setFees(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  usePortalRefresh(load);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading classes…</p>
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

  const classMap: Record<string, { name: string; feeCount: number; totalFee: number; totalPaid: number; balance: number }> = {};
  for (const f of fees) {
    const cls = canonicalClassLabel(f.className);
    if (!classMap[cls]) classMap[cls] = { name: cls, feeCount: 0, totalFee: 0, totalPaid: 0, balance: 0 };
    classMap[cls].feeCount++;
    classMap[cls].totalFee += f.totalFee;
    classMap[cls].totalPaid += f.totalPaid;
    classMap[cls].balance += f.balance;
  }
  const classes = Object.values(classMap).sort(
    (a, b) => classSortIndex(a.name) - classSortIndex(b.name)
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {classes.map((cls) => {
        const collectionPct = cls.totalFee > 0 ? (cls.totalPaid / cls.totalFee) * 100 : 0;
        return (
          <div key={`cls-${cls.name}`} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-blue-600" />
                </div>
                <h2 className="font-semibold text-slate-800">{cls.name}</h2>
              </div>
              <Link href={`/fees?student=${encodeURIComponent(cls.name)}`} className="text-xs text-blue-600 hover:underline">
                View fees
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm mb-4">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">Students</p>
                  <p className="font-semibold text-slate-700">{cls.feeCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">Collected</p>
                  <p className="font-semibold text-green-700">{fmt(cls.totalPaid)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">Pending</p>
                  <p className={`font-semibold ${cls.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                    {fmt(cls.balance)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(collectionPct, 100)}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{collectionPct.toFixed(1)}% of {fmt(cls.totalFee)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
