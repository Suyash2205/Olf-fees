import {
  DEFAULT_OTHER_FEE_TYPES,
  normalizeFeeTypeName,
} from "@/lib/other-fee-types";
import { parseReceiptCell, receiptCellValue } from "@/lib/fees/receipt";
import { normalizePaymentMode, paymentModeLabel, type PaymentMode } from "@/lib/payment-mode";
import { getSheetsClient, FEES_SHEET_ID } from "./client";
import { InputError } from "@/lib/input-error";
import { columnLetter } from "./keyed-tab";
import {
  amountsMatch,
  normalizeSheetDate,
  parseSheetAmount,
  verifySheetWrite,
} from "./verify-write";

export const OTHER_FEES_SHEET = "Other Fees Log";
export const OTHER_FEE_TYPES_SHEET = "Other Fee Types";

const HEADERS = [
  "Date",
  "Student Name",
  "Class",
  "Sr No",
  "Fee Type",
  "Amount",
  "Payment Mode",
  "Notes",
] as const;

export interface OtherFeeEntry {
  id: string;
  date: string;
  studentName: string;
  className: string;
  srNo: string;
  feeType: string;
  amount: number;
  paymentMode: PaymentMode;
  notes: string;
  /** Optional receipt number (far-right "Receipt No" column). */
  receiptNo?: string;
}

export type OtherFeeEntryInput = Omit<OtherFeeEntry, "id">;

const RECEIPT_HEADER = "Receipt No";

let sheetsEnsured = false;
/**
 * 0-based column of "Receipt No". The school's own columns I–K (Online / Cash / Total formulas)
 * sit between Notes and the receipt, so it is found by header name and added after the last
 * existing header (L on the current sheet). Columns I–K are never written.
 */
let receiptCol = 8;

function receiptColLetter(): string {
  return columnLetter(receiptCol);
}

async function getSheetId(title: string): Promise<number> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  if (sheet?.properties?.sheetId == null) {
    throw new Error(`Sheet "${title}" not found`);
  }
  return sheet.properties.sheetId;
}

async function readFeeTypeNamesRaw(): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${OTHER_FEE_TYPES_SHEET}!A2:A500`,
  });
  return (res.data.values ?? [])
    .map((row) => normalizeFeeTypeName(row[0] ?? ""))
    .filter(Boolean);
}

async function seedDefaultFeeTypesIfEmpty(): Promise<void> {
  const existing = await readFeeTypeNamesRaw();
  if (existing.length > 0) return;

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${OTHER_FEE_TYPES_SHEET}!A2:A${DEFAULT_OTHER_FEE_TYPES.length + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: DEFAULT_OTHER_FEE_TYPES.map((t) => [t]),
    },
  });
}

async function refreshFeeTypeDropdown(): Promise<void> {
  const sheets = getSheetsClient();
  const logSheetId = await getSheetId(OTHER_FEES_SHEET);
  const count = Math.max((await readFeeTypeNamesRaw()).length + 1, 2);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      requests: [
        {
          setDataValidation: {
            range: {
              sheetId: logSheetId,
              startRowIndex: 1,
              endRowIndex: 5000,
              startColumnIndex: 4,
              endColumnIndex: 5,
            },
            rule: {
              condition: {
                type: "ONE_OF_RANGE",
                values: [
                  {
                    userEnteredValue: `='${OTHER_FEE_TYPES_SHEET}'!$A$2:$A$${count + 50}`,
                  },
                ],
              },
              showCustomUi: true,
              strict: false,
            },
          },
        },
      ],
    },
  });
}

async function ensureOtherFeesSheets(): Promise<void> {
  if (sheetsEnsured) return;
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const titles = new Set(meta.data.sheets?.map((s) => s.properties?.title) ?? []);
  const requests: { addSheet: { properties: { title: string } } }[] = [];

  if (!titles.has(OTHER_FEES_SHEET)) {
    requests.push({ addSheet: { properties: { title: OTHER_FEES_SHEET } } });
  }
  if (!titles.has(OTHER_FEE_TYPES_SHEET)) {
    requests.push({ addSheet: { properties: { title: OTHER_FEE_TYPES_SHEET } } });
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: { requests },
    });
  }

  const logHeader = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${OTHER_FEES_SHEET}!A1:1`,
  });
  let logHeaders = (logHeader.data.values?.[0] ?? []).map((h) => String(h ?? "").trim());
  if (logHeaders[0] !== HEADERS[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${OTHER_FEES_SHEET}!A1:H1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...HEADERS]] },
    });
    logHeaders = [...HEADERS];
  }
  // "Receipt No": located by name; if absent, ONE header cell is added after the last header.
  let receiptIdx = logHeaders.indexOf(RECEIPT_HEADER);
  if (receiptIdx < 0) {
    let last = logHeaders.length - 1;
    while (last >= 0 && !logHeaders[last]) last--;
    receiptIdx = last + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${OTHER_FEES_SHEET}!${columnLetter(receiptIdx)}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[RECEIPT_HEADER]] },
    });
  }
  receiptCol = receiptIdx;

  const typesHeader = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${OTHER_FEE_TYPES_SHEET}!A1:1`,
  });
  if (typesHeader.data.values?.[0]?.[0] !== "Fee Type") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${OTHER_FEE_TYPES_SHEET}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Fee Type"]] },
    });
  }

  await seedDefaultFeeTypesIfEmpty();
  await refreshFeeTypeDropdown();
  sheetsEnsured = true;
}

export async function getOtherFeeTypes(): Promise<string[]> {
  await ensureOtherFeesSheets();
  const names = await readFeeTypeNamesRaw();
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const n of names) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(n);
  }
  return unique.sort((a, b) => a.localeCompare(b));
}

export async function addOtherFeeType(name: string): Promise<string> {
  await ensureOtherFeesSheets();
  const normalized = normalizeFeeTypeName(name);
  const existing = await getOtherFeeTypes();
  const match = existing.find((t) => t.toLowerCase() === normalized.toLowerCase());
  if (match) return match;

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: FEES_SHEET_ID,
    range: `${OTHER_FEE_TYPES_SHEET}!A:A`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[normalized]] },
  });
  await refreshFeeTypeDropdown();
  return normalized;
}

function parsePaymentModeCell(raw: string | undefined): PaymentMode {
  if (!raw?.trim()) return "cash";
  return normalizePaymentMode(raw);
}

function entryToRowValues(entry: OtherFeeEntryInput): (string | number)[] {
  const mode = normalizePaymentMode(entry.paymentMode);
  return [
    entry.date,
    entry.studentName,
    entry.className,
    entry.srNo,
    normalizeFeeTypeName(entry.feeType),
    entry.amount,
    paymentModeLabel(mode),
    entry.notes.trim(),
  ];
}

async function readOtherFeeRow(row: number): Promise<string[] | undefined> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${OTHER_FEES_SHEET}!A${row}:${receiptColLetter()}${row}`,
  });
  return res.data.values?.[0];
}

function otherFeeRowMatches(entry: OtherFeeEntryInput, row: string[]): boolean {
  const mode = normalizePaymentMode(entry.paymentMode);
  const rowMode = row[6]?.trim() ? normalizePaymentMode(row[6]) : "cash";
  return (
    normalizeSheetDate(row[0]) === entry.date &&
    row[1] === entry.studentName &&
    row[3] === entry.srNo &&
    normalizeFeeTypeName(row[4] ?? "") === normalizeFeeTypeName(entry.feeType) &&
    amountsMatch(parseSheetAmount(row[5]), entry.amount) &&
    rowMode === mode &&
    (row[7]?.trim() ?? "") === entry.notes.trim() &&
    (entry.receiptNo ?? "") === (parseReceiptCell(row[receiptCol]) ?? "")
  );
}

/** Next data row (row 1 = header). Uses entry count, not sheet grid extent. */
async function nextOtherFeeDataRow(): Promise<number> {
  const entries = await getAllOtherFeeEntries();
  return entries.length + 2;
}

export async function getAllOtherFeeEntries(): Promise<OtherFeeEntry[]> {
  await ensureOtherFeesSheets();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${OTHER_FEES_SHEET}!A:${receiptColLetter()}`,
  });
  const rows = (res.data.values ?? []).slice(1);
  return rows
    .map((row, i) => ({
      id: String(i + 2),
      date: row[0] ?? "",
      studentName: row[1] ?? "",
      className: row[2] ?? "",
      srNo: row[3] ?? "",
      feeType: row[4] ?? "",
      amount: Number(row[5]) || 0,
      paymentMode: parsePaymentModeCell(row[6]),
      notes: row[7] ?? "",
      receiptNo: parseReceiptCell(row[receiptCol]),
    }))
    .filter((e) => e.date && e.studentName && e.feeType && e.amount > 0);
}

/** Rewrite all entries contiguously from row 2 (fixes phantom row gaps from Sheets append). */
export async function compactOtherFeesLog(): Promise<number> {
  await ensureOtherFeesSheets();
  const entries = await getAllOtherFeeEntries();
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const gridRows =
    meta.data.sheets?.find((s) => s.properties?.title === OTHER_FEES_SHEET)?.properties
      ?.gridProperties?.rowCount ?? entries.length + 2;

  if (gridRows > 1) {
    // Clear only the portal-owned columns (A:H and Receipt No). I–K hold the school's formulas.
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: {
        ranges: [
          `${OTHER_FEES_SHEET}!A2:H${gridRows}`,
          `${OTHER_FEES_SHEET}!${receiptColLetter()}2:${receiptColLetter()}${gridRows}`,
        ],
      },
    });
  }

  if (entries.length === 0) return 0;

  // The receipt travels with its row: rewritten together with A:H in the same call.
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${OTHER_FEES_SHEET}!A2:H${entries.length + 1}`,
          values: entries.map((e) =>
            entryToRowValues({
              date: e.date,
              studentName: e.studentName,
              className: e.className,
              srNo: e.srNo,
              feeType: e.feeType,
              amount: e.amount,
              paymentMode: e.paymentMode,
              notes: e.notes,
            })
          ),
        },
        {
          range: `${OTHER_FEES_SHEET}!${receiptColLetter()}2:${receiptColLetter()}${entries.length + 1}`,
          values: entries.map((e) => [receiptCellValue(e.receiptNo)]),
        },
      ],
    },
  });

  return entries.length;
}

export async function getOtherFeeEntriesForStudent(srNo: string): Promise<OtherFeeEntry[]> {
  const all = await getAllOtherFeeEntries();
  return all.filter((e) => e.srNo === srNo);
}

/** Append one row; returns its sheet row number (as the entry id) so callers can undo it. */
export async function appendOtherFeeEntry(entry: OtherFeeEntryInput): Promise<string> {
  await ensureOtherFeesSheets();
  await addOtherFeeType(entry.feeType);

  const nextRow = await nextOtherFeeDataRow();
  const sheets = getSheetsClient();
  // A:H and the Receipt No cell only; I–K (school formulas) are not touched.
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: `${OTHER_FEES_SHEET}!A${nextRow}:H${nextRow}`, values: [entryToRowValues(entry)] },
        {
          range: `${OTHER_FEES_SHEET}!${receiptColLetter()}${nextRow}`,
          values: [[receiptCellValue(entry.receiptNo)]],
        },
      ],
    },
  });

  await verifySheetWrite(async () => {
    const row = await readOtherFeeRow(nextRow);
    return row != null && otherFeeRowMatches(entry, row);
  }, "Other fee entry");
  return String(nextRow);
}

export async function updateOtherFeeEntry(
  rowId: string,
  update: Partial<Pick<OtherFeeEntryInput, "amount" | "paymentMode" | "feeType" | "notes" | "receiptNo">>,
  expectedSrNo?: string
): Promise<void> {
  // Rows shift when another entry is deleted; refuse to edit a row that now belongs to
  // a different student (only checked when the caller sends the Sr No it loaded).
  if (expectedSrNo) {
    const current = await readOtherFeeRow(Number(rowId));
    if (String(current?.[3] ?? "").trim() !== expectedSrNo.trim()) {
      throw new InputError(
        "This entry has moved in the sheet (another entry was changed). Refresh the page and try again.",
        409
      );
    }
  }
  await ensureOtherFeesSheets();
  const sheets = getSheetsClient();
  const data: { range: string; values: (string | number)[][] }[] = [];

  if (update.feeType !== undefined) {
    await addOtherFeeType(update.feeType);
    data.push({
      range: `${OTHER_FEES_SHEET}!E${rowId}`,
      values: [[normalizeFeeTypeName(update.feeType)]],
    });
  }
  if (update.amount !== undefined) {
    data.push({ range: `${OTHER_FEES_SHEET}!F${rowId}`, values: [[update.amount]] });
  }
  if (update.paymentMode !== undefined) {
    data.push({
      range: `${OTHER_FEES_SHEET}!G${rowId}`,
      values: [[paymentModeLabel(normalizePaymentMode(update.paymentMode))]],
    });
  }
  if (update.notes !== undefined) {
    data.push({ range: `${OTHER_FEES_SHEET}!H${rowId}`, values: [[update.notes.trim()]] });
  }
  if (update.receiptNo !== undefined) {
    data.push({
      range: `${OTHER_FEES_SHEET}!${receiptColLetter()}${rowId}`,
      values: [[receiptCellValue(update.receiptNo.trim() || undefined)]],
    });
  }

  if (data.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });

  await verifySheetWrite(async () => {
    const row = await readOtherFeeRow(Number(rowId));
    if (!row?.[0]) return false;
    if (update.feeType !== undefined) {
      if (normalizeFeeTypeName(row[4] ?? "") !== normalizeFeeTypeName(update.feeType)) {
        return false;
      }
    }
    if (update.amount !== undefined && !amountsMatch(parseSheetAmount(row[5]), update.amount)) {
      return false;
    }
    if (update.paymentMode !== undefined) {
      const expected = normalizePaymentMode(update.paymentMode);
      const actual = row[6]?.trim() ? normalizePaymentMode(row[6]) : "cash";
      if (actual !== expected) return false;
    }
    if (update.notes !== undefined && (row[7]?.trim() ?? "") !== update.notes.trim()) {
      return false;
    }
    if (
      update.receiptNo !== undefined &&
      (parseReceiptCell(row[receiptCol]) ?? "") !== update.receiptNo.trim()
    ) {
      return false;
    }
    return true;
  }, "Other fee entry update");
}

export async function deleteOtherFeeEntry(
  entryId: string,
  expected?: { srNo: string; date: string; amount: number; feeType: string }
): Promise<void> {
  await ensureOtherFeesSheets();

  let rowId = entryId;
  if (expected) {
    const entries = await getAllOtherFeeEntries();
    const matchesExpected = (e: OtherFeeEntry) =>
      e.srNo === expected.srNo &&
      e.date === expected.date &&
      e.feeType === expected.feeType &&
      Math.abs(e.amount - expected.amount) < 0.001;

    const atId = entries.find((e) => e.id === entryId);
    if (atId && matchesExpected(atId)) {
      rowId = entryId;
    } else {
      const candidates = entries.filter(matchesExpected);
      if (candidates.length === 1) {
        rowId = candidates[0].id;
      } else if (candidates.length === 0) {
        throw new Error("Entry not found on sheet");
      } else {
        throw new Error("Multiple matching entries — refresh and try again");
      }
    }
  }

  const sheetId = await getSheetId(OTHER_FEES_SHEET);
  const rowIndex = Number(rowId) - 1;
  if (!Number.isFinite(rowIndex) || rowIndex < 1) {
    throw new Error("Invalid row");
  }

  const rowBefore = expected ? null : await readOtherFeeRow(Number(rowId));
  const snapshot = expected ?? {
    srNo: rowBefore?.[3] ?? "",
    date: normalizeSheetDate(rowBefore?.[0]),
    amount: parseSheetAmount(rowBefore?.[5]),
    feeType: rowBefore?.[4] ?? "",
  };

  const matches = (e: OtherFeeEntry) =>
    e.srNo === snapshot.srNo &&
    e.date === snapshot.date &&
    e.feeType === snapshot.feeType &&
    amountsMatch(e.amount, snapshot.amount);
  const canVerify = Boolean(snapshot.srNo && snapshot.date && snapshot.feeType);
  // Count identical rows: split payments can leave two same-amount rows (see deleteDailyEntry).
  const countBefore = canVerify ? (await getAllOtherFeeEntries()).filter(matches).length : 0;

  const sheets = getSheetsClient();
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

  if (canVerify) {
    await verifySheetWrite(
      async () => (await getAllOtherFeeEntries()).filter(matches).length < countBefore,
      "Other fee entry delete"
    );
  }
}
