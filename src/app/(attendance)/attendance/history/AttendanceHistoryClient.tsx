"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";
import { portalFetch } from "@/lib/portal-fetch";

type ClassOption = { className: string; studentCount: number };
type DaySummary = {
  date: string;
  present: number;
  absent: number;
  total: number;
  teacherName: string;
};

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

export default function AttendanceHistoryClient() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [history, setHistory] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await portalFetch("/api/attendance/classes");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        const list: ClassOption[] = data.classes ?? [];
        setClasses(list);
        if (list[0]) setSelectedClass(list[0].className);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadHistory = useCallback(async (className: string) => {
    if (!className) return;
    setHistoryLoading(true);
    setError(null);
    try {
      const res = await portalFetch(
        `/api/attendance/record?class=${encodeURIComponent(className)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setHistory(data.history ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClass) loadHistory(selectedClass);
  }, [selectedClass, loadHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Recorded attendance</h1>
        <p className="text-sm text-slate-500 mt-1">View or edit past attendance by class</p>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Class</span>
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800"
        >
          {classes.map((c) => (
            <option key={c.className} value={c.className}>
              {c.className} ({c.studentCount})
            </option>
          ))}
        </select>
      </label>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {historyLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No attendance recorded for this class yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {history.map((day) => (
            <li key={day.date}>
              <Link
                href={`/attendance/record?class=${encodeURIComponent(selectedClass)}&date=${day.date}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                <div>
                  <p className="font-semibold text-slate-800">{formatDate(day.date)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {day.teacherName ? `By ${day.teacherName} · ` : ""}
                    Present {day.present} · Absent {day.absent}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
