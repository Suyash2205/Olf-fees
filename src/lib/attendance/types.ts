export type AttendanceStatus = "present" | "absent";

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
};

export interface AttendanceStudent {
  srNo: string;
  studentName: string;
  className: string;
}

export interface AttendanceEntry {
  studentName: string;
  srNo: string;
  status: AttendanceStatus;
}

export interface AttendanceRow {
  rowId: string;
  date: string;
  studentName: string;
  srNo: string;
  status: AttendanceStatus;
  teacherEmail: string;
  teacherName: string;
  submittedAt: string;
  className?: string;
}

export interface AttendanceDaySummary {
  date: string;
  className: string;
  present: number;
  absent: number;
  total: number;
  submittedAt: string;
  teacherName: string;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseAttendanceStatus(raw: string): AttendanceStatus | null {
  const s = raw.trim().toLowerCase();
  if (s === "present" || s === "p") return "present";
  if (s === "absent" || s === "a") return "absent";
  return null;
}

export function attendanceStatusLabel(status: AttendanceStatus): string {
  return ATTENDANCE_STATUS_LABEL[status];
}
