"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Users,
  AlertCircle,
  TrendingUp,
  GraduationCap,
  RefreshCw,
  CalendarRange,
  ArrowDownRight,
  ArrowUpRight,
  Scale,
  Receipt,
  Wallet,
} from "lucide-react";
import type { FeeRecord } from "@/lib/sheets/fees";
import type { DailyEntry } from "@/lib/sheets/dailyLog";
import type { OtherFeeEntry } from "@/lib/sheets/otherFeesLog";
import type { ExpenseEntry } from "@/lib/sheets/dailyExpense";
import { gradeChartRows } from "@/lib/sort-by-grade";
import { canonicalClassLabel } from "@/lib/fees/structure";
import {
  computePortalOverview,
  defaultGranularityForPreset,
  type Granularity,
  type PeriodPreset,
} from "@/lib/portal-analytics";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { feesListUrl, portalFetch } from "@/lib/portal-fetch";

const PERIOD_OPTIONS: { id: PeriodPreset; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "ytd", label: "Year to date" },
  { id: "all", label: "All time" },
];

const GRANULARITY_OPTIONS: { id: Granularity; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function fmtShort(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return fmt(n);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="text-slate-600">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function DashboardClient() {
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [schoolPayments, setSchoolPayments] = useState<DailyEntry[]>([]);
  const [otherFees, setOtherFees] = useState<OtherFeeEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [selectedPair, setSelectedPair] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch("/api/portal-summary");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setFees(Array.isArray(data.fees) ? data.fees : []);
      setSchoolPayments(Array.isArray(data.schoolPayments) ? data.schoolPayments : []);
      setOtherFees(Array.isArray(data.otherFees) ? data.otherFees : []);
      setExpenses(Array.isArray(data.expenses) ? data.expenses : []);
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

  function handlePeriodChange(next: PeriodPreset) {
    setPeriod(next);
    setGranularity(defaultGranularityForPreset(next));
  }

  const overview = useMemo(
    () => computePortalOverview(fees, schoolPayments, otherFees, expenses, granularity, period),
    [fees, schoolPayments, otherFees, expenses, granularity, period]
  );

  const classMap: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of fees) {
      const cls = canonicalClassLabel(f.className);
      m[cls] = (m[cls] ?? 0) + 1;
    }
    return m;
  }, [fees]);
  const classesByGrade = gradeChartRows(classMap);
  const CLASS_CHART_SCALE_MAX = 100;

  const pairChartData = useMemo(() => {
    const rows = overview.categoryPairs.map((p) => ({
      ...p,
      highlighted: selectedPair === null || selectedPair === p.id,
    }));
    return rows;
  }, [overview.categoryPairs, selectedPair]);

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
        <button onClick={load} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Retry
        </button>
      </div>
    );
  }

  const { summary } = overview;
  const netPositive = summary.periodNet >= 0;

  const stats = [
    {
      label: "Students",
      value: fees.length.toString(),
      sub: "Active (Pass out hidden)",
      icon: Users,
      color: "bg-blue-50 text-blue-600",
      href: "/students",
    },
    {
      label: "Income (period)",
      value: fmt(summary.periodTotalIncome),
      sub: `${fmt(summary.periodSchoolPayments)} school · ${fmt(summary.periodOtherFees)} other`,
      icon: Wallet,
      color: "bg-green-50 text-green-600",
      href: "/fees-dashboard",
    },
    {
      label: "Expenses (period)",
      value: fmt(summary.periodTotalExpenses),
      sub: `${overview.expensesByCategory.length} categories`,
      icon: Receipt,
      color: "bg-red-50 text-red-600",
      href: "/expense-dashboard",
    },
    {
      label: "Net (period)",
      value: fmt(summary.periodNet),
      sub: netPositive ? "Surplus" : "Deficit",
      icon: Scale,
      color: netPositive ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
      href: "/fees-dashboard",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {stats.map(({ label, value, sub, icon: Icon, color, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1 break-words">{value}</p>
                <p className="text-xs text-slate-400 mt-1">{sub}</p>
              </div>
              <div className={`rounded-lg p-2.5 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Income vs expense */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">Income vs expenses</h2>
            <p className="text-sm text-slate-500">School fees, other fees, and spending — filter by period</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handlePeriodChange(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === opt.id
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-2 items-center">
          <CalendarRange className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-600 mr-1">Chart view:</span>
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setGranularity(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                granularity === opt.id
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">School fees collected</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{fmt(summary.periodSchoolPayments)}</p>
            <p className="text-xs text-slate-400 mt-1">
              {summary.collectionRate.toFixed(1)}% of annual ({fmt(summary.schoolFeesCollected)} total)
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">Other fees collected</p>
            <p className="text-2xl font-bold text-violet-700 mt-1">{fmt(summary.periodOtherFees)}</p>
            <p className="text-xs text-slate-400 mt-1">{overview.otherFeesByType.length} fee types</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500">Pending school fees</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{fmt(summary.schoolFeesPending)}</p>
            <Link href="/pending" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
              View pending →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Income vs expense trend</h3>
            {overview.combinedTimeline.length === 0 ? (
              <p className="text-sm text-slate-400 py-16 text-center">No data in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={overview.combinedTimeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="totalIncome" name="Income" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="net" name="Net" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-1">Matched categories</h3>
            <p className="text-xs text-slate-500 mb-4">Click a row to highlight — e.g. bus fees vs bus expense</p>
            {pairChartData.length === 0 ? (
              <p className="text-sm text-slate-400 py-16 text-center">No paired data</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={pairChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} axisLine={false} />
                  <Tooltip
                    formatter={(v) => fmt(Number(v))}
                    labelFormatter={(label) => String(label)}
                  />
                  <Legend />
                  <Bar dataKey="feesCollected" name="Fees collected" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Interactive pair table */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Category comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4">Fees collected</th>
                  <th className="pb-2 pr-4">Expenses</th>
                  <th className="pb-2 pr-4">Net</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.categoryPairs.map((p) => {
                  const active = selectedPair === p.id;
                  const surplus = p.net >= 0;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPair(active ? null : p.id)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors ${
                        active ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-2.5 pr-4 font-medium text-slate-700">{p.label}</td>
                      <td className="py-2.5 pr-4 text-violet-700">{fmt(p.feesCollected)}</td>
                      <td className="py-2.5 pr-4 text-orange-700">{fmt(p.expenses)}</td>
                      <td className={`py-2.5 pr-4 font-medium ${surplus ? "text-green-700" : "text-red-600"}`}>
                        {fmt(p.net)}
                      </td>
                      <td className="py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          surplus ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        }`}>
                          {surplus ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {surplus ? "Surplus" : "Deficit"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50 font-semibold">
                  <td className="py-2.5 pr-4 text-slate-800">Total (period)</td>
                  <td className="py-2.5 pr-4 text-violet-800">{fmt(summary.periodTotalIncome)}</td>
                  <td className="py-2.5 pr-4 text-orange-800">{fmt(summary.periodTotalExpenses)}</td>
                  <td className={`py-2.5 pr-4 ${netPositive ? "text-green-800" : "text-red-700"}`}>
                    {fmt(summary.periodNet)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {(overview.unpairedOtherFees.length > 0 || overview.unpairedExpenses.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-100">
              {overview.unpairedOtherFees.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">Other fees (no expense pair)</p>
                  <ul className="space-y-1">
                    {overview.unpairedOtherFees.slice(0, 5).map((r) => (
                      <li key={r.feeType} className="flex justify-between text-sm">
                        <span className="text-slate-600">{r.feeType}</span>
                        <span className="font-medium text-violet-700">{fmt(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {overview.unpairedExpenses.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">Expenses (no fee pair)</p>
                  <ul className="space-y-1">
                    {overview.unpairedExpenses.slice(0, 5).map((r) => (
                      <li key={r.category} className="flex justify-between text-sm">
                        <span className="text-slate-600">{r.category}</span>
                        <span className="font-medium text-orange-700">{fmt(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* School fee progress */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400 shrink-0" />
            <h2 className="font-semibold text-slate-700">School fee collection (annual)</h2>
          </div>
          <span className="text-sm font-medium text-slate-600 shrink-0">
            {summary.collectionRate.toFixed(1)}% collected
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all"
            style={{ width: `${Math.min(summary.collectionRate, 100)}%` }}
          />
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between mt-2 text-xs text-slate-400">
          <span>Collected: {fmt(summary.schoolFeesCollected)}</span>
          <span>Expected: {fmt(summary.schoolFeesExpected)}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Link href="/pending" className="rounded-lg bg-amber-50 px-3 py-2 text-center hover:bg-amber-100 transition-colors">
            <p className="text-xs text-amber-700">Pending</p>
            <p className="font-semibold text-amber-800">{fmt(summary.schoolFeesPending)}</p>
          </Link>
          <Link href="/fees-dashboard" className="rounded-lg bg-green-50 px-3 py-2 text-center hover:bg-green-100 transition-colors">
            <p className="text-xs text-green-700">Fees dashboard</p>
            <p className="font-semibold text-green-800">Analytics →</p>
          </Link>
          <Link href="/daily-entry" className="rounded-lg bg-blue-50 px-3 py-2 text-center hover:bg-blue-100 transition-colors">
            <p className="text-xs text-blue-700">Record fees</p>
            <p className="font-semibold text-blue-800">Add payment →</p>
          </Link>
          <Link href="/expense-dashboard" className="rounded-lg bg-red-50 px-3 py-2 text-center hover:bg-red-100 transition-colors">
            <p className="text-xs text-red-700">Expenses</p>
            <p className="font-semibold text-red-800">{fmt(summary.periodTotalExpenses)}</p>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-700">Students by class</h2>
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
    </div>
  );
}
