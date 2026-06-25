"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { portalFetch } from "@/lib/portal-fetch";
import { dispatchPortalRefresh } from "@/lib/portal-refresh";
import { sortByGradeThenName } from "@/lib/sort-by-grade";
import StudentStatusActions from "@/components/students/StudentStatusActions";

type StudentRow = {
  name: string;
  className: string;
  fees: string;
  sheetRow: number;
  grNo: string | null;
  hasProfile: boolean;
};

export default function AdminStudentManagement() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch("/api/students");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setStudents(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = !q
      ? students
      : students.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.className.toLowerCase().includes(q) ||
            (s.grNo?.toLowerCase().includes(q) ?? false)
        );
    return sortByGradeThenName(list, (s) => s.className, (s) => s.name);
  }, [students, query]);

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-rose-900">Student status (sensitive)</h2>
        <p className="text-xs text-rose-800/80 mt-0.5">
          Mark students as <strong>Active</strong>, <strong>Left</strong>, or <strong>Failed</strong> (Left/Failed are hidden from active lists), or{" "}
          <strong>Remove</strong> to delete all spreadsheet rows permanently.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search student, class, or Gr No…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-rose-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-400"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading students…
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="bg-white rounded-lg border border-rose-100 max-h-[420px] overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No students match</p>
          ) : (
            filtered.map((s) => (
              <div
                key={s.sheetRow}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 text-sm truncate">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    {s.className || "—"}
                    {s.grNo ? ` · ${s.grNo}` : ""}
                  </p>
                </div>
                <StudentStatusActions
                  studentName={s.name}
                  sheetRow={s.sheetRow}
                  grNo={s.grNo}
                  onDone={() => {
                    load();
                    dispatchPortalRefresh();
                  }}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
