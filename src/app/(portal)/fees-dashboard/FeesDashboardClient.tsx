"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  Filter,
  GraduationCap,
  IndianRupee,
  PieChart as PieChartIcon,
  RefreshCw,
  Tag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { DailyEntry } from "@/lib/sheets/dailyLog";
import type { OtherFeeEntry } from "@/lib/sheets/otherFeesLog";
import type { FeeRecord } from "@/lib/sheets/fees";
import { canonicalClassLabel } from "@/lib/fees/structure";
import {
  categoryColor,
  computeFeesAnalytics,
  defaultGranularityForPreset,
  listFeeClasses,
  type Granularity,
  type PeriodPreset,
} from "@/lib/fees-analytics";
import {
  computeOtherFeesAnalytics,
  listOtherFeeTypes,
} from "@/lib/other-fees-analytics";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { portalFetch } from "@/lib/portal-fetch";

type ViewMode = "school" | "other" | "all";

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

const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: "all", label: "All income" },
  { id: "school", label: "School fees" },
  { id: "other", label: "Other fees" },
];

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function tooltipFmt(value: unknown) {
  return fmt(Number(value) || 0);
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

type RecentRow =
  | { kind: "school"; id: string; date: string; studentName: string; className: string; amount: number; paymentMode?: string; label: string }
  | { kind: "other"; id: string; date: string; studentName: string; className: string; amount: number; paymentMode?: string; label: string };

export default function FeesDashboardClient() {
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [payments, setPayments] = useState<DailyEntry[]>([]);
  const [otherFees, setOtherFees] = useState<OtherFeeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("all");
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [classFilter, setClassFilter] = useState("");
  const [feeTypeFilter, setFeeTypeFilter] = useState("");
  const [selectedFeeType, setSelectedFeeType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch("/api/fees-dashboard-data");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setFees(Array.isArray(data.fees) ? data.fees : []);
      setPayments(Array.isArray(data.schoolPayments) ? data.schoolPayments : []);
      setOtherFees(Array.isArray(data.otherFees) ? data.otherFees : []);
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

  const classes = useMemo(() => listFeeClasses(fees), [fees]);
  const feeTypes = useMemo(() => listOtherFeeTypes(otherFees), [otherFees]);

  const schoolAnalytics = useMemo(
    () => computeFeesAnalytics(fees, payments, granularity, period, classFilter),
    [fees, payments, granularity, period, classFilter]
  );

  const otherAnalytics = useMemo(
    () => computeOtherFeesAnalytics(otherFees, granularity, period, feeTypeFilter),
    [otherFees, granularity, period, feeTypeFilter]
  );

  const combinedTimeline = useMemo(() => {
    const map = new Map<string, { label: string; school: number; other: number; total: number }>();
    for (const p of schoolAnalytics.timeline) {
      map.set(p.key, { label: p.label, school: p.total, other: 0, total: p.total });
    }
    for (const p of otherAnalytics.timeline) {
      const row = map.get(p.key) ?? { label: p.label, school: 0, other: 0, total: 0 };
      row.other = p.total;
      row.total = row.school + row.other;
      map.set(p.key, row);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);
  }, [schoolAnalytics.timeline, otherAnalytics.timeline]);

  const recentRows = useMemo((): RecentRow[] => {
    const school: RecentRow[] = payments
      .filter((p) => !classFilter || canonicalClassLabel(p.className) === classFilter)
      .map((p) => ({
        kind: "school" as const,
        id: p.id,
        date: p.date,
        studentName: p.studentName,
        className: p.className,
        amount: p.amount,
        paymentMode: p.paymentMode,
        label: "School Fees",
      }));
    const other: RecentRow[] = otherFees.map((e) => ({
      kind: "other" as const,
      id: e.id,
      date: e.date,
      studentName: e.studentName,
      className: e.className,
      amount: e.amount,
      paymentMode: e.paymentMode,
      label: e.feeType,
    }));
    let merged = [...school, ...other];
    if (view === "school") merged = school;
    if (view === "other") merged = other;
    if (selectedFeeType) {
      merged = merged.filter((r) => r.kind === "other" && r.label === selectedFeeType);
    }
    return merged.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [payments, otherFees, classFilter, view, selectedFeeType]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading fees dashboard…</p>
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

  const { summary, timeline, byClass, quarters, statusBreakdown } = schoolAnalytics;
  const otherSummary = otherAnalytics.summary;
  const cashPct =
    summary.periodCollected > 0
      ? (summary.periodCash / summary.periodCollected) * 100
      : 0;
  const periodTotalIncome = summary.periodCollected + otherSummary.total;

  return (
    <div className="space-y-6">
      {/* View tabs */}
      <div className="flex flex-wrap gap-2">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              setView(opt.id);
              setSelectedFeeType(null);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === opt.id
                ? opt.id === "other"
                  ? "bg-violet-600 text-white"
                  : opt.id === "school"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <Link
          href="/daily-entry"
          className="ml-auto text-sm text-blue-600 hover:underline self-center"
        >
          Record payment →
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 shrink-0">
          <CalendarRange className="w-4 h-4 text-slate-400" />
          Period
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
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="hidden lg:block w-px h-8 bg-slate-200" />

        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 shrink-0">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          View
        </div>
        <div className="flex flex-wrap gap-2">
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

        {(view === "school" || view === "all") && (
          <>
            <div className="hidden lg:block w-px h-8 bg-slate-200" />
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 lg:flex-1 lg:min-w-[160px]">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 sm:py-1.5"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {(view === "other" || view === "all") && (
          <>
            <div className="hidden lg:block w-px h-8 bg-slate-200" />
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 lg:flex-1 lg:min-w-[160px]">
              <Tag className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={feeTypeFilter}
                onChange={(e) => setFeeTypeFilter(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 sm:py-1.5"
              >
                <option value="">All fee types</option>
                {feeTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {(view === "all" || view === "school") && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">School fees collected</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-700 mt-1">{fmt(summary.totalCollected)}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {summary.collectionRate.toFixed(1)}% of {fmt(summary.totalExpected)}
                  </p>
                </div>
                <div className="rounded-lg p-2.5 bg-green-50 text-green-600">
                  <IndianRupee className="w-5 h-5" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Pending balance</p>
                  <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1">{fmt(summary.totalPending)}</p>
                  <p className="text-xs text-slate-400 mt-1">{summary.hasPending} students</p>
                </div>
                <div className="rounded-lg p-2.5 bg-red-50 text-red-600">
                  <AlertCircle className="w-5 h-5" />
                </div>
              </div>
            </div>
          </>
        )}
        {(view === "all" || view === "other") && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Other fees (period)</p>
                  <p className="text-xl sm:text-2xl font-bold text-violet-700 mt-1">{fmt(otherSummary.total)}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {otherSummary.count} entries · {otherSummary.uniqueStudents} students
                  </p>
                </div>
                <div className="rounded-lg p-2.5 bg-violet-50 text-violet-600">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Top other fee type</p>
                  <p className="text-lg font-bold text-slate-800 mt-1 truncate">{otherSummary.topFeeType}</p>
                  <p className="text-xs text-slate-400 mt-1">{fmt(otherSummary.topFeeTypeAmount)}</p>
                </div>
                <div className="rounded-lg p-2.5 bg-violet-50 text-violet-600">
                  <Tag className="w-5 h-5" />
                </div>
              </div>
            </div>
          </>
        )}
        {view === "all" && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:col-span-2 xl:col-span-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm text-slate-500">Total income in period</p>
                <p className="text-2xl font-bold text-slate-800">{fmt(periodTotalIncome)}</p>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-blue-700">School: {fmt(summary.periodCollected)}</span>
                <span className="text-violet-700">Other: {fmt(otherSummary.total)}</span>
              </div>
            </div>
          </div>
        )}
        {view === "school" && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Collected in period</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1">{fmt(summary.periodCollected)}</p>
                  <p className="text-xs text-slate-400 mt-1">{summary.periodPayments} payments</p>
                </div>
                <div className="rounded-lg p-2.5 bg-blue-50 text-blue-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Fully paid</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1">{summary.fullyPaid}</p>
                  <p className="text-xs text-slate-400 mt-1">of {summary.studentCount} students</p>
                </div>
                <div className="rounded-lg p-2.5 bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Charts - view dependent */}
      {view === "all" && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Combined income trend</h2>
          {combinedTimeline.length === 0 ? (
            <p className="text-sm text-slate-400 py-16 text-center">No payments in this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={combinedTimeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} interval="preserveStartEnd" />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="school" name="School fees" stackId="income" fill="#3b82f6" />
                <Bar dataKey="other" name="Other fees" stackId="income" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {view === "other" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Other fees trend</h2>
            {otherAnalytics.timeline.length === 0 ? (
              <p className="text-sm text-slate-400 py-16 text-center">No other fees in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={otherAnalytics.timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="otherGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="total" name="Collected" stroke="#8b5cf6" fill="url(#otherGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">By fee type</h2>
            {otherAnalytics.byFeeType.length === 0 ? (
              <p className="text-sm text-slate-400 py-16 text-center">No data</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {otherAnalytics.byFeeType.map((t) => (
                    <button
                      key={t.feeType}
                      type="button"
                      onClick={() => setSelectedFeeType(selectedFeeType === t.feeType ? null : t.feeType)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        selectedFeeType === t.feeType
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                      }`}
                    >
                      {t.feeType} {fmt(t.amount)}
                    </button>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={otherAnalytics.byFeeType}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      dataKey="amount"
                      nameKey="feeType"
                      paddingAngle={2}
                    >
                      {otherAnalytics.byFeeType.map((_, i) => (
                        <Cell key={i} fill={categoryColor(i)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={tooltipFmt} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Cash vs online (other fees)</h2>
            {otherSummary.total === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={[{ label: "Period", cash: otherSummary.cash, online: otherSummary.online }]}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar dataKey="cash" name="Cash" fill="#10b981" />
                  <Bar dataKey="online" name="Online" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {(view === "school" || view === "all") && (
        <>
          {view === "school" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-700">Overall collection progress</h2>
                <span className="text-sm font-medium text-slate-600">{summary.collectionRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div className="bg-blue-600 h-3 rounded-full" style={{ width: `${Math.min(summary.collectionRate, 100)}%` }} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-4">School fees trend</h2>
              {timeline.length === 0 ? (
                <p className="text-sm text-slate-400 py-16 text-center">No payments in this period</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="feesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} interval="preserveStartEnd" />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="total" name="Collected" stroke="#10b981" fill="url(#feesGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-4">Payment mode (school)</h2>
              {summary.periodCollected === 0 ? (
                <p className="text-sm text-slate-400 py-16 text-center">No data</p>
              ) : (
                <>
                  <p className="text-sm text-slate-500 text-center mb-2">
                    {cashPct.toFixed(0)}% cash
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Cash", value: summary.periodCash, fill: "#10b981" },
                          { name: "Online", value: summary.periodOnline, fill: "#8b5cf6" },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#8b5cf6" />
                      </Pie>
                      <Tooltip formatter={tooltipFmt} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="w-4 h-4 text-slate-400" />
                <h2 className="font-semibold text-slate-800">Collected by class</h2>
              </div>
              {byClass.length === 0 ? (
                <p className="text-sm text-slate-400 py-16 text-center">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(240, byClass.length * 36)}>
                  <BarChart data={byClass} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="className" width={100} tick={{ fontSize: 11, fill: "#475569" }} />
                    <Tooltip formatter={tooltipFmt} />
                    <Bar dataKey="collected" name="Collected" radius={[0, 4, 4, 0]}>
                      {byClass.map((_, i) => (
                        <Cell key={i} fill={categoryColor(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-4">Quarter-wise collected</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={quarters} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="quarter" tick={{ fontSize: 12, fill: "#64748b" }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} axisLine={false} />
                  <Tooltip formatter={tooltipFmt} />
                  <Bar dataKey="collected" name="Collected" radius={[4, 4, 0, 0]}>
                    {quarters.map((_, i) => (
                      <Cell key={i} fill={categoryColor(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {view === "school" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <PieChartIcon className="w-4 h-4 text-slate-400" />
                  <h2 className="font-semibold text-slate-800">Student payment status</h2>
                </div>
                {statusBreakdown.length === 0 ? (
                  <p className="text-sm text-slate-400 py-16 text-center">No students</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={statusBreakdown}
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        dataKey="count"
                        nameKey="status"
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      >
                        {statusBreakdown.map((entry) => (
                          <Cell key={entry.status} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="font-semibold text-slate-800 mb-4">Cash vs online over time</h2>
                {timeline.length === 0 ? (
                  <p className="text-sm text-slate-400 py-16 text-center">No data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} interval="preserveStartEnd" />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Bar dataKey="cash" name="Cash" stackId="mode" fill="#10b981" />
                      <Bar dataKey="online" name="Online" stackId="mode" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Recent payments */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-800">Recent payments</h2>
          </div>
          {selectedFeeType && (
            <button
              type="button"
              onClick={() => setSelectedFeeType(null)}
              className="text-xs text-violet-600 hover:underline"
            >
              Clear filter: {selectedFeeType}
            </button>
          )}
        </div>
        {recentRows.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No payments recorded yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Student</th>
                  <th className="pb-2 pr-4">Class</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2">Mode</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.map((p) => (
                  <tr key={`${p.kind}-${p.id}`} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-4 text-slate-600">{p.date}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.kind === "school"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-violet-50 text-violet-700"
                        }`}
                      >
                        {p.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-slate-700">{p.studentName}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{p.className}</td>
                    <td className={`py-2.5 pr-4 font-medium ${p.kind === "school" ? "text-green-700" : "text-violet-700"}`}>
                      {fmt(p.amount)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          p.paymentMode === "online"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {p.paymentMode === "online" ? "Online" : "Cash"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
