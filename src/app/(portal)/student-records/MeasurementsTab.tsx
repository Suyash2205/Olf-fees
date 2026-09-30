"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { measurementsCsv, type StudentRecordView } from "@/lib/student-records/records";
import { sortClassNames } from "@/lib/sort-by-grade";
import { todayISO } from "@/lib/attendance/types";
import { portalFetch } from "@/lib/portal-fetch";
import { csvFilename, downloadCsv } from "./download";

interface Draft {
  height: string;
  weight: string;
  measuredOn: string;
}

const cellInput = "w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm";

export default function MeasurementsTab({
  students,
  onSaved,
}: {
  students: StudentRecordView[];
  onSaved: () => Promise<void>;
}) {
  const classes = useMemo(() => sortClassNames(new Set(students.map((s) => s.className))), [students]);
  const [className, setClassName] = useState(classes[0] ?? "");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => students.filter((s) => s.className === className), [students, className]);
  const current = (s: StudentRecordView): Draft =>
    drafts[s.srNo] ?? { height: s.height, weight: s.weight, measuredOn: s.measuredOn };
  const dirty = rows.filter((s) => {
    const d = drafts[s.srNo];
    return d && (d.height !== s.height || d.weight !== s.weight || d.measuredOn !== s.measuredOn);
  });

  function edit(s: StudentRecordView, patch: Partial<Draft>) {
    setNotice(null);
    setDrafts((prev) => {
      const base = prev[s.srNo] ?? { height: s.height, weight: s.weight, measuredOn: s.measuredOn };
      const next = { ...base, ...patch };
      // A measurement without a date gets today's date as a starting point (still editable).
      if (("height" in patch || "weight" in patch) && !next.measuredOn) next.measuredOn = todayISO();
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
            return { srNo: s.srNo, fields: { height: d.height, weight: d.weight, measuredOn: d.measuredOn } };
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
          {rows.length} students · height 50–220 cm, weight 5–150 kg
        </span>
        <button
          type="button"
          onClick={() => downloadCsv(csvFilename("height-weight", className), measurementsCsv(rows))}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" /> Download CSV
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || dirty.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Sr No</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Height (cm)</th>
              <th className="px-4 py-3">Weight (kg)</th>
              <th className="px-4 py-3">Measured on</th>
              <th className="px-4 py-3">UDISE import</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((s) => {
              const d = current(s);
              const hint = [s.udiseHeightHint && `${s.udiseHeightHint} cm`, s.udiseWeightHint && `${s.udiseWeightHint} kg`]
                .filter(Boolean)
                .join(" / ");
              return (
                <tr key={s.srNo} className={drafts[s.srNo] && dirty.includes(s) ? "bg-amber-50/40" : ""}>
                  <td className="px-4 py-2 text-slate-400">{s.srNo}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">{s.studentName}</td>
                  <td className="px-4 py-2">
                    <input
                      inputMode="decimal"
                      className={cellInput}
                      value={d.height}
                      onChange={(e) => edit(s, { height: e.target.value })}
                      aria-label={`Height for ${s.studentName}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      inputMode="decimal"
                      className={cellInput}
                      value={d.weight}
                      onChange={(e) => edit(s, { weight: e.target.value })}
                      aria-label={`Weight for ${s.studentName}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="date"
                      max={todayISO()}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      value={d.measuredOn}
                      onChange={(e) => edit(s, { measuredOn: e.target.value })}
                      aria-label={`Measured on for ${s.studentName}`}
                    />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {hint ? (
                      <>
                        {hint}{" "}
                        {!d.height && !d.weight && (
                          <button
                            type="button"
                            className="font-medium text-blue-600"
                            onClick={() => edit(s, { height: s.udiseHeightHint, weight: s.udiseWeightHint })}
                          >
                            use
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
