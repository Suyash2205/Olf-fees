import {
  DEFAULT_OTHER_FEE_TYPES,
  normalizeFeeTypeName,
} from "@/lib/other-fee-types";
import { normalizePaymentMode, paymentModeLabel, type PaymentMode } from "@/lib/payment-mode";
import { getSheetsClient, FEES_SHEET_ID } from "./client";

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
}

export type OtherFeeEntryInput = Omit<OtherFeeEntry, "id">;

let sheetsEnsured = false;

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
  if (logHeader.data.values?.[0]?.[0] !== HEADERS[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${OTHER_FEES_SHEET}!A1:H1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...HEADERS]] },
    });
  }

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

export async function getAllOtherFeeEntries(): Promise<OtherFeeEntry[]> {
  await ensureOtherFeesSheets();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${OTHER_FEES_SHEET}!A:H`,
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
    }))
    .filter((e) => e.date && e.studentName && e.feeType && e.amount > 0);
}

export async function getOtherFeeEntriesForStudent(srNo: string): Promise<OtherFeeEntry[]> {
  const all = await getAllOtherFeeEntries();
  return all.filter((e) => e.srNo === srNo);
}

export async function appendOtherFeeEntry(entry: OtherFeeEntryInput): Promise<void> {
  await ensureOtherFeesSheets();
  await addOtherFeeType(entry.feeType);

  const sheets = getSheetsClient();
  const mode = normalizePaymentMode(entry.paymentMode);
  await sheets.spreadsheets.values.append({
    spreadsheetId: FEES_SHEET_ID,
    range: `${OTHER_FEES_SHEET}!A:H`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          entry.date,
          entry.studentName,
          entry.className,
          entry.srNo,
          normalizeFeeTypeName(entry.feeType),
          entry.amount,
          paymentModeLabel(mode),
          entry.notes.trim(),
        ],
      ],
    },
  });
}

export async function updateOtherFeeEntry(
  rowId: string,
  update: Partial<Pick<OtherFeeEntryInput, "amount" | "paymentMode" | "feeType" | "notes">>
): Promise<void> {
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

  if (data.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
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
}
