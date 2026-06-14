"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users, IndianRupee, AlertCircle, CheckCircle,
  TrendingUp, GraduationCap, RefreshCw,
} from "lucide-react";
import type { FeeRecord } from "@/lib/sheets/fees";
import { gradeChartRows } from "@/lib/sort-by-grade";
import { canonicalClassLabel } from "@/lib/fees/structure";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { feesListUrl, portalFetch } from "@/lib/portal-fetch";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function DashboardClient() {
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch(feesListUrl());
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
        <p className="text-sm">Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={load}
          className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalExpected = fees.reduce((s, f) => s + f.totalFee, 0);
  const totalCollected = fees.reduce((s, f) => s + f.totalPaid, 0);
  const totalPending = totalExpected - totalCollected;
  const fullyPaid = fees.filter((f) => f.totalFee > 0 && f.balance <= 0).length;
  const hasPending = fees.filter((f) => f.totalFee > 0 && f.balance > 0).length;
  const noFeeSet = fees.filter((f) => f.totalFee <= 0).length;
  const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

  const classMap: Record<string, number> = {};
  for (const f of fees) {
    const cls = canonicalClassLabel(f.className);
    classMap[cls] = (classMap[cls] ?? 0) + 1;
  }
  const classesByGrade = gradeChartRows(classMap);
  /** Fixed bar scale so largest classes don't always fill the track */
  const CLASS_CHART_SCALE_MAX = 100;

  const stats = [
    { label: "Total Students", value: fees.length.toString(), sub: `active students (Pass out hidden)`, icon: Users, color: "bg-blue-50 text-blue-600", href: "/students" },
    { label: "Total Collected", value: fmt(totalCollected), sub: `${collectionRate.toFixed(1)}% of expected`, icon: IndianRupee, color: "bg-green-50 text-green-600", href: "/fees" },
    { label: "Pending Amount", value: fmt(totalPending), sub: `${hasPending} students with balance`, icon: AlertCircle, color: "bg-amber-50 text-amber-600", href: "/pending" },
    { label: "Fully Paid", value: fullyPaid.toString(), sub: `of ${fees.length - noFeeSet} with fees set`, icon: CheckCircle, color: "bg-emerald-50 text-emerald-600", href: "/fees" },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {stats.map(({ label, value, sub, icon: Icon, color, href }) => (
          <Link key={label} href={href} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
                <p className="text-xs text-slate-400 mt-1">{sub}</p>
              </div>
              <div className={`rounded-lg p-2.5 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-700">Fee Collection Progress</h2>
          </div>
          <span className="text-sm font-medium text-slate-600">{collectionRate.toFixed(1)}% collected</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div className="bg-blue-600 h-3 rounded-full transition-all" style={{ width: `${Math.min(collectionRate, 100)}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span>Collected: {fmt(totalCollected)}</span>
          <span>Expected: {fmt(totalExpected)}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-700">Students by Class</h2>
          </div>
          <div className="space-y-3">
            {classesByGrade.map(([cls, count]) => {
              const pct = Math.min((count / CLASS_CHART_SCALE_MAX) * 100, 100);
              return (
                <div key={`cls-${cls}`} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-28 shrink-0 truncate">{cls}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div className="bg-blue-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
    </>
  );
}
