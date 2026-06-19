import {
  CLASS_OPTIONS,
  canonicalClassLabel,
  resolveClass,
} from "@/lib/fees/structure";
import { getAllFees } from "@/lib/sheets/fees";
import { sortByGradeThenName } from "@/lib/sort-by-grade";
import type { AttendanceStudent } from "@/lib/attendance/types";

export async function getAttendanceStudentsForClass(
  className: string
): Promise<AttendanceStudent[]> {
  const label = canonicalClassLabel(className);
  const fees = await getAllFees();
  const students = fees
    .filter((f) => canonicalClassLabel(f.className) === label)
    .map((f) => ({
      srNo: f.srNo,
      studentName: f.studentName,
      className: label,
    }));

  return sortByGradeThenName(
    students,
    (s) => s.className,
    (s) => s.studentName
  );
}

export function listAttendanceClasses(): string[] {
  return [...CLASS_OPTIONS];
}

export function isKnownAttendanceClass(className: string): boolean {
  return resolveClass(className) != null;
}

export async function getAttendanceClassSummaries(): Promise<
  { className: string; studentCount: number }[]
> {
  const fees = await getAllFees();
  const counts = new Map<string, number>();
  for (const f of fees) {
    const label = canonicalClassLabel(f.className);
    if (!resolveClass(label)) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return listAttendanceClasses()
    .map((className) => ({
      className,
      studentCount: counts.get(className) ?? 0,
    }))
    .filter((c) => c.studentCount > 0);
}
