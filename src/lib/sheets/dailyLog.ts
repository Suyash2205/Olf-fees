import { normalizePaymentMode, paymentModeLabel, type PaymentMode } from "@/lib/payment-mode";
import { getSheetsClient, FEES_SHEET_ID } from "./client";

const SHEET_NAME = "Daily Log";

export interface DailyEntry {
  id: string;
  date: string;        // YYYY-MM-DD
  studentName: string;
  className: string;
  srNo: string;
  amount: number;
  /** Fee month column (1–12). Jun=6. From sheet sync or payment date. */
  feeMonth?: number;
  /** cash or online */
  paymentMode?: PaymentMode;
}

export type DailyEntryInput = Omit<DailyEntry, "id">;

const HEADERS = [
  "Date",
  "Student Name",
  "Class",
  "Sr No",
  "Amount",
  "Fee Month",
  "Payment Mode",
] as const;

async function ensureSheet(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${SHEET_NAME}!A1:G1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...HEADERS]] },
    });
    return;
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A1:G1`,
  });
  const headers = headerRes.data.values?.[0] ?? [];
  if (headers[6] !== "Payment Mode") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${SHEET_NAME}!G1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Payment Mode"]] },
    });
  }
}

function parsePaymentMode(raw: string | undefined): PaymentMode | undefined {
  if (!raw?.trim()) return undefined;
  return normalizePaymentMode(raw);
}

export async function appendDailyEntry(entry: DailyEntryInput): Promise<void> {
  await ensureSheet();
  const sheets = getSheetsClient();
  const mode = entry.paymentMode ? normalizePaymentMode(entry.paymentMode) : undefined;
  await sheets.spreadsheets.values.append({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:G`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          entry.date,
          entry.studentName,
          entry.className,
          entry.srNo,
          entry.amount,
          entry.feeMonth ?? "",
          mode ? paymentModeLabel(mode) : "",
        ],
      ],
    },
  });
}

export async function getAllDailyEntries(): Promise<DailyEntry[]> {
  await ensureSheet();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:G`,
  });
  const rows = (res.data.values ?? []).slice(1);
  return rows
    .map((row, i) => ({
      id: String(i + 2),
      date: row[0] ?? "",
      studentName: row[1] ?? "",
      className: row[2] ?? "",
      srNo: row[3] ?? "",
      amount: Number(row[4]) || 0,
      feeMonth: row[5] ? Number(row[5]) : undefined,
      paymentMode: parsePaymentMode(row[6]),
    }))
    .filter((e) => e.date && e.studentName);
}

export async function getDailyEntriesForStudent(srNo: string): Promise<DailyEntry[]> {
  const all = await getAllDailyEntries();
  return all.filter((e) => e.srNo === srNo);
}

export async function updateDailyEntry(
  rowId: string,
  update: { amount?: number; paymentMode?: PaymentMode }
): Promise<void> {
  await ensureSheet();
  const sheets = getSheetsClient();
  const data: { range: string; values: (string | number)[][] }[] = [];

  if (update.amount !== undefined) {
    data.push({
      range: `${SHEET_NAME}!E${rowId}`,
      values: [[update.amount]],
    });
  }
  if (update.paymentMode !== undefined) {
    data.push({
      range: `${SHEET_NAME}!G${rowId}`,
      values: [[paymentModeLabel(normalizePaymentMode(update.paymentMode))]],
    });
  }

  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data,
    },
  });
}

export async function deleteDailyEntry(rowId: string): Promise<void> {
  await ensureSheet();
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined) throw new Error("Daily Log sheet not found");

  const rowIndex = Number(rowId) - 1; // 0-based
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
          },
        },
      ],
    },
  });
}
