"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronRight, ClipboardList } from "lucide-react";
import type { Student } from "@/lib/sheets/students";

export default function StudentsTable({ students }: { students: Student[] }) {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  const classes = useMemo(
    () => ["all", ...Array.from(new Set(students.map((s) => s.className).filter(Boolean))).sort()],
    [students]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return students.filter((s) => {
      if (classFilter !== "all" && s.className !== classFilter) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.className.toLowerCase().includes(q);
    });
  }, [students, query, classFilter]);

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      {/* Filters */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or class..."
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
            <option key={`cls-${c}`} value={c}>
              {c === "all" ? "All Classes" : c}
            </option>
          ))}
        </select>

        <span className="text-sm text-slate-400 self-center">
          {filtered.length} of {students.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fees</th>
              <th className="px-4 py-3 w-8" />
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                  No students found
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.sheetRow} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-400">{s.sheetRow - 2}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.className || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{s.fees || "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/daily-entry?student=${encodeURIComponent(s.name)}`}
                      className="text-slate-400 hover:text-purple-600 transition-colors"
                      title="View payment log"
                    >
                      <ClipboardList className="w-4 h-4" />
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/fees?student=${encodeURIComponent(s.name)}`}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                      title="View fees"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
