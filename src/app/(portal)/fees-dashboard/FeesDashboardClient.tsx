"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  CreditCard,
  Filter,
  GraduationCap,
  IndianRupee,
  PieChart as PieChartIcon,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import type { DailyEntry } from "@/lib/sheets/dailyLog";
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

export default function FeesDashboardClient() {
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [payments, setPayments] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [classFilter, setClassFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feesRes, payRes] = await Promise.all([
        portalFetch(feesListUrl()),
        portalFetch("/api/daily-entry"),
      ]);
      if (!feesRes.ok) throw new Error(`Fees error ${feesRes.status}`);
      if (!payRes.ok) throw new Error(`Payments error ${payRes.status}`);
      const feesData: FeeRecord[] = await feesRes.json();
      const payData = await payRes.json();
      setFees(Array.isArray(feesData) ? feesData : []);
      setPayments(Array.isArray(payData) ? payData : []);
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

  const analytics = useMemo(
    () => computeFeesAnalytics(fees, payments, granularity, period, classFilter),
    [fees, payments, granularity, period, classFilter]
  );

  const recentPayments = useMemo(() => {
    let list = [...payments];
    if (classFilter) {
      list = list.filter((p) => canonicalClassLabel(p.className) === classFilter);
    }
    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [payments, classFilter]);

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
        <button
          onClick={load}
          className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const { summary, timeline, byClass, quarters, statusBreakdown } = analytics;
  const cashPct =
    summary.periodCollected > 0
      ? (summary.periodCash / summary.periodCollected) * 100
      : 0;

  return (
    <div className="space-y-6">
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

        <div className="hidden lg:block w-px h-8 bg-slate-200" />

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 lg:flex-1 lg:min-w-[180px]">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 sm:py-1.5"
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Total collected</p>
              <p className="text-xl sm:text-xl sm:text-2xl font-bold text-green-700 mt-1 break-words">
                {fmt(summary.totalCollected)}
              </p>
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
              <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1">
                {fmt(summary.totalPending)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {summary.hasPending} students with balance
              </p>
            </div>
            <div className="rounded-lg p-2.5 bg-red-50 text-red-600">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Collected in period</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1">
                {fmt(summary.periodCollected)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {summary.periodPayments} payment{summary.periodPayments !== 1 ? "s" : ""}
              </p>
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
              <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1">
                {summary.fullyPaid}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                of {summary.studentCount} students
              </p>
            </div>
            <div className="rounded-lg p-2.5 bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Collection progress */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-700">Overall collection progress</h2>
          </div>
          <span className="text-sm font-medium text-slate-600">
            {summary.collectionRate.toFixed(1)}% collected
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all"
            style={{ width: `${Math.min(summary.collectionRate, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span>Collected: {fmt(summary.totalCollected)}</span>
          <span>Expected: {fmt(summary.totalExpected)}</span>
        </div>
      </div>

      {/* Payment trend + mode */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Payment collection trend</h2>
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
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={fmtShort}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Collected"
                  stroke="#10b981"
                  fill="url(#feesGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Payment mode (period)</h2>
          {summary.periodCollected === 0 ? (
            <p className="text-sm text-slate-400 py-16 text-center">No data</p>
          ) : (
            <>
              <p className="text-sm text-slate-500 text-center mb-2">
                {cashPct.toFixed(0)}% cash · {fmt(summary.periodCash)} / {fmt(summary.periodOnline)}
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

      {/* Class + quarters */}
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
              <BarChart
                data={byClass}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="className"
                  width={100}
                  tick={{ fontSize: 11, fill: "#475569" }}
                />
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

      {/* Status + cash/online over time */}
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
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
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
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
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

      {/* Recent payments */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-800">Recent payments</h2>
        </div>
        {recentPayments.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No payments recorded yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Student</th>
                  <th className="pb-2 pr-4">Class</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2">Mode</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-4 text-slate-600">{p.date}</td>
                    <td className="py-2.5 pr-4 font-medium text-slate-700">{p.studentName}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{p.className}</td>
                    <td className="py-2.5 pr-4 font-medium text-green-700">{fmt(p.amount)}</td>
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
