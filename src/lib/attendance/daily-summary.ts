import { format, parseISO } from "date-fns";
import { getAttendanceClassSummaries } from "@/lib/attendance/students";
import { canonicalClassLabel } from "@/lib/fees/structure";
import { classSortIndex } from "@/lib/sort-by-grade";
import { readAllAttendanceRows } from "@/lib/sheets/attendance";

export interface DailyClassAttendanceRow {
  className: string;
  total: number;
  present: number;
  absent: number;
  rate: number;
}

export interface DailyAttendanceSummary {
  dateIso: string;
  dateLabel: string;
  generatedLabel: string;
  academicYear: string;
  overallRate: number;
  totalStudents: number;
  totalPresent: number;
  totalAbsent: number;
  byClass: DailyClassAttendanceRow[];
  unmarkedClasses: string[];
  noneMarked: boolean;
  previewText: string;
}

export function todayIsoInTimeZone(timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function isWeekdayInTimeZone(timeZone = "Asia/Kolkata"): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date());
  return weekday !== "Sat" && weekday !== "Sun";
}

function rate(present: number, total: number): number {
  return total > 0 ? Math.round((present / total) * 1000) / 10 : 0;
}

function formatLongDate(iso: string): string {
  return format(parseISO(iso), "EEEE, d MMMM yyyy");
}

export async function buildDailyAttendanceSummary(
  dateIso: string
): Promise<DailyAttendanceSummary> {
  const academicYear = process.env.ACADEMIC_YEAR ?? "2026-27";
  const expectedClasses = await getAttendanceClassSummaries();
  const allRows = await readAllAttendanceRows();
  const todayRows = allRows.filter((r) => r.date === dateIso);

  const byClassMap = new Map<string, { present: number; absent: number }>();
  for (const row of todayRows) {
    const cls = canonicalClassLabel(row.className ?? "");
    const bucket = byClassMap.get(cls) ?? { present: 0, absent: 0 };
    if (row.status === "present") bucket.present += 1;
    else bucket.absent += 1;
    byClassMap.set(cls, bucket);
  }

  const markedSet = new Set(byClassMap.keys());
  const unmarkedClasses = expectedClasses
    .map((c) => c.className)
    .filter((cls) => !markedSet.has(cls))
    .sort((a, b) => classSortIndex(a) - classSortIndex(b));

  const byClass: DailyClassAttendanceRow[] = [...byClassMap.entries()]
    .map(([className, stats]) => {
      const total = stats.present + stats.absent;
      return {
        className,
        total,
        present: stats.present,
        absent: stats.absent,
        rate: rate(stats.present, total),
      };
    })
    .sort((a, b) => classSortIndex(a.className) - classSortIndex(b.className));

  const totalPresent = byClass.reduce((s, c) => s + c.present, 0);
  const totalAbsent = byClass.reduce((s, c) => s + c.absent, 0);
  const totalStudents = totalPresent + totalAbsent;
  const overallRate = rate(totalPresent, totalStudents);
  const noneMarked = byClass.length === 0;
  const dateLabel = formatLongDate(dateIso);
  const generatedLabel = formatLongDate(todayIsoInTimeZone());

  const previewText = noneMarked
    ? `Attendance for ${dateLabel} — no classes marked today.`
    : `Attendance for ${dateLabel} — ${overallRate}% present (${totalPresent} of ${totalStudents}).`;

  return {
    dateIso,
    dateLabel,
    generatedLabel,
    academicYear,
    overallRate,
    totalStudents,
    totalPresent,
    totalAbsent,
    byClass,
    unmarkedClasses,
    noneMarked,
    previewText,
  };
}
