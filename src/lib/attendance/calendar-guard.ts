import { nonSchoolDayMessage } from "@/lib/attendance/school-calendar";
import { readCalendarEntries } from "@/lib/sheets/school-calendar";

/**
 * Server-side guard for attendance writes. Returns a message when `dateIso` is not a
 * school day for the class (holiday, Sunday, or calendar override), or null when open.
 * Throws if the calendar cannot be read: a failed read must never be treated as "open".
 */
export async function attendanceBlockedReason(
  dateIso: string,
  className: string
): Promise<string | null> {
  const entries = await readCalendarEntries();
  return nonSchoolDayMessage(dateIso, className, entries);
}
