import { getSheetsClient, FEES_SHEET_ID } from "./client";

export const AUDIT_SHEET = "Audit Log";

export const AUDIT_HEADERS = [
  "Timestamp",
  "User Email",
  "Account Name",
  "Action",
  "Resource",
  "Resource ID",
  "Summary",
  "Details",
] as const;

export interface AuditLogRow {
  timestamp: string;
  userEmail: string;
  accountName: string;
  action: string;
  resource: string;
  resourceId: string;
  summary: string;
  details: string;
}

export interface AuditLogEntry extends AuditLogRow {
  rowId: number;
}

let auditSheetEnsured = false;

function colLetter(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
}

export async function ensureAuditLogSheet(): Promise<void> {
  if (auditSheetEnsured) return;
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === AUDIT_SHEET);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: AUDIT_SHEET } } }],
      },
    });
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${AUDIT_SHEET}!A1:1`,
  });
  if (headerRes.data.values?.[0]?.[0] !== AUDIT_HEADERS[0]) {
    const endCol = colLetter(AUDIT_HEADERS.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${AUDIT_SHEET}!A1:${endCol}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...AUDIT_HEADERS]] },
    });
  }
  auditSheetEnsured = true;
}

export async function appendAuditLog(row: AuditLogRow): Promise<void> {
  await ensureAuditLogSheet();
  const sheets = getSheetsClient();
  const endCol = colLetter(AUDIT_HEADERS.length - 1);
  const details =
    row.details.length > 45000 ? `${row.details.slice(0, 45000)}…` : row.details;

  await sheets.spreadsheets.values.append({
    spreadsheetId: FEES_SHEET_ID,
    range: `${AUDIT_SHEET}!A:${endCol}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          row.timestamp,
          row.userEmail,
          row.accountName,
          row.action,
          row.resource,
          row.resourceId,
          row.summary,
          details,
        ],
      ],
    },
  });
}

/** Newest first. */
export async function readAuditLogs(limit = 500): Promise<AuditLogEntry[]> {
  await ensureAuditLogSheet();
  const sheets = getSheetsClient();
  const endCol = colLetter(AUDIT_HEADERS.length - 1);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${AUDIT_SHEET}!A2:${endCol}`,
  });
  const rows = res.data.values ?? [];
  const entries: AuditLogEntry[] = rows
    .map((row, i) => ({
      rowId: i + 2,
      timestamp: row[0] ?? "",
      userEmail: row[1] ?? "",
      accountName: row[2] ?? "",
      action: row[3] ?? "",
      resource: row[4] ?? "",
      resourceId: row[5] ?? "",
      summary: row[6] ?? "",
      details: row[7] ?? "",
    }))
    .filter((e) => e.timestamp && e.action);

  return entries.reverse().slice(0, limit);
}
