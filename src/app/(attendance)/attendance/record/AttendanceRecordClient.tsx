"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, RefreshCw, Search, Users } from "lucide-react";
import type { AttendanceStatus } from "@/lib/attendance/types";
import { todayISO } from "@/lib/attendance/types";
import { portalFetch } from "@/lib/portal-fetch";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type Student = { srNo: string; studentName: string; className: string };
type ClassOption = { className: string; studentCount: number; markedToday?: boolean };

const MARKED_STORAGE_KEY = "attendance-marked";
const CLASSES_CACHE_KEY = "attendance-classes-cache";

function getOptimisticMarked(date: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(MARKED_STORAGE_KEY);
    if (!raw) return new Set();
    const data = JSON.parse(raw) as Record<string, string[]>;
    return new Set(data[date] ?? []);
  } catch {
    return new Set();
  }
}

function addOptimisticMarked(date: string, className: string) {
  try {
    const raw = sessionStorage.getItem(MARKED_STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    data[date] = [...new Set([...(data[date] ?? []), className])];
    sessionStorage.setItem(MARKED_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function getCachedClasses(date: string): ClassOption[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CLASSES_CACHE_KEY);
    if (!raw) return null;
    const { date: cachedDate, classes } = JSON.parse(raw) as {
      date: string;
      classes: ClassOption[];
    };
    if (cachedDate !== date) return null;
    return classes;
  } catch {
    return null;
  }
}

function setCachedClasses(date: string, classes: ClassOption[]) {
  try {
    sessionStorage.setItem(CLASSES_CACHE_KEY, JSON.stringify({ date, classes }));
  } catch {
    /* ignore */
  }
}

function mergeMarked(classes: ClassOption[], date: string): ClassOption[] {
  const optimistic = getOptimisticMarked(date);
  return classes.map((c) => ({
    ...c,
    markedToday: c.markedToday || optimistic.has(c.className),
  }));
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

export default function AttendanceRecordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classParam = searchParams.get("class")?.trim() ?? "";
  const dateParam = searchParams.get("date")?.trim() ?? "";
  const today = todayISO();
  const isHistoryEdit = Boolean(dateParam);
  const activeDate = isHistoryEdit ? dateParam : today;

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [refreshingClasses, setRefreshingClasses] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [bulkUnlocked, setBulkUnlocked] = useState(false);
  const [search, setSearch] = useState("");

  const loadClasses = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (!background) {
      setLoading(true);
    } else {
      setRefreshingClasses(true);
    }
    setError(null);
    try {
      const res = await portalFetch(`/api/attendance/classes?date=${encodeURIComponent(today)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load classes");
      const next = mergeMarked(data.classes ?? [], today);
      setClasses(next);
      setCachedClasses(today, data.classes ?? []);
    } catch (e) {
      if (!background) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      setLoading(false);
      setRefreshingClasses(false);
    }
  }, [today]);

  const loadStudents = useCallback(async (className: string, date: string) => {
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, recordRes] = await Promise.all([
        portalFetch(`/api/attendance/students?class=${encodeURIComponent(className)}`),
        portalFetch(
          `/api/attendance/record?class=${encodeURIComponent(className)}&date=${encodeURIComponent(date)}`
        ),
      ]);
      const studentsData = await studentsRes.json();
      const recordData = await recordRes.json();
      if (!studentsRes.ok) throw new Error(studentsData.error ?? "Failed to load students");

      const list: Student[] = studentsData.students ?? [];
      setStudents(list);

      const existing: { srNo: string; status: AttendanceStatus }[] = recordData.records ?? [];
      const map: Record<string, AttendanceStatus> = {};
      for (const s of list) {
        const hit = existing.find((e) => e.srNo === s.srNo);
        map[s.srNo] = hit?.status ?? "absent";
      }
      setStatusMap(map);
      setBulkUnlocked(existing.length > 0);
      setSearch("");
      setAlreadySubmitted(existing.length > 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setStudents([]);
      setStatusMap({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!classParam) {
      const cached = getCachedClasses(today);
      if (cached?.length) {
        setClasses(mergeMarked(cached, today));
        void loadClasses({ background: true });
      } else {
        void loadClasses();
      }
      return;
    }
    loadStudents(classParam, activeDate);
  }, [classParam, activeDate, loadClasses, loadStudents, today]);

  const counts = useMemo(() => {
    const values = Object.values(statusMap);
    const present = values.filter((s) => s === "present").length;
    return { present, absent: values.length - present, total: values.length };
  }, [statusMap]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.studentName.toLowerCase().includes(q));
  }, [students, search]);

  function setAll(status: AttendanceStatus) {
    const next: Record<string, AttendanceStatus> = {};
    for (const s of students) next[s.srNo] = status;
    setStatusMap(next);
  }

  function toggle(srNo: string) {
    setStatusMap((prev) => ({
      ...prev,
      [srNo]: prev[srNo] === "present" ? "absent" : "present",
    }));
  }

  async function submitAttendance() {
    if (!classParam) return;
    setSaving(true);
    setError(null);
    try {
      const records = students.map((s) => ({
        studentName: s.studentName,
        srNo: s.srNo,
        status: statusMap[s.srNo] ?? "absent",
      }));
      const res = await portalFetch("/api/attendance/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          className: classParam,
          date: activeDate,
          source: isHistoryEdit ? "history" : "today",
          records,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setConfirmOpen(false);
      if (!isHistoryEdit) {
        addOptimisticMarked(today, classParam);
        setClasses((prev) => {
          const base =
            prev.length > 0
              ? prev
              : getCachedClasses(today) ?? [{ className: classParam, studentCount: students.length }];
          const next = base.map((c) =>
            c.className === classParam ? { ...c, markedToday: true } : c
          );
          setCachedClasses(today, next);
          return mergeMarked(next, today);
        });
      }
      router.push(isHistoryEdit ? "/attendance/history" : "/attendance/record");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSaving(false);
    }
  }

  if (!classParam) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Record attendance</h1>
          <p className="text-sm text-slate-500 mt-1">
            Select a class for today — {formatDate(today)}
            {refreshingClasses && <span className="text-slate-400"> · Updating…</span>}
          </p>
        </div>

        {loading && classes.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading classes…</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map((c) => (
            <button
              key={c.className}
              type="button"
              onClick={() => router.push(`/attendance/record?class=${encodeURIComponent(c.className)}`)}
              className={`flex items-center justify-between rounded-xl border p-4 text-left transition-colors ${
                c.markedToday
                  ? "border-green-300 bg-green-50 hover:bg-green-100/80"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
              }`}
            >
              <div className="min-w-0">
                <p
                  className={`font-semibold ${c.markedToday ? "text-green-800" : "text-slate-800"}`}
                >
                  {c.className}
                </p>
                <p
                  className={`text-xs mt-0.5 ${c.markedToday ? "text-green-700 font-medium" : "text-slate-500"}`}
                >
                  {c.markedToday ? "Attendance already marked" : `${c.studentCount} students`}
                </p>
              </div>
              {c.markedToday ? (
                <Check className="h-5 w-5 text-green-600 shrink-0" />
              ) : (
                <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => router.push(isHistoryEdit ? "/attendance/history" : "/attendance")}
            className="text-xs text-blue-600 font-medium mb-1"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-slate-800">{classParam}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {formatDate(activeDate)}
            {!isHistoryEdit && <span className="text-slate-400"> · Today (fixed)</span>}
          </p>
        </div>
        <div className="rounded-xl bg-slate-100 px-3 py-2 text-center shrink-0">
          <p className="text-lg font-bold text-green-700">{counts.present}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Present</p>
          <p className="text-xs text-red-600 font-medium mt-0.5">{counts.absent} absent</p>
        </div>
      </div>

      {alreadySubmitted && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Attendance already recorded for this date. Submit again to update.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <div
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition-colors ${
            bulkUnlocked
              ? "border-green-200 bg-green-50/50"
              : "border-slate-200 bg-slate-100"
          }`}
        >
          <div>
            <p className="text-sm font-semibold text-slate-800">Select all</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {bulkUnlocked ? "Bulk actions enabled" : "Enable to mark everyone at once"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={bulkUnlocked}
            aria-label="Select all"
            onClick={() => setBulkUnlocked((v) => !v)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
              bulkUnlocked ? "bg-green-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                bulkUnlocked ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAll("present")}
            disabled={!bulkUnlocked}
            className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition-colors ${
              bulkUnlocked
                ? "border-green-200 bg-green-50 text-green-800 hover:bg-green-100 active:bg-green-100"
                : "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            All Present
          </button>
          <button
            type="button"
            onClick={() => setAll("absent")}
            disabled={!bulkUnlocked}
            className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition-colors ${
              bulkUnlocked
                ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100 active:bg-red-100"
                : "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            All Absent
          </button>
        </div>
      </div>

      {!loading && students.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students…"
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading students…</span>
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
          No active students in this class.
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No students match your search.
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredStudents.map((student) => {
            const status = statusMap[student.srNo] ?? "absent";
            const isPresent = status === "present";
            return (
              <li key={student.srNo}>
                <div
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition-colors ${
                    isPresent
                      ? "border-green-200 bg-green-50/40"
                      : "border-red-200 bg-red-50/70"
                  }`}
                >
                  <span className="font-medium text-slate-800 min-w-0 flex-1 leading-snug">
                    {student.studentName}
                  </span>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={`text-xs font-semibold w-14 text-right ${
                        isPresent ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {isPresent ? "Present" : "Absent"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isPresent}
                      aria-label={`${student.studentName} — ${isPresent ? "present" : "absent"}`}
                      onClick={() => toggle(student.srNo)}
                      className={`relative h-8 w-14 rounded-full transition-colors ${
                        isPresent ? "bg-green-500" : "bg-red-400"
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                          isPresent ? "translate-x-6" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {students.length > 0 && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={saving}
          className="w-full rounded-xl bg-blue-600 py-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 shadow-sm"
        >
          Submit attendance
        </button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm attendance"
        description={`${classParam} · ${formatDate(activeDate)}\n\nTotal: ${counts.total}\nPresent: ${counts.present}\nAbsent: ${counts.absent}`}
        confirmLabel="Confirm & submit"
        busy={saving}
        error={saving ? null : error}
        onClose={() => !saving && setConfirmOpen(false)}
        onConfirm={submitAttendance}
      />
    </div>
  );
}
