"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import type { UdiseRecord } from "@/lib/udise/record";
import { udiseDetailFields, udiseRowKey } from "@/lib/udise/record";

function cell(v: string) {
  if (!v || v === "NA") return <span className="text-slate-300">—</span>;
  return v;
}

export default function UdiseList() {
  const [rows, setRows] = useState<UdiseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/udise");
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

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.permanentEducationNumber.toLowerCase().includes(q) ||
        r.aadhaarNumber.toLowerCase().includes(q) ||
        r.grNumber.toLowerCase().includes(q) ||
        `${r.className} ${r.section}`.toLowerCase().includes(q)
    );
  }, [rows, query]);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading UDISE records…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <button
          type="button"
          onClick={load}
          className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
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
            placeholder="Search name, PEN, Aadhaar, GR…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <span className="text-sm text-slate-400">{filtered.length} students</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="w-10 px-3 py-3" />
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Class
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  PEN
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Aadhaar
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  GR No.
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Height (cm)
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Weight (kg)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No UDISE records found. Run the import script to load the Excel file.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const key = udiseRowKey(r);
                  const open = expanded === key;
                  return (
                    <Fragment key={key}>
                      <tr
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => setExpanded(open ? null : key)}
                      >
                        <td className="px-3 py-3 text-slate-400">
                          {open ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {r.className}
                          {r.section ? ` · ${r.section}` : ""}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                          {cell(r.permanentEducationNumber)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                          {cell(r.aadhaarNumber)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                          {cell(r.grNumber)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{cell(r.heightCm)}</td>
                        <td className="px-4 py-3 text-slate-600">{cell(r.weightKg)}</td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={8} className="px-6 py-4">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                              Full UDISE details
                            </p>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                              {udiseDetailFields(r).map(({ label, value }) => (
                                <div key={label}>
                                  <dt className="text-xs text-slate-400">{label}</dt>
                                  <dd className="text-slate-800 mt-0.5 break-words">
                                    {cell(value)}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
