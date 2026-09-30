/**
 * Chronic-absence detection — pure logic (no I/O).
 *
 * Window: for each active student, the last 10 school days of their class, up to and
 * including today, on which THEIR CLASS WAS MARKED. Unmarked days are unknown (not absent)
 * and are skipped; holidays / non-school days are excluded even if data exists on them.
 *
 * Flag when either:
 *   - the 3 most recent marked school days are all absent ("3 days in a row"), or
 *   - absent on >= 4 of the (up to) 10 marked school days.
 * "Absent every day": absent on ALL window days, with at least 5 window days.
 *
 * Students are identified by Sr No only; the roster (active students) is supplied by the
 * caller, so departed students never appear and duplicate names stay distinct.
 */
import { canonicalClassLabel } from "@/lib/fees/structure";
import { classSortIndex } from "@/lib/sort-by-grade";
import type { AttendanceRow } from "@/lib/attendance/types";
import { isSchoolDay, type CalendarEntry } from "@/lib/attendance/school-calendar";

export const ABSENCE_WINDOW_DAYS = 10;
export const ABSENCE_STREAK_DAYS = 3;
export const ABSENCE_MIN_ABSENT_IN_WINDOW = 4;
export const ABSENCE_EVERY_DAY_MIN_WINDOW = 5;

export interface AbsenceRosterStudent {
  srNo: string;
  studentName: string;
  className: string;
}

export interface FlaggedStudent {
  srNo: string;
  studentName: string;
  className: string;
  /** Human reasons, e.g. ["3 days in a row", "5 of last 10 school days"]. */
  reasons: string[];
  streak: boolean;
  absentCount: number;
  windowDays: number;
  absentEveryDay: boolean;
  /** Most recent school day the student was marked present, or null. */
  lastPresentDate: string | null;
}

export interface ChronicAbsenceReport {
  dateIso: string;
  /** Every flagged student, in class order then name. */
  flagged: FlaggedStudent[];
  /** Subset of flagged: absent on every window day (window >= 5). */
  absentEveryDay: FlaggedStudent[];
  /** Flagged students not in absentEveryDay, grouped by class in class order. */
  byClass: { className: string; students: FlaggedStudent[] }[];
  /** Flagged count per class (includes the absent-every-day students). */
  countsByClass: { className: string; count: number }[];
}

/** True when any class has any mark on this date (used to skip the alert on an unrecorded day). */
export function anyMarkedOn(rows: { date: string }[], dateIso: string): boolean {
  return rows.some((r) => r.date === dateIso);
}

export function reasonText(f: { streak: boolean; absentCount: number; windowDays: number }): string[] {
  const out: string[] = [];
  if (f.streak) out.push(`${ABSENCE_STREAK_DAYS} days in a row`);
  if (f.absentCount >= ABSENCE_MIN_ABSENT_IN_WINDOW) {
    out.push(`${f.absentCount} of last ${f.windowDays} school days`);
  }
  return out;
}

export function computeChronicAbsence(input: {
  rows: AttendanceRow[];
  roster: AbsenceRosterStudent[];
  entries: CalendarEntry[];
  todayIso: string;
}): ChronicAbsenceReport {
  const { rows, roster, entries, todayIso } = input;

  // class -> date -> srNo -> present?
  const byClassDate = new Map<string, Map<string, Map<string, boolean>>>();
  for (const r of rows) {
    if (!r.date || r.date > todayIso) continue;
    const cls = canonicalClassLabel(r.className ?? "");
    let dates = byClassDate.get(cls);
    if (!dates) byClassDate.set(cls, (dates = new Map()));
    let day = dates.get(r.date);
    if (!day) dates.set(r.date, (day = new Map()));
    day.set(String(r.srNo).trim(), r.status === "present");
  }

  // class -> marked school days, newest first (max 10)
  const windowByClass = new Map<string, string[]>();
  const windowFor = (cls: string): string[] => {
    let w = windowByClass.get(cls);
    if (!w) {
      const marked = [...(byClassDate.get(cls)?.keys() ?? [])]
        .filter((d) => isSchoolDay(d, cls, entries))
        .sort()
        .reverse();
      w = marked.slice(0, ABSENCE_WINDOW_DAYS);
      windowByClass.set(cls, w);
    }
    return w;
  };

  const flagged: FlaggedStudent[] = [];
  for (const s of roster) {
    const cls = canonicalClassLabel(s.className);
    const dates = byClassDate.get(cls);
    if (!dates) continue;
    const srNo = String(s.srNo).trim();

    // The student's own marks on the class's window days (a day they have no row for is unknown).
    const marks: boolean[] = [];
    for (const d of windowFor(cls)) {
      const v = dates.get(d)?.get(srNo);
      if (v !== undefined) marks.push(v);
    }
    if (marks.length === 0) continue;

    const absentCount = marks.filter((p) => !p).length;
    const streak =
      marks.length >= ABSENCE_STREAK_DAYS && marks.slice(0, ABSENCE_STREAK_DAYS).every((p) => !p);
    if (!streak && absentCount < ABSENCE_MIN_ABSENT_IN_WINDOW) continue;

    let lastPresentDate: string | null = null;
    for (const d of [...dates.keys()].sort().reverse()) {
      if (dates.get(d)?.get(srNo) === true && isSchoolDay(d, cls, entries)) {
        lastPresentDate = d;
        break;
      }
    }

    flagged.push({
      srNo,
      studentName: s.studentName,
      className: cls,
      reasons: reasonText({ streak, absentCount, windowDays: marks.length }),
      streak,
      absentCount,
      windowDays: marks.length,
      absentEveryDay: marks.length >= ABSENCE_EVERY_DAY_MIN_WINDOW && absentCount === marks.length,
      lastPresentDate,
    });
  }

  flagged.sort(
    (a, b) =>
      classSortIndex(a.className) - classSortIndex(b.className) ||
      a.studentName.localeCompare(b.studentName, "en", { sensitivity: "base" }) ||
      a.srNo.localeCompare(b.srNo, "en", { numeric: true })
  );

  const absentEveryDay = flagged.filter((f) => f.absentEveryDay);
  const groups = new Map<string, FlaggedStudent[]>();
  const counts = new Map<string, number>();
  for (const f of flagged) {
    counts.set(f.className, (counts.get(f.className) ?? 0) + 1);
    if (f.absentEveryDay) continue;
    const g = groups.get(f.className) ?? [];
    g.push(f);
    groups.set(f.className, g);
  }

  return {
    dateIso: todayIso,
    flagged,
    absentEveryDay,
    byClass: [...groups.entries()].map(([className, students]) => ({ className, students })),
    countsByClass: [...counts.entries()].map(([className, count]) => ({ className, count })),
  };
}
