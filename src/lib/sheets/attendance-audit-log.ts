import { canonicalClassLabel } from "@/lib/fees/structure";
import { normalizeSheetDate } from "./verify-write";
import { getSheetsClient, FEES_SHEET_ID } from "./client";
import { withSheetRetry } from "./retry";

export const ATTENDANCE_AUDIT_SHEET = "Attendance Audit Log";

export const ATTENDANCE_AUDIT_HEADERS = [
  "Timestamp",
  "User Email",
  "Account Name",
  "Action",
  "Class",
  "Date",
  "Summary",
  "Details",
] as const;

export interface AttendanceAuditRow {
  timestamp: string;
  userEmail: string;
  accountName: string;
  action: string;
  className: string;
  date: string;
  summary: string;
  details: string;
}

let sheetEnsured = false;

function colLetter(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
}

export async function ensureAttendanceAuditSheet(): Promise<void> {
  if (sheetEnsured) return;
  const sheets = getSheetsClient();
  const meta = await withSheetRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID })
  );
  const exists = meta.data.sheets?.some((s) => s.properties?.title === ATTENDANCE_AUDIT_SHEET);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ATTENDANCE_AUDIT_SHEET } } }],
      },
    });
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${ATTENDANCE_AUDIT_SHEET}!A1:1`,
  });
  if (headerRes.data.values?.[0]?.[0] !== ATTENDANCE_AUDIT_HEADERS[0]) {
    const endCol = colLetter(ATTENDANCE_AUDIT_HEADERS.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${ATTENDANCE_AUDIT_SHEET}!A1:${endCol}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...ATTENDANCE_AUDIT_HEADERS]] },
    });
  }
  sheetEnsured = true;
}

export async function appendAttendanceAuditLog(row: AttendanceAuditRow): Promise<void> {
  await ensureAttendanceAuditSheet();
  const sheets = getSheetsClient();
  const endCol = colLetter(ATTENDANCE_AUDIT_HEADERS.length - 1);
  const details =
    row.details.length > 45000 ? `${row.details.slice(0, 45000)}…` : row.details;

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${ATTENDANCE_AUDIT_SHEET}!A:A`,
  });
  const nextRow = (existing.data.values?.length ?? 1) + 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${ATTENDANCE_AUDIT_SHEET}!A${nextRow}:${endCol}${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          row.timestamp,
          row.userEmail,
          row.accountName,
          row.action,
          row.className,
          row.date,
          row.summary,
          details,
        ],
      ],
    },
  });
}

export async function getLatestAttendanceAuditByClass(
  className: string
): Promise<Map<string, { teacherName: string; submittedAt: string }>> {
  await ensureAttendanceAuditSheet();
  const sheets = getSheetsClient();
  const res = await withSheetRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: FEES_SHEET_ID,
      range: `${ATTENDANCE_AUDIT_SHEET}!A:H`,
    })
  );
  const rows = (res.data.values ?? []).slice(1);
  const label = canonicalClassLabel(className);
  const byDate = new Map<string, { teacherName: string; submittedAt: string }>();

  for (const row of rows) {
    const rowClass = canonicalClassLabel(row[4] ?? "");
    if (rowClass !== label) continue;
    const date = normalizeSheetDate(row[5] ?? "");
    if (!date) continue;
    const submittedAt = row[0] ?? "";
    const teacherName = row[2] ?? row[1] ?? "";
    const existing = byDate.get(date);
    if (!existing || submittedAt > existing.submittedAt) {
      byDate.set(date, { teacherName, submittedAt });
    }
  }

  return byDate;
}
