"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, RefreshCw, ChevronRight } from "lucide-react";
import type { AdmissionRecord } from "@/lib/sheets/admissions";
import { formatINR } from "@/lib/fees/structure";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { portalFetch } from "@/lib/portal-fetch";
import { sortByGradeThenName } from "@/lib/sort-by-grade";

export default function AdmissionsList() {
  const [rows, setRows] = useState<AdmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch("/api/admissions");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setRows(await res.json());
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

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const list = !q
      ? rows
      : rows.filter(
          (r) =>
            r.fullName.toLowerCase().includes(q) ||
            r.grNo.toLowerCase().includes(q) ||
            r.standard.toLowerCase().includes(q) ||
            r.studentContact.includes(q)
        );
    return sortByGradeThenName(list, (r) => r.standard, (r) => r.fullName);
  }, [rows, query]);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading admissions…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <button onClick={load} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, Gr No, class, phone…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <span className="text-sm text-slate-400">{filtered.length} students</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Gr No</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Class</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Fee</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-slate-400">
                  No admissions yet.{" "}
                  <Link href="/admissions/new" className="text-blue-600 hover:underline">
                    Add first student
                  </Link>
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.grNo} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.grNo}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.fullName}</td>
                  <td className="px-4 py-3 text-slate-600">{r.standard}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.annualFee > 0 ? formatINR(r.annualFee) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.studentContact || r.fatherContact || "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admissions/${encodeURIComponent(r.grNo)}`}
                      className="text-slate-400 hover:text-blue-600"
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
