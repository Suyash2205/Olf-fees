import { normalizePaymentMode, paymentModeLabel, type PaymentMode } from "@/lib/payment-mode";
import { getSheetsClient, FEES_SHEET_ID } from "./client";
import {
  amountsMatch,
  normalizeSheetDate,
  parseSheetAmount,
  verifySheetWrite,
} from "./verify-write";

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

let sheetReady = false;

async function ensureSheet(): Promise<void> {
  if (sheetReady) return;
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
      sheetReady = true;
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
  sheetReady = true;
}

function parsePaymentMode(raw: string | undefined): PaymentMode | undefined {
  if (!raw?.trim()) return undefined;
  return normalizePaymentMode(raw);
}

function entryToRowValues(entry: DailyEntryInput): (string | number)[] {
  const mode = entry.paymentMode ? normalizePaymentMode(entry.paymentMode) : undefined;
  return [
    entry.date,
    entry.studentName,
    entry.className,
    entry.srNo,
    entry.amount,
    entry.feeMonth ?? "",
    mode ? paymentModeLabel(mode) : "",
    entry.comment?.trim() ?? "",
  ];
}

async function nextDailyDataRow(): Promise<number> {
  const entries = await getAllDailyEntries();
  return entries.length + 2;
}

async function readDailyRow(row: number): Promise<string[] | undefined> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A${row}:H${row}`,
  });
  return res.data.values?.[0];
}

function dailyRowMatches(entry: DailyEntryInput, row: string[]): boolean {
  const mode = entry.paymentMode ? normalizePaymentMode(entry.paymentMode) : undefined;
  const rowMode = row[6]?.trim() ? normalizePaymentMode(row[6]) : undefined;
  const feeMonth = row[5] ? Number(row[5]) : undefined;
  return (
    normalizeSheetDate(row[0]) === entry.date &&
    row[1] === entry.studentName &&
    row[3] === entry.srNo &&
    amountsMatch(parseSheetAmount(row[4]), entry.amount) &&
    (entry.feeMonth === undefined || feeMonth === entry.feeMonth) &&
    (mode === undefined || rowMode === mode) &&
    (entry.comment === undefined || (row[7]?.trim() ?? "") === entry.comment.trim())
  );
}

export async function appendDailyEntry(entry: DailyEntryInput): Promise<void> {
  await ensureSheet();
  const nextRow = await nextDailyDataRow();
  const sheets = getSheetsClient();
  const values = entryToRowValues(entry);

  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A${nextRow}:H${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });

  await verifySheetWrite(async () => {
    const row = await readDailyRow(nextRow);
    return row != null && dailyRowMatches(entry, row);
  }, "School fee payment");
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

  await verifySheetWrite(async () => {
    const row = await readDailyRow(Number(rowId));
    if (!row?.[0]) return false;
    if (update.amount !== undefined && !amountsMatch(parseSheetAmount(row[4]), update.amount)) {
      return false;
    }
    if (update.paymentMode !== undefined) {
      const expected = normalizePaymentMode(update.paymentMode);
      const actual = row[6]?.trim() ? normalizePaymentMode(row[6]) : undefined;
      if (actual !== expected) return false;
    }
    if (update.comment !== undefined && (row[7]?.trim() ?? "") !== update.comment.trim()) {
      return false;
    }
    return true;
  }, "School fee payment update");
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

  const snapshot =
    expected != null
      ? await getAllDailyEntries().then((entries) =>
          entries.find(
            (e) =>
              e.srNo === expected.srNo &&
              e.date === expected.date &&
              amountsMatch(e.amount, expected.amount)
          )
        )
      : await readDailyRow(Number(rowId)).then((row) =>
          row?.[0]
            ? ({
                srNo: row[3] ?? "",
                date: normalizeSheetDate(row[0]),
                amount: parseSheetAmount(row[4]),
              } as const)
            : undefined
        );

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

  if (snapshot) {
    await verifySheetWrite(async () => {
      const entries = await getAllDailyEntries();
      return !entries.some(
        (e) =>
          e.srNo === snapshot.srNo &&
          e.date === snapshot.date &&
          amountsMatch(e.amount, snapshot.amount)
      );
    }, "School fee payment delete");
  }
}
