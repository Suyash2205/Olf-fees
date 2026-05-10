"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import type { FeeRecord } from "@/lib/sheets/fees";

type QField = "q1Paid" | "q2Paid" | "q3Paid" | "q4Paid";

function fmt(n: number) {
  if (n === 0) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

function StatusPill({ paid, quarterFee }: { paid: number; quarterFee: number }) {
  if (paid <= 0) return <span className="text-xs text-slate-400">Pending</span>;
  if (paid >= quarterFee) return <span className="text-xs font-medium text-green-600">Paid</span>;
  return <span className="text-xs font-medium text-amber-600">Partial</span>;
}

export default function FeesTable({
  fees,
  highlightStudent,
}: {
  fees: FeeRecord[];
  highlightStudent?: string;
}) {
  const [query, setQuery] = useState(highlightStudent ?? "");
  const [classFilter, setClassFilter] = useState("all");

  const classes = useMemo(
    () => ["all", ...Array.from(new Set(fees.map((f) => f.className).filter(Boolean))).sort()],
    [fees]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return fees.filter((f) => {
      if (classFilter !== "all" && f.className !== classFilter) return false;
      if (!q) return true;
      return (
        f.studentName.toLowerCase().includes(q) ||
        f.srNo.includes(q) ||
        f.className.toLowerCase().includes(q)
      );
    });
  }, [fees, query, classFilter]);

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      {/* Filters */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search student or class..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {classes.map((c) => (
            <option key={`class-${c}`} value={c}>
              {c === "all" ? "All Classes" : c}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-400 self-center">
          {filtered.length} students
        </span>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Fee</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Q1</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Q2</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Q3</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Q4</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paid</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Balance</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                  No records found
                </td>
              </tr>
            ) : (
              filtered.map((f) => {
                const qFee = f.totalFee / 4;
                return (
                  <tr key={f.sheetRow} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-xs text-slate-400">{f.srNo}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 sticky left-0 bg-white">
                      {f.studentName}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{f.className || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmt(f.totalFee)}</td>
                    {(["q1Paid", "q2Paid", "q3Paid", "q4Paid"] as QField[]).map((q) => (
                      <td key={q} className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-700">{fmt(f[q])}</span>
                          <StatusPill paid={f[q]} quarterFee={qFee} />
                        </div>
                      </td>
                    ))}
                    <td className="px-4 py-2.5 font-medium text-green-700">{fmt(f.totalPaid)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-medium ${f.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                        {fmt(f.balance)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs max-w-32">{f.notes || "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
