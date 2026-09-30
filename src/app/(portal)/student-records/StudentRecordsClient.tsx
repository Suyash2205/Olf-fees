"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import {
  NO_REASON_FILTER,
  UDISE_REASONS,
  aadhaarPendingCsv,
  aadhaarPendingList,
  udisePendingCsv,
  udisePendingList,
  type StudentRecordView,
} from "@/lib/student-records/records";
import { portalFetch } from "@/lib/portal-fetch";
import MeasurementsTab from "./MeasurementsTab";
import UdiseStatusTab from "./UdiseStatusTab";
import { csvFilename, downloadCsv } from "./download";

type Tab = "measurements" | "udise" | "udise-pending" | "aadhaar-pending";

const TABS: { id: Tab; label: string }[] = [
  { id: "measurements", label: "Height & weight" },
  { id: "udise", label: "UDISE status" },
  { id: "udise-pending", label: "UDISE pending" },
  { id: "aadhaar-pending", label: "Aadhaar pending" },
];

export default function StudentRecordsClient() {
  const [tab, setTab] = useState<Tab>("measurements");
  const [students, setStudents] = useState<StudentRecordView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await portalFetch("/api/student-records");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load student records");
      setStudents(data.students ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load student records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = () => {
    setLoading(true);
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="ml-auto rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          aria-label="Reload"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {loading && students.length === 0 && !error && (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading students…</span>
        </div>
      )}

      {students.length > 0 && tab === "measurements" && (
        <MeasurementsTab students={students} onSaved={load} />
      )}
      {students.length > 0 && tab === "udise" && <UdiseStatusTab students={students} onSaved={load} />}
      {students.length > 0 && tab === "udise-pending" && <UdisePendingTab students={students} />}
      {students.length > 0 && tab === "aadhaar-pending" && <AadhaarPendingTab students={students} />}
    </div>
  );
}

const th = "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500";

function UdisePendingTab({ students }: { students: StudentRecordView[] }) {
  const [reason, setReason] = useState("");
  const rows = useMemo(() => udisePendingList(students, reason || undefined), [students, reason]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          aria-label="Filter by reason"
        >
          <option value="">All reasons</option>
          {UDISE_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value={NO_REASON_FILTER}>{NO_REASON_FILTER}</option>
        </select>
        <span className="text-sm text-slate-500">
          {rows.length} student{rows.length === 1 ? "" : "s"} pending (1st Std and above)
        </span>
        <button
          type="button"
          onClick={() => downloadCsv(csvFilename("udise-pending", reason), udisePendingCsv(rows))}
          disabled={rows.length === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Download CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              {["Class", "Sr No", "Name", "GR No", "Status", "Reason", "Note", "PEN"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Nothing pending.
                </td>
              </tr>
            )}
            {rows.map((v) => (
              <tr key={v.srNo}>
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{v.className}</td>
                <td className="px-4 py-2.5 text-slate-400">{v.srNo}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{v.studentName}</td>
                <td className="px-4 py-2.5 text-slate-500">{v.grNo || "—"}</td>
                <td className="px-4 py-2.5">{v.udiseStatus || "Not updated"}</td>
                <td className="px-4 py-2.5">{v.udiseReason || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-2.5 text-slate-500">{v.udiseNote}</td>
                <td className="px-4 py-2.5 text-xs text-green-700">{v.penFound ? "PEN found in UDISE import" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AadhaarPendingTab({ students }: { students: StudentRecordView[] }) {
  const rows = useMemo(() => aadhaarPendingList(students), [students]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-500">
          {rows.length} active student{rows.length === 1 ? "" : "s"} without an Aadhaar number on record
        </span>
        <button
          type="button"
          onClick={() => downloadCsv(csvFilename("aadhaar-pending"), aadhaarPendingCsv(rows))}
          disabled={rows.length === 0}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Download CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              {["Class", "Sr No", "Name", "GR No", "Status"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Every active student has an Aadhaar number.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.srNo}>
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{r.className}</td>
                <td className="px-4 py-2.5 text-slate-400">{r.srNo}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.studentName}</td>
                <td className="px-4 py-2.5 text-slate-500">{r.grNo || "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.statusNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
