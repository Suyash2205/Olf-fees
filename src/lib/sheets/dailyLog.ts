import { normalizePaymentMode, paymentModeLabel, type PaymentMode } from "@/lib/payment-mode";
import { getSheetsClient, FEES_SHEET_ID } from "./client";

const LEGACY_SHEET_NAME = "Daily Log";
export const SHEET_NAME = "Daily Fees Log";

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
  /** Optional note (e.g. partial payment, receipt ref) */
  comment?: string;
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
  "Comment",
] as const;

async function ensureSheet(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const sheetList = meta.data.sheets ?? [];
  const hasCurrent = sheetList.some((s) => s.properties?.title === SHEET_NAME);
  if (!hasCurrent) {
    const legacy = sheetList.find((s) => s.properties?.title === LEGACY_SHEET_NAME);
    if (legacy?.properties?.sheetId != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: FEES_SHEET_ID,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: { sheetId: legacy.properties.sheetId, title: SHEET_NAME },
                fields: "title",
              },
            },
          ],
        },
      });
    } else {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: FEES_SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: FEES_SHEET_ID,
        range: `${SHEET_NAME}!A1:H1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[...HEADERS]] },
      });
      return;
    }
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A1:H1`,
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
  if (headers[7] !== "Comment") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${SHEET_NAME}!H1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Comment"]] },
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
    range: `${SHEET_NAME}!A:H`,
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
          entry.comment?.trim() ?? "",
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
    range: `${SHEET_NAME}!A:H`,
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
      comment: row[7]?.trim() || undefined,
    }))
    .filter((e) => e.date && e.studentName);
}

export async function getDailyEntriesForStudent(srNo: string): Promise<DailyEntry[]> {
  const all = await getAllDailyEntries();
  return all.filter((e) => e.srNo === srNo);
}

export async function updateDailyEntry(
  rowId: string,
  update: { amount?: number; paymentMode?: PaymentMode; comment?: string }
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
  if (update.comment !== undefined) {
    data.push({
      range: `${SHEET_NAME}!H${rowId}`,
      values: [[update.comment.trim()]],
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

export async function deleteDailyEntry(
  entryId: string,
  expected?: {
    srNo: string;
    date: string;
    amount: number;
    feeMonth?: number;
  }
): Promise<void> {
  await ensureSheet();

  let rowId = entryId;
  if (expected) {
    const entries = await getAllDailyEntries();
    const matchesExpected = (e: DailyEntry) =>
      e.srNo === expected.srNo &&
      e.date === expected.date &&
      Math.abs(e.amount - expected.amount) < 0.001 &&
      (expected.feeMonth === undefined || (e.feeMonth ?? 0) === expected.feeMonth);

    const atId = entries.find((e) => e.id === entryId);
    if (atId && matchesExpected(atId)) {
      rowId = entryId;
    } else {
      const candidates = entries.filter(matchesExpected);
      if (candidates.length === 1) {
        rowId = candidates[0].id;
      } else if (candidates.length === 0) {
        throw new Error("Payment entry not found on sheet");
      } else {
        throw new Error("Multiple matching payments — refresh the page and try again");
      }
    }
  }

  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined) throw new Error(`${SHEET_NAME} sheet not found`);

  const rowIndex = Number(rowId) - 1;
  if (!Number.isFinite(rowIndex) || rowIndex < 1) {
    throw new Error("Invalid payment row");
  }

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
