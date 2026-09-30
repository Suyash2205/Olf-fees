"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertCircle, AlertTriangle, CalendarClock, Download, Printer, RefreshCw } from "lucide-react";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { portalFetch } from "@/lib/portal-fetch";
import { sortClassNames } from "@/lib/sort-by-grade";
import {
  PENDING_FILTERS,
  computePendingReport,
  computePendingRow,
  filterByClass,
  followUpNoteText,
  groupByClass,
  pendingCsvFilename,
  pendingToCsv,
  reportTotals,
  type PendingFeeInput,
  type PendingFilter,
  type PendingRow,
} from "@/lib/fees/pending-report";
import { latestFollowUpBySrNo, selectDueFollowUps, type FollowUp } from "@/lib/fees/follow-ups";
import StudentFollowUpPanel from "./StudentFollowUpPanel";

interface ReportData {
  today: string;
  fees: PendingFeeInput[];
  lastPayments: Record<string, string>;
  latestFollowUps: FollowUp[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

const TH = "px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left";

const PRINT_CSS = `
@media print {
  aside, header, .no-print { display: none !important; }
  main, main > div { padding: 0 !important; overflow: visible !important; }
  body { background: #fff !important; }
  .print-only { display: block !important; }
  table { font-size: 11px; }
  tr, .print-keep { break-inside: avoid; }
  .print-group-header { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
.print-only { display: none; }
`;

export default function PendingClient() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<PendingFilter>("q2");
  const [classFilter, setClassFilter] = useState("all");
  const [openSrNo, setOpenSrNo] = useState<string | null>(null);

  // No state is set before the first await, so this is safe to call from an effect.
  const load = useCallback(async () => {
    try {
      const res = await portalFetch("/api/pending-report");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`);
      setData(body as ReportData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so no state is set synchronously inside the effect body.
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);
  usePortalRefresh(load);

  const latestMap = useMemo(() => latestFollowUpBySrNo(data?.latestFollowUps ?? []), [data]);

  const rows = useMemo(
    () =>
      data
        ? computePendingReport({
            fees: data.fees,
            filter,
            lastPaymentBySrNo: new Map(Object.entries(data.lastPayments)),
            latestFollowUpBySrNo: latestMap,
          })
        : [],
    [data, filter, latestMap]
  );

  const classOptions = useMemo(() => sortClassNames(new Set(rows.map((r) => r.className))), [rows]);
  const effectiveClass = classFilter === "all" || classOptions.includes(classFilter) ? classFilter : "all";
  const visible = useMemo(() => filterByClass(rows, effectiveClass), [rows, effectiveClass]);
  const groups = useMemo(() => groupByClass(visible), [visible]);
  const totals = useMemo(() => reportTotals(visible), [visible]);

  const due = useMemo(() => {
    if (!data) return [];
    const owing = new Set(data.fees.filter((f) => f.totalFee - f.totalPaid > 0.001).map((f) => f.srNo));
    return selectDueFollowUps(latestMap, owing, data.today);
  }, [data, latestMap]);

  // Row for the open panel — computed against "any" so it shows even if the filter would hide it.
  const openRow: PendingRow | null = useMemo(() => {
    if (!data || !openSrNo) return null;
    const fee = data.fees.find((f) => f.srNo === openSrNo);
    if (!fee) return null;
    const r = computePendingRow(fee, "any");
    if (r) {
      const q2 = computePendingRow(fee, "q2");
      r.quartersLabel = q2?.quartersLabel ?? "";
      return r;
    }
    return {
      srNo: fee.srNo,
      studentName: fee.studentName,
      className: fee.className,
      totalFee: fee.totalFee,
      totalPaid: fee.totalPaid,
      quartersBehind: [],
      quartersLabel: "",
      dueTillQuarter: 0,
      balance: 0,
      lastPaymentDate: "",
      latestNote: "",
      nextFollowUp: "",
    };
  }, [data, openSrNo]);

  function downloadCsv() {
    if (!data) return;
    const csv = pendingToCsv(visible);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pendingCsvFilename(filter, effectiveClass, data.today);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading pending fees…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-sm text-red-600">{error ?? "Failed to load"}</p>
        <button
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const filterLabel = PENDING_FILTERS.find((f) => f.value === filter)?.label ?? "";
  const dueColumnLabel = filter === "q1" ? "Due till Q1" : filter === "q2" ? "Due till Q2" : "Due (full balance)";

  return (
    <>
      <style>{PRINT_CSS}</style>

      {/* Follow-ups due */}
      {due.length > 0 && (
        <section className="no-print bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-200">
            <CalendarClock className="w-4 h-4 text-amber-700" />
            <h2 className="font-semibold text-amber-900">Follow-ups due ({due.length})</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {due.map(({ followUp: f, overdue, daysOverdue }) => {
              const bal = data.fees.find((x) => x.srNo === f.srNo);
              return (
                <li key={f.srNo} className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setOpenSrNo(f.srNo)}
                    className="font-medium text-blue-700 hover:underline text-left"
                  >
                    {f.studentName}
                  </button>
                  <span className="text-slate-400">{f.className}</span>
                  {bal && <span className="font-semibold text-red-600">{fmt(Math.max(0, bal.totalFee - bal.totalPaid))}</span>}
                  <span className={overdue ? "text-red-600 font-medium" : "text-amber-700 font-medium"}>
                    {overdue ? (
                      <>
                        <AlertTriangle className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />
                        Overdue {daysOverdue}d (was {f.nextFollowUp})
                      </>
                    ) : (
                      "Due today"
                    )}
                  </span>
                  <span className="text-slate-500 truncate max-w-full sm:max-w-md">{followUpNoteText(f)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Controls */}
      <div className="no-print flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pending filter">
          {PENDING_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                filter === f.value
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={effectiveClass}
          onChange={(e) => setClassFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          aria-label="Class filter"
        >
          <option value="all">All classes</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={downloadCsv}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Download CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* Print heading */}
      <div className="print-only">
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Our Lady of Fatima School — Pending fees</h2>
        <p style={{ fontSize: 12 }}>
          {filterLabel} · {effectiveClass === "all" ? "All classes" : effectiveClass} · {data.today}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print-keep">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">{filter === "any" ? "Total Outstanding" : `Due till ${filter === "q1" ? "Q1" : "Q2"}`}</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{fmt(totals.dueTotal)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Students Pending</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{totals.count}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total Balance (full year)</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{fmt(totals.balanceTotal)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className={TH}>Sr No</th>
              <th className={TH}>Student</th>
              <th className={TH}>Behind on</th>
              <th className={`${TH} text-right`}>{dueColumnLabel}</th>
              <th className={`${TH} text-right`}>Total balance</th>
              <th className={TH}>Last payment</th>
              <th className={TH}>Latest note</th>
              <th className={TH}>Next follow-up</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <AlertCircle className="w-8 h-8" />
                    <p>Nobody matches this filter.</p>
                  </div>
                </td>
              </tr>
            ) : (
              groups.map((g) => (
                <ClassGroupRows
                  key={g.className}
                  group={g}
                  today={data.today}
                  onOpen={setOpenSrNo}
                />
              ))
            )}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                <td className="px-3 py-2.5" colSpan={3}>
                  Total ({totals.count})
                </td>
                <td className="px-3 py-2.5 text-right text-red-600">{fmt(totals.dueTotal)}</td>
                <td className="px-3 py-2.5 text-right">{fmt(totals.balanceTotal)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {openRow && (
        <StudentFollowUpPanel
          key={openRow.srNo}
          row={openRow}
          today={data.today}
          onClose={() => setOpenSrNo(null)}
          onChanged={() => load()}
        />
      )}
    </>
  );
}

function ClassGroupRows({
  group,
  today,
  onOpen,
}: {
  group: ReturnType<typeof groupByClass>[number];
  today: string;
  onOpen: (srNo: string) => void;
}) {
  return (
    <>
      <tr className="print-group-header bg-slate-100/70">
        <td colSpan={8} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
          {group.className || "No class"}
        </td>
      </tr>
      {group.rows.map((r) => {
        const overdue = r.nextFollowUp !== "" && r.nextFollowUp < today;
        return (
          <tr key={r.srNo} className="border-b border-slate-50 hover:bg-slate-50 transition-colors align-top">
            <td className="px-3 py-2.5 text-slate-400 text-xs">{r.srNo}</td>
            <td className="px-3 py-2.5 font-medium text-slate-800">
              <button
                type="button"
                onClick={() => onOpen(r.srNo)}
                className="text-left text-blue-700 hover:underline print:text-black print:no-underline"
              >
                {r.studentName}
              </button>
            </td>
            <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.quartersLabel || "—"}</td>
            <td className="px-3 py-2.5 text-right font-semibold text-red-600">{fmt(r.dueTillQuarter)}</td>
            <td className="px-3 py-2.5 text-right text-slate-700">{fmt(r.balance)}</td>
            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.lastPaymentDate || "—"}</td>
            <td className="px-3 py-2.5 text-slate-600 max-w-[16rem]">{r.latestNote || <span className="text-slate-300">—</span>}</td>
            <td className={`px-3 py-2.5 whitespace-nowrap ${overdue ? "text-red-600 font-medium" : "text-slate-600"}`}>
              {r.nextFollowUp || <span className="text-slate-300">—</span>}
            </td>
          </tr>
        );
      })}
      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
        <td className="px-3 py-2" colSpan={3}>
          {group.className} subtotal ({group.count})
        </td>
        <td className="px-3 py-2 text-right">{fmt(group.dueTotal)}</td>
        <td className="px-3 py-2 text-right">{fmt(group.balanceTotal)}</td>
        <td colSpan={3} />
      </tr>
    </>
  );
}
