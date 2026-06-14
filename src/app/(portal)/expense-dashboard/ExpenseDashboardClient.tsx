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
  Banknote,
  CalendarRange,
  CreditCard,
  Filter,
  PieChart as PieChartIcon,
  RefreshCw,
  Tag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ExpenseEntry } from "@/lib/sheets/dailyExpense";
import {
  categoryColor,
  computeExpenseAnalytics,
  defaultGranularityForPreset,
  type Granularity,
  type PeriodPreset,
} from "@/lib/expense-analytics";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { portalFetch } from "@/lib/portal-fetch";

type LoadResponse = { entries: ExpenseEntry[]; categories: string[] };

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

export default function ExpenseDashboardClient() {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [categoryFilter, setCategoryFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch("/api/daily-expense");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: LoadResponse = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load expenses");
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

  const analytics = useMemo(
    () => computeExpenseAnalytics(entries, granularity, period, categoryFilter),
    [entries, granularity, period, categoryFilter]
  );

  const pieData = useMemo(
    () =>
      analytics.byCategory.map((c, i) => ({
        name: c.category,
        value: c.amount,
        fill: categoryColor(i),
      })),
    [analytics.byCategory]
  );

  const recentEntries = useMemo(() => {
    const filtered = categoryFilter
      ? entries.filter((e) => e.category === categoryFilter)
      : entries;
    return [...filtered].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [entries, categoryFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading expense dashboard…</p>
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

  const { summary, timeline, byCategory } = analytics;
  const cashPct = summary.total > 0 ? (summary.cash / summary.total) * 100 : 0;

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

        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
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
              <p className="text-sm text-slate-500">Total spent</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{fmt(summary.total)}</p>
              <p className="text-xs text-slate-400 mt-1">{summary.count} entries</p>
            </div>
            <div className="rounded-lg p-2.5 bg-blue-50 text-blue-600">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">
                Avg per {granularity === "daily" ? "day" : granularity === "weekly" ? "week" : "month"}
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {fmt(Math.round(summary.avgPerPeriod))}
              </p>
              <p className="text-xs text-slate-400 mt-1">Across {timeline.length} periods</p>
            </div>
            <div className="rounded-lg p-2.5 bg-violet-50 text-violet-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Cash vs Online</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {cashPct.toFixed(0)}% cash
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {fmt(summary.cash)} · {fmt(summary.online)}
              </p>
            </div>
            <div className="rounded-lg p-2.5 bg-emerald-50 text-emerald-600">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Top category</p>
              <p className="text-lg font-bold text-slate-800 mt-1 truncate max-w-[160px]">
                {summary.topCategory}
              </p>
              <p className="text-xs text-slate-400 mt-1">{fmt(summary.topCategoryAmount)}</p>
            </div>
            <div className="rounded-lg p-2.5 bg-amber-50 text-amber-600">
              <Tag className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Trend + payment mode */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Spending trend</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-slate-400 py-16 text-center">No expenses in this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
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
                  name="Total"
                  stroke="#3b82f6"
                  fill="url(#expenseGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Payment mode</h2>
          {summary.total === 0 ? (
            <p className="text-sm text-slate-400 py-16 text-center">No data</p>
          ) : (
            <>
              <div className="flex items-center justify-center gap-6 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Banknote className="w-4 h-4 text-emerald-500" />
                  <span className="text-slate-600">Cash {fmt(summary.cash)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="w-4 h-4 text-violet-500" />
                  <span className="text-slate-600">Online {fmt(summary.online)}</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Cash", value: summary.cash, fill: "#10b981" },
                      { name: "Online", value: summary.online, fill: "#8b5cf6" },
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

      {/* Category charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">By category</h2>
          {byCategory.length === 0 ? (
            <p className="text-sm text-slate-400 py-16 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(240, byCategory.length * 36)}>
              <BarChart
                data={byCategory}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={120}
                  tick={{ fontSize: 11, fill: "#475569" }}
                />
                <Tooltip formatter={tooltipFmt} />
                <Bar dataKey="amount" name="Amount" radius={[0, 4, 4, 0]}>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={categoryColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-800">Category share</h2>
          </div>
          {pieData.length === 0 ? (
            <p className="text-sm text-slate-400 py-16 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={entry.name} fill={entry.fill ?? categoryColor(i)} />
                  ))}
                </Pie>
                <Tooltip formatter={tooltipFmt} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Cash vs online over time */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Cash vs online over time</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">No data</p>
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
              <YAxis
                tickFormatter={fmtShort}
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar dataKey="cash" name="Cash" stackId="mode" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="online" name="Online" stackId="mode" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent entries */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Recent expenses</h2>
        {recentEntries.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No expenses recorded yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2 pr-4">Mode</th>
                  <th className="pb-2">Comment</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-4 text-slate-600">{e.date}</td>
                    <td className="py-2.5 pr-4 font-medium text-slate-700">{e.category}</td>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">{fmt(e.amount)}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          e.paymentMode === "online"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {e.paymentMode === "online" ? "Online" : "Cash"}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-500 truncate max-w-xs">{e.comment || "—"}</td>
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
