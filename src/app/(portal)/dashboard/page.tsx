import { getAllStudents } from "@/lib/sheets/students";
import { getAllFees } from "@/lib/sheets/fees";
import {
  Users,
  IndianRupee,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  GraduationCap,
} from "lucide-react";
import Link from "next/link";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let students: Awaited<ReturnType<typeof getAllStudents>> = [];
  let fees: Awaited<ReturnType<typeof getAllFees>> = [];
  let error: string | null = null;

  try {
    [students, fees] = await Promise.all([getAllStudents(), getAllFees()]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  const totalExpected = fees.reduce((s, f) => s + f.totalFee, 0);
  const totalCollected = fees.reduce((s, f) => s + f.totalPaid, 0);
  const totalPending = totalExpected - totalCollected;
  const fullyPaid = fees.filter((f) => f.balance <= 0).length;
  const hasPending = fees.filter((f) => f.balance > 0).length;
  const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

  // Class distribution
  const classMap: Record<string, number> = {};
  for (const s of students) {
    const cls = s.className || "Unknown";
    classMap[cls] = (classMap[cls] ?? 0) + 1;
  }
  const topClasses = Object.entries(classMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const stats = [
    {
      label: "Total Students",
      value: students.length.toString(),
      sub: `across ${Object.keys(classMap).length} classes`,
      icon: Users,
      color: "bg-blue-50 text-blue-600",
      href: "/students",
    },
    {
      label: "Total Collected",
      value: fmt(totalCollected),
      sub: `${collectionRate.toFixed(1)}% of expected`,
      icon: IndianRupee,
      color: "bg-green-50 text-green-600",
      href: "/fees",
    },
    {
      label: "Pending Amount",
      value: fmt(totalPending),
      sub: `${hasPending} students with balance`,
      icon: AlertCircle,
      color: "bg-amber-50 text-amber-600",
      href: "/pending",
    },
    {
      label: "Fully Paid",
      value: fullyPaid.toString(),
      sub: `out of ${fees.length} fee records`,
      icon: CheckCircle,
      color: "bg-emerald-50 text-emerald-600",
      href: "/fees",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Academic Year 2025–26 overview</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Could not load live data:</strong> {error}
          <br />
          <span className="text-red-500">
            Check your <code>.env.local</code> and make sure the service account has access to both sheets.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {stats.map(({ label, value, sub, icon: Icon, color, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
          >
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
          <span className="text-sm font-medium text-slate-600">
            {collectionRate.toFixed(1)}% collected
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all"
            style={{ width: `${Math.min(collectionRate, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span>Collected: {fmt(totalCollected)}</span>
          <span>Expected: {fmt(totalExpected)}</span>
        </div>
      </div>

      {topClasses.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-700">Students by Class</h2>
          </div>
          <div className="space-y-3">
            {topClasses.map(([cls, count]) => {
              const maxCount = topClasses[0][1];
              const pct = (count / maxCount) * 100;
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
      )}
    </div>
  );
}
