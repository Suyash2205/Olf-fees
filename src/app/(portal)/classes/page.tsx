import { getAllStudents } from "@/lib/sheets/students";
import { getAllFees } from "@/lib/sheets/fees";
import Link from "next/link";
import { GraduationCap, Users, IndianRupee, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function ClassesPage() {
  let students: Awaited<ReturnType<typeof getAllStudents>> = [];
  let fees: Awaited<ReturnType<typeof getAllFees>> = [];
  let error: string | null = null;

  try {
    [students, fees] = await Promise.all([getAllStudents(), getAllFees()]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  // Build class summaries from fees sheet (has class info directly)
  const classMap: Record<string, { name: string; feeCount: number; totalFee: number; totalPaid: number; balance: number }> = {};

  for (const f of fees) {
    const cls = f.className || "Unknown";
    if (!classMap[cls]) {
      classMap[cls] = { name: cls, feeCount: 0, totalFee: 0, totalPaid: 0, balance: 0 };
    }
    classMap[cls].feeCount++;
    classMap[cls].totalFee += f.totalFee;
    classMap[cls].totalPaid += f.totalPaid;
    classMap[cls].balance += f.balance;
  }

  // Add student counts from students sheet
  const studentClassCount: Record<string, number> = {};
  for (const s of students) {
    const cls = s.className || "Unknown";
    studentClassCount[cls] = (studentClassCount[cls] ?? 0) + 1;
  }

  const classes = Object.values(classMap).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Classes</h1>
        <p className="text-sm text-slate-500 mt-1">{classes.length} classes</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {classes.map((cls) => {
          const collectionPct = cls.totalFee > 0 ? (cls.totalPaid / cls.totalFee) * 100 : 0;
          const studentCount = studentClassCount[cls.name] ?? cls.feeCount;
          return (
            <div key={`cls-${cls.name}`} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-blue-600" />
                  </div>
                  <h2 className="font-semibold text-slate-800">{cls.name}</h2>
                </div>
                <Link
                  href={`/fees?student=${encodeURIComponent(cls.name)}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  View fees
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-400">Students</p>
                    <p className="font-semibold text-slate-700">{studentCount}</p>
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
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(collectionPct, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {collectionPct.toFixed(1)}% of {fmt(cls.totalFee)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
