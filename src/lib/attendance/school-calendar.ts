/**
 * School calendar — pure logic (no I/O).
 *
 * Default rule: Monday–Friday are school days; Saturday and Sunday are not.
 * `School Calendar` tab entries override the default for their classes:
 *   - `Holiday`      → not a school day
 *   - `Working day`  → a school day (e.g. a working Saturday)
 * Precedence for one date and class:
 *   1. a class-specific entry beats an `All` entry;
 *   2. between entries of the same specificity, the one lower in the sheet
 *      (added later) wins;
 *   3. otherwise the weekday default.
 * `Cancelled` entries never reach this module (the sheet layer drops them).
 */
import { canonicalClassLabel, resolveClass } from "@/lib/fees/structure";

export type CalendarEntryType = "Holiday" | "Working day";

export interface CalendarEntry {
  /** First day, YYYY-MM-DD. */
  startDate: string;
  /** Last day (inclusive), YYYY-MM-DD; equals startDate for a single day. */
  endDate: string;
  type: CalendarEntryType;
  /** "All", or canonical class labels. */
  classes: "All" | string[];
  title: string;
}

export interface DayStatus {
  isSchoolDay: boolean;
  /** Why it is not (or why it is, for an override). "weekend" for the default rule. */
  source: "default" | "entry";
  title: string;
  type: CalendarEntryType | null;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 0 = Sunday … 6 = Saturday. Timezone-free: the date string is the calendar date. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every date from start to end inclusive. Empty when end < start. */
export function expandDateRange(startIso: string, endIso: string): string[] {
  if (!isValidIsoDate(startIso) || !isValidIsoDate(endIso) || endIso < startIso) return [];
  const out: string[] = [];
  for (let d = startIso; d <= endIso; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

export function isDefaultSchoolDay(iso: string): boolean {
  const w = weekdayOf(iso);
  return w !== 0 && w !== 6;
}

function entryAppliesToClass(entry: CalendarEntry, classLabel: string): boolean {
  if (entry.classes === "All") return true;
  return entry.classes.includes(classLabel);
}

/** Full status for one class on one date, with the reason. */
export function dayStatus(dateIso: string, className: string, entries: CalendarEntry[]): DayStatus {
  const label = canonicalClassLabel(className);
  let winner: CalendarEntry | null = null;
  let winnerSpecific = false;
  for (const e of entries) {
    if (dateIso < e.startDate || dateIso > e.endDate) continue;
    if (!entryAppliesToClass(e, label)) continue;
    const specific = e.classes !== "All";
    // class-specific beats All; within the same specificity the later entry wins
    if (winner && winnerSpecific && !specific) continue;
    winner = e;
    winnerSpecific = specific;
  }
  if (winner) {
    return {
      isSchoolDay: winner.type === "Working day",
      source: "entry",
      title: winner.title,
      type: winner.type,
    };
  }
  const school = isDefaultSchoolDay(dateIso);
  return { isSchoolDay: school, source: "default", title: school ? "" : "Weekend", type: null };
}

export function isSchoolDay(dateIso: string, className: string, entries: CalendarEntry[]): boolean {
  return dayStatus(dateIso, className, entries).isSchoolDay;
}

/** True when at least one of the classes has school that day. */
export function isSchoolDayForAnyClass(
  dateIso: string,
  classNames: string[],
  entries: CalendarEntry[]
): boolean {
  if (classNames.length === 0) {
    // No roster to check: only the All-class view of the calendar applies.
    return isSchoolDay(dateIso, "", entries);
  }
  return classNames.some((c) => isSchoolDay(dateIso, c, entries));
}

/** School days for a class in [startIso, endIso], ascending. */
export function schoolDaysBetween(
  className: string,
  startIso: string,
  endIso: string,
  entries: CalendarEntry[]
): string[] {
  return expandDateRange(startIso, endIso).filter((d) => isSchoolDay(d, className, entries));
}

/**
 * The last `n` school days of a class up to and including `endIso`, newest first.
 * Looks back at most `maxLookbackDays` calendar days so a mis-configured calendar
 * (e.g. an endless holiday) cannot loop forever.
 */
export function lastNSchoolDays(
  className: string,
  endIso: string,
  n: number,
  entries: CalendarEntry[],
  maxLookbackDays = 400
): string[] {
  const out: string[] = [];
  if (!isValidIsoDate(endIso) || n <= 0) return out;
  let d = endIso;
  for (let i = 0; i < maxLookbackDays && out.length < n; i++) {
    if (isSchoolDay(d, className, entries)) out.push(d);
    d = addDaysIso(d, -1);
  }
  return out;
}

/** Message shown to teachers when marking is blocked, or null when the day is open. */
export function nonSchoolDayMessage(
  dateIso: string,
  className: string,
  entries: CalendarEntry[]
): string | null {
  const st = dayStatus(dateIso, className, entries);
  if (st.isSchoolDay) return null;
  const label = canonicalClassLabel(className);
  const why = st.title || (st.source === "default" ? "Weekend" : "Holiday");
  return `${dateIso} is a holiday for ${label}: ${why}`;
}

/** Parse the sheet's Classes cell: "All" / blank → All, else comma list of canonical labels. */
export function parseClassesCell(raw: string): "All" | string[] {
  const t = raw.trim();
  if (!t || t.toLowerCase() === "all") return "All";
  const list = t
    .split(",")
    .map((s) => canonicalClassLabel(s.trim()))
    .filter((s) => s && s !== "Unknown");
  return list.length ? [...new Set(list)] : "All";
}

export function formatClassesCell(classes: "All" | string[]): string {
  return classes === "All" ? "All" : classes.join(", ");
}

/** "2026-10-20" or "2026-10-20 to 2026-10-25" (dates may also be DD/MM/YYYY). */
export function parseDateCell(raw: string): { startDate: string; endDate: string } | null {
  const norm = (s: string): string => {
    const t = s.trim();
    const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : t;
  };
  const parts = raw.split(/\s+to\s+|\s*\.\.\s*/i).map(norm);
  const [a, b] = [parts[0], parts[1] ?? parts[0]];
  if (parts.length > 2 || !isValidIsoDate(a) || !isValidIsoDate(b) || b < a) return null;
  return { startDate: a, endDate: b };
}

export function formatDateCell(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} to ${endDate}`;
}

export interface RawCalendarRow {
  Date: string;
  Type: string;
  Classes: string;
  Title: string;
}

export interface ParseCalendarResult {
  entries: CalendarEntry[];
  /** Rows that were ignored (Cancelled) or malformed, so callers can surface them. */
  skipped: { row: RawCalendarRow; reason: string }[];
}

/** Sheet rows → entries. `Cancelled` rows are dropped; malformed rows are reported, never guessed at. */
export function parseCalendarRows(rows: RawCalendarRow[]): ParseCalendarResult {
  const entries: CalendarEntry[] = [];
  const skipped: ParseCalendarResult["skipped"] = [];
  for (const row of rows) {
    const type = row.Type.trim().toLowerCase();
    if (type === "cancelled") {
      skipped.push({ row, reason: "cancelled" });
      continue;
    }
    const dates = parseDateCell(row.Date);
    const t: CalendarEntryType | null =
      type === "holiday" ? "Holiday" : type === "working day" ? "Working day" : null;
    if (!dates || !t) {
      skipped.push({ row, reason: !dates ? "invalid date" : "invalid type" });
      continue;
    }
    entries.push({
      ...dates,
      type: t,
      classes: parseClassesCell(row.Classes),
      title: row.Title.trim(),
    });
  }
  return { entries, skipped };
}

export const MAX_CALENDAR_RANGE_DAYS = 120;
export const MAX_CALENDAR_TITLE_LENGTH = 120;

export interface CalendarInput {
  startDate: string;
  endDate?: string;
  type: string;
  /** "All" or a list of class labels (any spelling `resolveClass` accepts). */
  classes: "All" | string[];
  title: string;
}

/** Validate an admin's "add entry" request. Returns a clean entry or a message for the UI. */
export function validateCalendarInput(
  input: CalendarInput
): { ok: true; value: CalendarEntry } | { ok: false; error: string } {
  const startDate = String(input.startDate ?? "").trim();
  const endDate = String(input.endDate ?? "").trim() || startDate;
  if (!isValidIsoDate(startDate)) return { ok: false, error: "Start date must be a valid date (YYYY-MM-DD)." };
  if (!isValidIsoDate(endDate)) return { ok: false, error: "End date must be a valid date (YYYY-MM-DD)." };
  if (endDate < startDate) return { ok: false, error: "End date cannot be before the start date." };
  if (expandDateRange(startDate, endDate).length > MAX_CALENDAR_RANGE_DAYS) {
    return { ok: false, error: `A range can cover at most ${MAX_CALENDAR_RANGE_DAYS} days.` };
  }
  const type: CalendarEntryType | null =
    input.type === "Holiday" ? "Holiday" : input.type === "Working day" ? "Working day" : null;
  if (!type) return { ok: false, error: 'Type must be "Holiday" or "Working day".' };
  const title = String(input.title ?? "").trim();
  if (!title) return { ok: false, error: "A title is required (for example \"Diwali\")." };
  if (title.length > MAX_CALENDAR_TITLE_LENGTH) {
    return { ok: false, error: `Title must be ${MAX_CALENDAR_TITLE_LENGTH} characters or fewer.` };
  }

  let classes: "All" | string[];
  if (input.classes === "All") {
    classes = "All";
  } else {
    if (!Array.isArray(input.classes) || input.classes.length === 0) {
      return { ok: false, error: 'Choose "All classes" or at least one class.' };
    }
    const resolved: string[] = [];
    for (const c of input.classes) {
      const r = resolveClass(String(c));
      if (!r) return { ok: false, error: `Unknown class "${c}".` };
      resolved.push(r);
    }
    classes = [...new Set(resolved)];
  }
  return { ok: true, value: { startDate, endDate, type, classes, title } };
}

/**
 * Drop rows dated on a non-school day for their class. The sheet is left untouched; this
 * only keeps such days out of percentages and counts.
 */
export function filterToSchoolDays<T extends { date: string; className?: string }>(
  rows: T[],
  entries: CalendarEntry[]
): T[] {
  return rows.filter((r) => isSchoolDay(r.date, r.className ?? "", entries));
}
