"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import type { FlaggedStudent } from "@/lib/attendance/chronic-absence";
import { portalFetch } from "@/lib/portal-fetch";

interface AbsenceResponse {
  dateIso: string;
  total: number;
  absentEveryDay: FlaggedStudent[];
  byClass: { className: string; students: FlaggedStudent[] }[];
  countsByClass: { className: string; count: number }[];
}

function fmt(iso: string | null): string {
  if (!iso) return "no present day on record";
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

function StudentLine({ s }: { s: FlaggedStudent }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-slate-100 py-2 last:border-0">
      <span className="font-medium text-slate-800">
        {s.studentName} <span className="text-xs font-normal text-slate-400">Sr No {s.srNo}</span>
      </span>
      <span className="text-xs text-slate-500">
        <span className="font-medium text-red-700">{s.reasons.join("; ")}</span> · last present {fmt(s.lastPresentDate)}
      </span>
    </li>
  );
}

/** Teacher-visible repeated-absence list. No parent names or phone numbers. */
export default function ChronicAbsencePanel() {
  const [data, setData] = useState<AbsenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await portalFetch("/api/attendance/absence");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load the absence list");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the absence list");
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
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="text-sm font-semibold text-slate-800">
            Repeated absence{data ? ` — ${data.total} student${data.total === 1 ? "" : "s"}` : ""}
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          aria-label="Refresh absence list"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            Absent on the 3 most recent marked school days, or on 4 or more of the last 10. Days a class was not
            marked, and holidays, are skipped.
          </p>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {data && data.total === 0 && !error && (
            <p className="text-sm text-slate-500">No student is flagged right now.</p>
          )}
          {data && data.absentEveryDay.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Absent every day in the window
              </h3>
              <ul className="mt-1">
                {data.absentEveryDay.map((s) => (
                  <li key={s.srNo} className="border-b border-slate-100 py-2 last:border-0">
                    <StudentLineInner s={s} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data?.byClass.map((g) => (
            <div key={g.className}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {g.className} ({g.students.length})
              </h3>
              <ul className="mt-1">
                {g.students.map((s) => (
                  <StudentLine key={s.srNo} s={s} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentLineInner({ s }: { s: FlaggedStudent }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <span className="font-medium text-slate-800">
        {s.studentName}{" "}
        <span className="text-xs font-normal text-slate-400">
          {s.className} · Sr No {s.srNo}
        </span>
      </span>
      <span className="text-xs text-slate-500">
        <span className="font-medium text-red-700">{s.reasons.join("; ")}</span> · last present {fmt(s.lastPresentDate)}
      </span>
    </div>
  );
}
