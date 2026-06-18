import {
  DEFAULT_EXPENSE_CATEGORIES,
  normalizeCategoryName,
} from "@/lib/expense-categories";
import { normalizePaymentMode, paymentModeLabel, type PaymentMode } from "@/lib/payment-mode";
import { getSheetsClient, FEES_SHEET_ID } from "./client";
import {
  amountsMatch,
  normalizeSheetDate,
  parseSheetAmount,
  verifySheetWrite,
} from "./verify-write";

export const EXPENSE_SHEET = "Daily expense";
export const CATEGORY_SHEET = "Expense Categories";

const EXPENSE_HEADERS = ["Date", "Category", "Amount", "Payment Mode", "Comment"] as const;

export interface ExpenseEntry {
  id: string;
  date: string;
  category: string;
  amount: number;
  paymentMode: PaymentMode;
  comment: string;
}

export type ExpenseEntryInput = Omit<ExpenseEntry, "id">;

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

async function ensureExpenseSheets(): Promise<void> {
  if (sheetsEnsured) return;
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const titles = new Set(meta.data.sheets?.map((s) => s.properties?.title) ?? []);
  const requests: { addSheet: { properties: { title: string } } }[] = [];

  if (!titles.has(EXPENSE_SHEET)) {
    requests.push({ addSheet: { properties: { title: EXPENSE_SHEET } } });
  }
  if (!titles.has(CATEGORY_SHEET)) {
    requests.push({ addSheet: { properties: { title: CATEGORY_SHEET } } });
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: { requests },
    });
  }

  const expenseHeader = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${EXPENSE_SHEET}!A1:1`,
  });
  if (expenseHeader.data.values?.[0]?.[0] !== EXPENSE_HEADERS[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${EXPENSE_SHEET}!A1:E1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...EXPENSE_HEADERS]] },
    });
  }

  const catHeader = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${CATEGORY_SHEET}!A1:1`,
  });
  if (catHeader.data.values?.[0]?.[0] !== "Category") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${CATEGORY_SHEET}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Category"]] },
    });
  }

  await seedDefaultCategoriesIfEmpty();
  await repairCategorySpelling();
  await refreshCategoryDropdown();
  sheetsEnsured = true;
}

/** Fix known typos in Expense Categories tab (e.g. Maitenance → Maintenance). */
async function repairCategorySpelling(): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${CATEGORY_SHEET}!A2:A500`,
  });
  const data: { range: string; values: string[][] }[] = [];
  for (const [i, row] of (res.data.values ?? []).entries()) {
    const raw = String(row[0] ?? "");
    const fixed = normalizeCategoryName(raw);
    if (raw && fixed !== raw) {
      data.push({ range: `${CATEGORY_SHEET}!A${i + 2}`, values: [[fixed]] });
    }
  }
  if (data.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });

  const logRes = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${EXPENSE_SHEET}!B2:B5000`,
  });
  const logFixes: { range: string; values: string[][] }[] = [];
  for (const [i, row] of (logRes.data.values ?? []).entries()) {
    const raw = String(row[0] ?? "");
    const fixed = normalizeCategoryName(raw);
    if (raw && fixed !== raw) {
      logFixes.push({ range: `${EXPENSE_SHEET}!B${i + 2}`, values: [[fixed]] });
    }
  }
  if (logFixes.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: { valueInputOption: "USER_ENTERED", data: logFixes },
    });
  }
}

async function seedDefaultCategoriesIfEmpty(): Promise<void> {
  const existing = await readCategoryNamesRaw();
  if (existing.length > 0) return;

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${CATEGORY_SHEET}!A2:A${DEFAULT_EXPENSE_CATEGORIES.length + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: DEFAULT_EXPENSE_CATEGORIES.map((c) => [c]),
    },
  });
}

async function readCategoryNamesRaw(): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${CATEGORY_SHEET}!A2:A500`,
  });
  return (res.data.values ?? [])
    .map((row) => normalizeCategoryName(row[0] ?? ""))
    .filter(Boolean);
}

/** Apply dropdown on Daily expense → Category column from Expense Categories tab. */
export async function refreshCategoryDropdown(): Promise<void> {
  const sheets = getSheetsClient();
  const expenseSheetId = await getSheetId(EXPENSE_SHEET);
  const count = Math.max((await readCategoryNamesRaw()).length + 1, 2);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      requests: [
        {
          setDataValidation: {
            range: {
              sheetId: expenseSheetId,
              startRowIndex: 1,
              endRowIndex: 5000,
              startColumnIndex: 1,
              endColumnIndex: 2,
            },
            rule: {
              condition: {
                type: "ONE_OF_RANGE",
                values: [
                  {
                    userEnteredValue: `='${CATEGORY_SHEET}'!$A$2:$A$${count + 50}`,
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

export async function getExpenseCategories(): Promise<string[]> {
  await ensureExpenseSheets();
  const names = await readCategoryNamesRaw();
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

export async function addExpenseCategory(name: string): Promise<string> {
  await ensureExpenseSheets();
  const normalized = normalizeCategoryName(name);
  const existing = await getExpenseCategories();
  const match = existing.find((c) => c.toLowerCase() === normalized.toLowerCase());
  if (match) return match;

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: FEES_SHEET_ID,
    range: `${CATEGORY_SHEET}!A:A`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[normalized]] },
  });
  await refreshCategoryDropdown();
  return normalized;
}

function parsePaymentModeCell(raw: string | undefined): PaymentMode {
  if (!raw?.trim()) return "cash";
  return normalizePaymentMode(raw);
}

function entryToRowValues(entry: ExpenseEntryInput): (string | number)[] {
  const mode = normalizePaymentMode(entry.paymentMode);
  return [
    entry.date,
    normalizeCategoryName(entry.category),
    entry.amount,
    paymentModeLabel(mode),
    entry.comment.trim(),
  ];
}

async function readExpenseRow(row: number): Promise<string[] | undefined> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${EXPENSE_SHEET}!A${row}:E${row}`,
  });
  return res.data.values?.[0];
}

function expenseRowMatches(entry: ExpenseEntryInput, row: string[]): boolean {
  const mode = normalizePaymentMode(entry.paymentMode);
  const rowMode = row[3]?.trim() ? normalizePaymentMode(row[3]) : "cash";
  return (
    normalizeSheetDate(row[0]) === entry.date &&
    normalizeCategoryName(row[1] ?? "") === normalizeCategoryName(entry.category) &&
    amountsMatch(parseSheetAmount(row[2]), entry.amount) &&
    rowMode === mode &&
    (row[4]?.trim() ?? "") === entry.comment.trim()
  );
}

async function nextExpenseDataRow(): Promise<number> {
  const entries = await getAllExpenseEntries();
  return entries.length + 2;
}

export async function getAllExpenseEntries(): Promise<ExpenseEntry[]> {
  await ensureExpenseSheets();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${EXPENSE_SHEET}!A:E`,
  });
  const rows = (res.data.values ?? []).slice(1);
  return rows
    .map((row, i) => ({
      id: String(i + 2),
      date: row[0] ?? "",
      category: normalizeCategoryName(row[1] ?? ""),
      amount: Number(row[2]) || 0,
      paymentMode: parsePaymentModeCell(row[3]),
      comment: row[4] ?? "",
    }))
    .filter((e) => e.date && e.category && e.amount > 0);
}

export async function appendExpenseEntry(entry: ExpenseEntryInput): Promise<void> {
  await ensureExpenseSheets();
  await addExpenseCategory(entry.category);

  const nextRow = await nextExpenseDataRow();
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${EXPENSE_SHEET}!A${nextRow}:E${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [entryToRowValues(entry)] },
  });

  await verifySheetWrite(async () => {
    const row = await readExpenseRow(nextRow);
    return row != null && expenseRowMatches(entry, row);
  }, "Expense entry");
}

export async function updateExpenseEntry(
  rowId: string,
  update: Partial<ExpenseEntryInput>
): Promise<void> {
  await ensureExpenseSheets();
  const sheets = getSheetsClient();
  const data: { range: string; values: (string | number)[][] }[] = [];

  if (update.date !== undefined) {
    data.push({ range: `${EXPENSE_SHEET}!A${rowId}`, values: [[update.date]] });
  }
  if (update.category !== undefined) {
    await addExpenseCategory(update.category);
    data.push({
      range: `${EXPENSE_SHEET}!B${rowId}`,
      values: [[normalizeCategoryName(update.category)]],
    });
  }
  if (update.amount !== undefined) {
    data.push({ range: `${EXPENSE_SHEET}!C${rowId}`, values: [[update.amount]] });
  }
  if (update.paymentMode !== undefined) {
    data.push({
      range: `${EXPENSE_SHEET}!D${rowId}`,
      values: [[paymentModeLabel(normalizePaymentMode(update.paymentMode))]],
    });
  }
  if (update.comment !== undefined) {
    data.push({ range: `${EXPENSE_SHEET}!E${rowId}`, values: [[update.comment.trim()]] });
  }

  if (data.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });

  await verifySheetWrite(async () => {
    const row = await readExpenseRow(Number(rowId));
    if (!row?.[0]) return false;
    if (update.date !== undefined && normalizeSheetDate(row[0]) !== update.date) return false;
    if (
      update.category !== undefined &&
      normalizeCategoryName(row[1] ?? "") !== normalizeCategoryName(update.category)
    ) {
      return false;
    }
    if (update.amount !== undefined && !amountsMatch(parseSheetAmount(row[2]), update.amount)) {
      return false;
    }
    if (update.paymentMode !== undefined) {
      const expected = normalizePaymentMode(update.paymentMode);
      const actual = row[3]?.trim() ? normalizePaymentMode(row[3]) : "cash";
      if (actual !== expected) return false;
    }
    if (update.comment !== undefined && (row[4]?.trim() ?? "") !== update.comment.trim()) {
      return false;
    }
    return true;
  }, "Expense entry update");
}

export async function deleteExpenseEntry(rowId: string): Promise<void> {
  await ensureExpenseSheets();
  const rowBefore = await readExpenseRow(Number(rowId));
  const snapshot = rowBefore?.[0]
    ? {
        date: normalizeSheetDate(rowBefore[0]),
        category: rowBefore[1] ?? "",
        amount: parseSheetAmount(rowBefore[2]),
      }
    : null;

  const sheets = getSheetsClient();
  const sheetId = await getSheetId(EXPENSE_SHEET);
  const rowIndex = Number(rowId) - 1;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });

  if (snapshot) {
    await verifySheetWrite(async () => {
      const entries = await getAllExpenseEntries();
      return !entries.some(
        (e) =>
          e.date === snapshot.date &&
          e.category === snapshot.category &&
          amountsMatch(e.amount, snapshot.amount)
      );
    }, "Expense entry delete");
  }
}
