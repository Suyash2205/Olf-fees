"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Loader2,
  UserCircle,
} from "lucide-react";

type StudentRow = {
  name: string;
  className: string;
  fees: string;
  sheetRow: number;
  grNo: string | null;
  hasProfile: boolean;
};
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { portalFetch } from "@/lib/portal-fetch";
import { sortByGradeThenName, sortClassNames } from "@/lib/sort-by-grade";

function isPassOut(name: string, className: string): boolean {
  return /\(pass\s*out\)/i.test(name) || /pass\s*out/i.test(className);
}

export default function StudentsTable() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch("/api/students");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: StudentRow[] = await res.json();
      setStudents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  usePortalRefresh(load);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("students-refresh", onRefresh);
    return () => window.removeEventListener("students-refresh", onRefresh);
  }, [load]);

  async function runRowAction(
    sheetRow: number,
    action: "promote" | "demote",
    studentName: string
  ) {
    const verb = action === "promote" ? "Promote" : "Demote";
    if (!confirm(`${verb} ${studentName}?`)) return;

    setRowBusy(sheetRow);
    try {
      const res = await portalFetch("/api/promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sheetRow }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      if (data.skipped > 0 && data.updated === 0) {
        alert(data.errors?.[0] ?? "No change made");
      }
      await load();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setRowBusy(null);
    }
  }

  const classes = useMemo(
    () => ["all", ...sortClassNames(new Set(students.map((s) => s.className).filter(Boolean)))],
    [students]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const list = students.filter((s) => {
      if (classFilter !== "all" && s.className !== classFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) || s.className.toLowerCase().includes(q)
      );
    });
    return sortByGradeThenName(list, (s) => s.className, (s) => s.name);
  }, [students, query, classFilter]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 flex flex-col items-center gap-3 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading students…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={load}
          className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                #
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Name
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Class
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Fees
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Class change
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Profile
              </th>
              <th className="px-4 py-3 w-8" />
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  No students found
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const passOut = isPassOut(s.name, s.className);
                const busy = rowBusy === s.sheetRow;
                return (
                  <tr key={s.sheetRow} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-400">{s.sheetRow - 3}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {s.name}
                      {passOut && (
                        <span className="ml-2 text-xs font-normal text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                          Pass out
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.className || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{s.fees || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        ) : (
                          <>
                            <button
                              type="button"
                              title={
                                passOut
                                  ? "Already pass out"
                                  : "Promote one standard + 2026–27 fee"
                              }
                              disabled={passOut}
                              onClick={() => runRowAction(s.sheetRow, "promote", s.name)}
                              className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Demote one standard + matching fee"
                              onClick={() => runRowAction(s.sheetRow, "demote", s.name)}
                              className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.hasProfile && s.grNo ? (
                        <Link
                          href={`/admissions/${encodeURIComponent(s.grNo)}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                          title="View full profile"
                        >
                          <UserCircle className="w-4 h-4" />
                          View
                        </Link>
                      ) : (
                        <Link
                          href={`/admissions/complete?student=${encodeURIComponent(s.name)}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
                          title="Add full admission details"
                        >
                          <UserCircle className="w-4 h-4" />
                          Add info
                        </Link>
                      )}
                    </td>
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
