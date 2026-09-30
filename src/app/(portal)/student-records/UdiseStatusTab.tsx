"use client";

import { useMemo, useState } from "react";
import {
  UDISE_NOT_APPLICABLE_TEXT,
  UDISE_REASONS,
  UDISE_STATUSES,
  type StudentRecordView,
} from "@/lib/student-records/records";
import { sortClassNames } from "@/lib/sort-by-grade";
import { portalFetch } from "@/lib/portal-fetch";

interface Draft {
  status: string;
  reason: string;
  note: string;
}

const sel = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm";

export default function UdiseStatusTab({
  students,
  onSaved,
}: {
  students: StudentRecordView[];
  onSaved: () => Promise<void>;
}) {
  const classes = useMemo(() => sortClassNames(new Set(students.map((s) => s.className))), [students]);
  const [className, setClassName] = useState(classes.find((c) => students.some((s) => s.className === c && s.udiseApplicable)) ?? classes[0] ?? "");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => students.filter((s) => s.className === className), [students, className]);
  const current = (s: StudentRecordView): Draft =>
    drafts[s.srNo] ?? { status: s.udiseStatus, reason: s.udiseReason, note: s.udiseNote };
  const dirty = rows.filter((s) => {
    const d = drafts[s.srNo];
    return s.udiseApplicable && d && (d.status !== s.udiseStatus || d.reason !== s.udiseReason || d.note !== s.udiseNote);
  });

  function edit(s: StudentRecordView, patch: Partial<Draft>) {
    setNotice(null);
    setDrafts((prev) => {
      const base = prev[s.srNo] ?? { status: s.udiseStatus, reason: s.udiseReason, note: s.udiseNote };
      const next = { ...base, ...patch };
      if (next.status === "Updated") next.reason = "";
      return { ...prev, [s.srNo]: next };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await portalFetch("/api/student-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: dirty.map((s) => {
            const d = drafts[s.srNo];
            return {
              srNo: s.srNo,
              fields: { udiseStatus: d.status, udiseReason: d.reason, udiseNote: d.note },
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setNotice(`Saved ${data.saved} student${data.saved === 1 ? "" : "s"}.`);
      await onSaved();
      setDrafts((prev) => {
        const next = { ...prev };
        for (const s of dirty) delete next[s.srNo];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const applicable = rows.length > 0 && rows[0].udiseApplicable;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={className}
          onChange={(e) => {
            setClassName(e.target.value);
            setError(null);
            setNotice(null);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
          aria-label="Class"
        >
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">
          UDISE (education portal) applies to 1st Std and above.
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving || dirty.length === 0}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : dirty.length > 0 ? `Save ${dirty.length} change${dirty.length === 1 ? "" : "s"}` : "Save"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>
      )}

      {!applicable ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {UDISE_NOT_APPLICABLE_TEXT}. Pick a class from 1st Std upwards.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Sr No</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Hint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((s) => {
                const d = current(s);
                return (
                  <tr key={s.srNo} className={dirty.includes(s) ? "bg-amber-50/40" : ""}>
                    <td className="px-4 py-2 text-slate-400">{s.srNo}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{s.studentName}</td>
                    <td className="px-4 py-2">
                      <select
                        className={sel}
                        value={d.status}
                        onChange={(e) => edit(s, { status: e.target.value })}
                        aria-label={`UDISE status for ${s.studentName}`}
                      >
                        <option value="">Not set</option>
                        {UDISE_STATUSES.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className={sel}
                        value={d.reason}
                        disabled={d.status === "Updated"}
                        onChange={(e) => edit(s, { reason: e.target.value })}
                        aria-label={`UDISE reason for ${s.studentName}`}
                      >
                        <option value="">—</option>
                        {UDISE_REASONS.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-56 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        maxLength={500}
                        value={d.note}
                        onChange={(e) => edit(s, { note: e.target.value })}
                        aria-label={`UDISE note for ${s.studentName}`}
                      />
                    </td>
                    <td className="px-4 py-2 text-xs text-green-700">{s.penFound ? "PEN found in UDISE import" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
