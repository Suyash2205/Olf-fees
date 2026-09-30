import { nonSchoolDayMessage, type CalendarEntry } from "@/lib/attendance/school-calendar";
import { readCalendarEntries } from "@/lib/sheets/school-calendar";

/**
 * Calendar entries for guards and filters. If the School Calendar tab cannot be read
 * (e.g. a brief Sheets quota 429), fall back to the default rule (Mon–Sat open, Sunday
 * closed) and log it loudly: a Google hiccup must never stop teachers saving attendance
 * on an ordinary school day. `calendarUnavailable` lets callers surface a warning.
 */
export async function calendarEntriesOrDefault(): Promise<{
  entries: CalendarEntry[];
  calendarUnavailable: boolean;
}> {
  try {
    return { entries: await readCalendarEntries(), calendarUnavailable: false };
  } catch (err) {
    console.error("School Calendar unreadable — using default Mon–Sat rule:", err);
    return { entries: [], calendarUnavailable: true };
  }
}

/**
 * Server-side guard for attendance writes. Returns a message when `dateIso` is not a
 * school day for the class (holiday, Sunday, or calendar override), or null when open.
 */
export async function attendanceBlockedReason(
  dateIso: string,
  className: string
): Promise<string | null> {
  const { entries } = await calendarEntriesOrDefault();
  return nonSchoolDayMessage(dateIso, className, entries);
}
