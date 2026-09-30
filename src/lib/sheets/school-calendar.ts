/**
 * `School Calendar` tab (portal-owned). Read/add/cancel via the shared keyed-tab helper.
 *
 * Removing an entry marks it `Cancelled` rather than deleting the row: no row ever shifts,
 * the tab keeps a history of what was decided, and there is no delete-by-index race.
 */
import {
  formatClassesCell,
  formatDateCell,
  parseCalendarRows,
  parseDateCell,
  validateCalendarInput,
  type CalendarEntry,
  type CalendarInput,
} from "@/lib/attendance/school-calendar";
import { InputError } from "@/lib/input-error";
import { appendKeyedRow, readKeyedTab, updateKeyedRow } from "./keyed-tab";

export const SCHOOL_CALENDAR_SHEET = "School Calendar";

export const SCHOOL_CALENDAR_HEADERS = [
  "Date",
  "Type",
  "Classes",
  "Title",
  "Added By",
  "Added At",
] as const;

export interface CalendarSheetRow {
  sheetRow: number;
  date: string;
  type: string;
  classes: string;
  title: string;
  addedBy: string;
  addedAt: string;
  status: "active" | "cancelled" | "invalid";
  /** Present for active rows. */
  entry?: CalendarEntry;
}

/** Every row on the tab, with a status the admin page can show. One cached read. */
export async function readCalendarRows(): Promise<CalendarSheetRow[]> {
  const raw = await readKeyedTab(SCHOOL_CALENDAR_SHEET, SCHOOL_CALENDAR_HEADERS, 20_000);
  return raw.map((r) => {
    const parsed = parseCalendarRows([{ Date: r.Date, Type: r.Type, Classes: r.Classes, Title: r.Title }]);
    const entry = parsed.entries[0];
    const skipped = parsed.skipped[0];
    return {
      sheetRow: r.sheetRow,
      date: r.Date,
      type: r.Type,
      classes: r.Classes,
      title: r.Title,
      addedBy: r["Added By"],
      addedAt: r["Added At"],
      status: entry ? "active" : skipped?.reason === "cancelled" ? "cancelled" : "invalid",
      entry,
    };
  });
}

export async function readCalendarEntries(): Promise<CalendarEntry[]> {
  return (await readCalendarRows()).flatMap((r) => (r.entry ? [r.entry] : []));
}

export async function addCalendarEntry(input: CalendarInput, actorEmail: string): Promise<CalendarEntry> {
  const v = validateCalendarInput(input);
  if (!v.ok) throw new InputError(v.error);
  const e = v.value;
  await appendKeyedRow(SCHOOL_CALENDAR_SHEET, SCHOOL_CALENDAR_HEADERS, {
    Date: formatDateCell(e.startDate, e.endDate),
    Type: e.type,
    Classes: formatClassesCell(e.classes),
    Title: e.title,
    "Added By": actorEmail,
    "Added At": new Date().toISOString(),
  });
  return e;
}

/** Mark an entry Cancelled. `expectDate` guards against the row having changed. */
export async function cancelCalendarEntry(sheetRow: number, expectDate: string): Promise<void> {
  const rows = await readCalendarRows();
  const row = rows.find((r) => r.sheetRow === sheetRow);
  if (!row || row.date !== expectDate) {
    throw new InputError("That calendar entry changed or no longer exists. Reload and try again.", 409);
  }
  if (row.status === "cancelled") return;
  const original = row.type;
  const title = `${row.title}${row.title ? " " : ""}[was ${original}]`.slice(0, 200);
  await updateKeyedRow(
    SCHOOL_CALENDAR_SHEET,
    SCHOOL_CALENDAR_HEADERS,
    sheetRow,
    { Type: "Cancelled", Title: title },
    { header: "Date", value: expectDate }
  );
}

export { parseDateCell };
