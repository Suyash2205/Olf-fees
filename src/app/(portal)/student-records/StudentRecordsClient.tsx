"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import {
  NO_REASON_FILTER,
  UDISE_REASONS,
  UDISE_STATUSES,
  aadhaarPendingCsv,
  aadhaarPendingList,
  udisePendingCsv,
  udisePendingList,
  type StudentRecordView,
} from "@/lib/student-records/records";
import { portalFetch } from "@/lib/portal-fetch";
import { validateDetail, detailField } from "@/lib/student-records/details";
import { todayISO } from "@/lib/attendance/types";
import MeasurementsTab from "./MeasurementsTab";
import MissingDetailsTab from "./MissingDetailsTab";
import UdiseStatusTab from "./UdiseStatusTab";
import { csvFilename, downloadCsv } from "./download";

type Tab = "missing" | "measurements" | "udise" | "udise-pending" | "aadhaar-pending";

const TABS: { id: Tab; label: string }[] = [
  { id: "missing", label: "Missing details" },
  { id: "measurements", label: "Height & weight" },
  { id: "udise", label: "UDISE status" },
  { id: "udise-pending", label: "UDISE pending" },
  { id: "aadhaar-pending", label: "Aadhaar pending" },
];

export default function StudentRecordsClient() {
  const [tab, setTab] = useState<Tab>("missing");
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

      {tab === "missing" && <MissingDetailsTab />}
      {students.length > 0 && tab === "measurements" && (
        <MeasurementsTab students={students} onSaved={load} />
      )}
      {students.length > 0 && tab === "udise" && <UdiseStatusTab students={students} onSaved={load} />}
      {students.length > 0 && tab === "udise-pending" && <UdisePendingTab students={students} onSaved={load} />}
      {students.length > 0 && tab === "aadhaar-pending" && <AadhaarPendingTab students={students} onSaved={load} />}
    </div>
  );
}

const th = "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500";

const sel = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm";

interface UdiseDraft {
  status: string;
  reason: string;
  note: string;
}

/** Shared save + status line for the two pending lists. */
function useSave(url: string, onSaved: () => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function save(updates: { srNo: string; fields: Record<string, string> }[], done: () => void) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await portalFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setNotice(`Saved ${updates.length} student${updates.length === 1 ? "" : "s"}.`);
      done();
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }
  const banner = (
    <>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>}
    </>
  );
  return { saving, save, banner, clearNotice: () => setNotice(null) };
}

function SaveButton({ saving, count, onClick }: { saving: boolean; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || count === 0}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {saving ? "Saving…" : count > 0 ? `Save ${count} change${count === 1 ? "" : "s"}` : "Save"}
    </button>
  );
}

function UdisePendingTab({ students, onSaved }: { students: StudentRecordView[]; onSaved: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  // Rows stay put while being edited; the list refreshes after a save.
  const rows = useMemo(() => udisePendingList(students, reason || undefined), [students, reason]);
  const [drafts, setDrafts] = useState<Record<string, UdiseDraft>>({});
  const { saving, save, banner, clearNotice } = useSave("/api/student-records", onSaved);
  const current = (v: StudentRecordView): UdiseDraft => drafts[v.srNo] ?? { status: v.udiseStatus, reason: v.udiseReason, note: v.udiseNote };
  const dirty = students.filter((v) => {
    const d = drafts[v.srNo];
    return d && (d.status !== v.udiseStatus || d.reason !== v.udiseReason || d.note !== v.udiseNote);
  });
  function edit(v: StudentRecordView, patch: Partial<UdiseDraft>) {
    clearNotice();
    setDrafts((prev) => {
      const next = { ...current(v), ...patch };
      if (next.status === "Updated") next.reason = "";
      return { ...prev, [v.srNo]: next };
    });
  }
  const onSave = () =>
    save(
      dirty.map((v) => ({ srNo: v.srNo, fields: { udiseStatus: drafts[v.srNo].status, udiseReason: drafts[v.srNo].reason, udiseNote: drafts[v.srNo].note } })),
      () => setDrafts({})
    );
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
        <SaveButton saving={saving} count={dirty.length} onClick={onSave} />
      </div>
      {banner}
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
            {rows.map((v) => {
              const d = current(v);
              return (
                <tr key={v.srNo} className={drafts[v.srNo] ? "bg-amber-50/40" : ""}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{v.className}</td>
                  <td className="px-4 py-2.5 text-slate-400">{v.srNo}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{v.studentName}</td>
                  <td className="px-4 py-2.5 text-slate-500">{v.grNo || "—"}</td>
                  <td className="px-4 py-2">
                    <select className={sel} value={d.status} onChange={(e) => edit(v, { status: e.target.value })} aria-label={`UDISE status for ${v.studentName}`}>
                      <option value="">Not set</option>
                      {UDISE_STATUSES.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select className={sel} value={d.reason} disabled={d.status === "Updated"} onChange={(e) => edit(v, { reason: e.target.value })} aria-label={`UDISE reason for ${v.studentName}`}>
                      <option value="">—</option>
                      {UDISE_REASONS.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input className="w-48 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" maxLength={500} value={d.note} onChange={(e) => edit(v, { note: e.target.value })} aria-label={`UDISE note for ${v.studentName}`} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-green-700">{v.penFound ? "PEN found in UDISE import" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AadhaarPendingTab({ students, onSaved }: { students: StudentRecordView[]; onSaved: () => Promise<void> }) {
  const rows = useMemo(() => aadhaarPendingList(students), [students]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { saving, save, banner, clearNotice } = useSave("/api/student-records/details", onSaved);
  const field = detailField("aadhar")!;
  const today = todayISO();
  const entered = Object.entries(drafts).filter(([, v]) => v.trim());
  const bad = entered.filter(([, v]) => !validateDetail(field, v, today).ok);
  const onSave = () => save(entered.map(([srNo, v]) => ({ srNo, fields: { aadhar: v } })), () => setDrafts({}));
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
        <SaveButton saving={saving || bad.length > 0} count={entered.length} onClick={onSave} />
      </div>
      {banner}
      {bad.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Aadhaar must be 12 digits — check the boxes outlined in red.
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              {["Class", "Sr No", "Name", "GR No", "Status", "Aadhaar no."].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
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
                <td className="px-4 py-2">
                  <input
                    className={`w-40 rounded-lg border bg-white px-2 py-1.5 text-sm ${
                      drafts[r.srNo]?.trim() && !validateDetail(field, drafts[r.srNo], today).ok ? "border-red-400" : "border-slate-200"
                    }`}
                    inputMode="numeric"
                    maxLength={14}
                    value={drafts[r.srNo] ?? ""}
                    onChange={(e) => {
                      clearNotice();
                      setDrafts((p) => ({ ...p, [r.srNo]: e.target.value }));
                    }}
                    aria-label={`Aadhaar for ${r.studentName}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
