import { format, startOfWeek } from "date-fns";
import type { AttendanceRow, AttendanceStatus } from "@/lib/attendance/types";
import { canonicalClassLabel } from "@/lib/fees/structure";
import { classSortIndex } from "@/lib/sort-by-grade";

export type AttendancePeriod = "7d" | "30d" | "90d" | "all";
export type DashboardViewMode = "class" | "student" | "date";
export type StudentGranularity = "daily" | "weekly";

export interface AttendanceClassStats {
  className: string;
  daysRecorded: number;
  present: number;
  absent: number;
  totalMarks: number;
  rate: number;
}

export interface AttendanceStudentStats {
  studentName: string;
  srNo: string;
  className: string;
  present: number;
  absent: number;
  total: number;
  rate: number;
}

export interface AttendanceDayStats {
  date: string;
  present: number;
  absent: number;
  total: number;
  rate: number;
}

export interface AttendanceStudentPicker {
  key: string;
  srNo: string;
  studentName: string;
  className: string;
}

export interface AttendanceStudentDayRow {
  date: string;
  status: AttendanceStatus;
}

export interface AttendanceStudentWeekRow {
  weekLabel: string;
  weekStart: string;
  present: number;
  absent: number;
  total: number;
  rate: number;
  cumulativeRate: number;
}

export interface AttendanceDateClassRow {
  className: string;
  present: number;
  absent: number;
  total: number;
  rate: number;
}

export interface AttendanceSummary {
  daysRecorded: number;
  totalPresent: number;
  totalAbsent: number;
  overallRate: number;
  studentsTracked: number;
}

export interface AttendanceDashboardData {
  summary: AttendanceSummary;
  classes: string[];
  students: AttendanceStudentPicker[];
  dates: string[];
  byClass: AttendanceClassStats[];
  byStudent: AttendanceStudentStats[];
  byDay: AttendanceDayStats[];
  classDaily: Record<string, AttendanceDayStats[]>;
  studentDaily: Record<string, AttendanceStudentDayRow[]>;
  dateByClass: Record<string, AttendanceDateClassRow[]>;
}

function inPeriod(date: string, period: AttendancePeriod): boolean {
  if (period === "all") return true;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(date + "T00:00:00") >= cutoff;
}

function classNameFromRow(row: AttendanceRow): string {
  return row.className ? canonicalClassLabel(row.className) : "Unknown";
}

function studentKey(row: Pick<AttendanceRow, "srNo" | "studentName">): string {
  return `${row.srNo}|${row.studentName}`;
}

function rate(present: number, total: number): number {
  return total > 0 ? Math.round((present / total) * 1000) / 10 : 0;
}

function buildSummary(
  present: number,
  absent: number,
  daysRecorded: number,
  studentsTracked: number
): AttendanceSummary {
  const total = present + absent;
  return {
    daysRecorded,
    totalPresent: present,
    totalAbsent: absent,
    overallRate: rate(present, total),
    studentsTracked,
  };
}

export function summaryFromDayStats(days: AttendanceDayStats[]): AttendanceSummary {
  const present = days.reduce((s, d) => s + d.present, 0);
  const absent = days.reduce((s, d) => s + d.absent, 0);
  return buildSummary(present, absent, days.length, 0);
}

export function summaryFromStudentDays(rows: AttendanceStudentDayRow[]): AttendanceSummary {
  const present = rows.filter((r) => r.status === "present").length;
  const absent = rows.length - present;
  const dates = new Set(rows.map((r) => r.date));
  return buildSummary(present, absent, dates.size, 1);
}

export function summaryFromDateClasses(rows: AttendanceDateClassRow[]): AttendanceSummary {
  const present = rows.reduce((s, r) => s + r.present, 0);
  const absent = rows.reduce((s, r) => s + r.absent, 0);
  const students = rows.reduce((s, r) => s + r.total, 0);
  return buildSummary(present, absent, 1, students);
}

export function computeStudentWeekly(
  rows: AttendanceStudentDayRow[]
): AttendanceStudentWeekRow[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const weekMap = new Map<string, { present: number; absent: number }>();

  for (const row of sorted) {
    const weekStart = format(startOfWeek(new Date(row.date + "T00:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const bucket = weekMap.get(weekStart) ?? { present: 0, absent: 0 };
    if (row.status === "present") bucket.present += 1;
    else bucket.absent += 1;
    weekMap.set(weekStart, bucket);
  }

  let cumulativePresent = 0;
  let cumulativeTotal = 0;

  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, stats]) => {
      const total = stats.present + stats.absent;
      cumulativePresent += stats.present;
      cumulativeTotal += total;
      const weekDate = new Date(weekStart + "T00:00:00");
      return {
        weekStart,
        weekLabel: `Week of ${format(weekDate, "d MMM")}`,
        present: stats.present,
        absent: stats.absent,
        total,
        rate: rate(stats.present, total),
        cumulativeRate: rate(cumulativePresent, cumulativeTotal),
      };
    })
    .reverse();
}

export function computeAttendanceDashboard(
  rows: AttendanceRow[],
  period: AttendancePeriod
): AttendanceDashboardData {
  const filtered = rows.filter((r) => inPeriod(r.date, period));

  const classMap = new Map<string, AttendanceClassStats>();
  const studentMap = new Map<string, AttendanceStudentStats>();
  const dayMap = new Map<string, AttendanceDayStats>();
  const classDays = new Map<string, Set<string>>();
  const classDayMap = new Map<string, Map<string, AttendanceDayStats>>();
  const studentDayMap = new Map<string, AttendanceStudentDayRow[]>();
  const dateClassMap = new Map<string, Map<string, AttendanceDateClassRow>>();
  const uniqueDates = new Set<string>();
  const studentPickers = new Map<string, AttendanceStudentPicker>();

  for (const row of filtered) {
    const cls = classNameFromRow(row);
    const key = studentKey(row);
    uniqueDates.add(row.date);

    studentPickers.set(key, {
      key,
      srNo: row.srNo,
      studentName: row.studentName,
      className: cls,
    });

    const classRow = classMap.get(cls) ?? {
      className: cls,
      daysRecorded: 0,
      present: 0,
      absent: 0,
      totalMarks: 0,
      rate: 0,
    };
    classRow.totalMarks += 1;
    if (row.status === "present") classRow.present += 1;
    else classRow.absent += 1;
    classMap.set(cls, classRow);

    const classDaySet = classDays.get(cls) ?? new Set<string>();
    classDaySet.add(row.date);
    classDays.set(cls, classDaySet);

    const perClassDays = classDayMap.get(cls) ?? new Map<string, AttendanceDayStats>();
    const classDay = perClassDays.get(row.date) ?? {
      date: row.date,
      present: 0,
      absent: 0,
      total: 0,
      rate: 0,
    };
    classDay.total += 1;
    if (row.status === "present") classDay.present += 1;
    else classDay.absent += 1;
    perClassDays.set(row.date, classDay);
    classDayMap.set(cls, perClassDays);

    const studentRow = studentMap.get(key) ?? {
      studentName: row.studentName,
      srNo: row.srNo,
      className: cls,
      present: 0,
      absent: 0,
      total: 0,
      rate: 0,
    };
    studentRow.total += 1;
    if (row.status === "present") studentRow.present += 1;
    else studentRow.absent += 1;
    studentMap.set(key, studentRow);

    const studentDays = studentDayMap.get(key) ?? [];
    studentDays.push({ date: row.date, status: row.status });
    studentDayMap.set(key, studentDays);

    const perDateClasses = dateClassMap.get(row.date) ?? new Map<string, AttendanceDateClassRow>();
    const dateClass = perDateClasses.get(cls) ?? {
      className: cls,
      present: 0,
      absent: 0,
      total: 0,
      rate: 0,
    };
    dateClass.total += 1;
    if (row.status === "present") dateClass.present += 1;
    else dateClass.absent += 1;
    perDateClasses.set(cls, dateClass);
    dateClassMap.set(row.date, perDateClasses);

    const dayRow = dayMap.get(row.date) ?? {
      date: row.date,
      present: 0,
      absent: 0,
      total: 0,
      rate: 0,
    };
    dayRow.total += 1;
    if (row.status === "present") dayRow.present += 1;
    else dayRow.absent += 1;
    dayMap.set(row.date, dayRow);
  }

  const byClass = [...classMap.values()]
    .map((c) => ({
      ...c,
      daysRecorded: classDays.get(c.className)?.size ?? 0,
      rate: rate(c.present, c.totalMarks),
    }))
    .sort((a, b) => classSortIndex(a.className) - classSortIndex(b.className));

  const byStudent = [...studentMap.values()]
    .map((s) => ({
      ...s,
      rate: rate(s.present, s.total),
    }))
    .sort((a, b) => b.rate - a.rate || a.studentName.localeCompare(b.studentName));

  const byDay = [...dayMap.values()]
    .map((d) => ({
      ...d,
      rate: rate(d.present, d.total),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const classDaily: Record<string, AttendanceDayStats[]> = {};
  for (const [cls, days] of classDayMap.entries()) {
    classDaily[cls] = [...days.values()]
      .map((d) => ({ ...d, rate: rate(d.present, d.total) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  const studentDaily: Record<string, AttendanceStudentDayRow[]> = {};
  for (const [key, days] of studentDayMap.entries()) {
    const deduped = new Map<string, AttendanceStudentDayRow>();
    for (const d of days) deduped.set(d.date, d);
    studentDaily[key] = [...deduped.values()].sort((a, b) => b.date.localeCompare(a.date));
  }

  const dateByClass: Record<string, AttendanceDateClassRow[]> = {};
  for (const [date, classes] of dateClassMap.entries()) {
    dateByClass[date] = [...classes.values()]
      .map((c) => ({ ...c, rate: rate(c.present, c.total) }))
      .sort((a, b) => classSortIndex(a.className) - classSortIndex(b.className));
  }

  const totalPresent = filtered.filter((r) => r.status === "present").length;
  const totalAbsent = filtered.filter((r) => r.status === "absent").length;

  const students = [...studentPickers.values()].sort(
    (a, b) =>
      classSortIndex(a.className) - classSortIndex(b.className) ||
      a.studentName.localeCompare(b.studentName)
  );

  const classes = byClass.map((c) => c.className);
  const dates = [...uniqueDates].sort((a, b) => b.localeCompare(a));

  return {
    summary: buildSummary(totalPresent, totalAbsent, uniqueDates.size, studentMap.size),
    classes,
    students,
    dates,
    byClass,
    byStudent,
    byDay,
    classDaily,
    studentDaily,
    dateByClass,
  };
}
