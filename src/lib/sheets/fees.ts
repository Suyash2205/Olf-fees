import {
  applyDiscount,
  getBaseTuition,
  splitIntoQuarters,
  type DiscountType,
} from "@/lib/fees/structure";
import { parseGrNoFromNotes } from "@/lib/admission-form";
import { normalizeStudentName } from "@/lib/admission-utils";
import { canonicalClassLabel } from "@/lib/fees/structure";
import {
  compareByGradeThenName,
  isPassOutClass,
  sortByGradeThenName,
} from "@/lib/sort-by-grade";
import { getSheetsClient, FEES_SHEET_ID } from "./client";
import { feeRecordIsInactive, getInactiveStudentKeys } from "./fees-inactive";
import { sortPortalStudentSheets } from "./sort-sheets";
import { cachedSheetRead } from "./read-cache";
import { withSheetRetry } from "./retry";

// Shared across the fees portal, dashboard, students API, portal summary AND the
// attendance roster/summaries. Cached briefly so concurrent users don't each
// re-read the fee + admissions sheets and trip the per-service-account quota.
// Every fee/admission write path calls invalidateSheetCache(), so this stays fresh.
const CACHE_FEES_ACTIVE = "fees:active";
const FEES_CACHE_TTL_MS = 15_000;

export interface FeeRecord {
  srNo: string;        // col A — serial number, used as unique ID
  studentName: string; // col B
  className: string;   // col C
  totalFee: number;    // col E — "Fees decided"
  q1Paid: number;      // col L — Q1 Total
  q2Paid: number;      // col P — Q2 Total
  q3Paid: number;      // col T — Q3 Total
  q4Paid: number;      // col X — Q4 Total
  totalPaid: number;   // col Y — Total Paid
  balance: number;     // col Z — Pending
  notes: string;       // col G — Comments
  discount: number;    // col H — Discount (₹)
  sheetRow: number;    // actual 1-based row in sheet (for writes)
}

export type PaymentStatus = "paid" | "partial" | "pending";

// The sheet has 3 header rows; data starts at row 4
const DATA_START_ROW = 4;
const SHEET_NAME = "Fee details";

const COL = {
  srNo: 0,     // A
  name: 1,     // B
  class: 2,    // C
  totalFee: 4, // E
  notes: 6,    // G
  discount: 7, // H
  pendingCol: 3, // D — sheet pending (often mirrors balance)
  q1Paid: 11,  // L
  q2Paid: 15,  // P
  q3Paid: 19,  // T
  q4Paid: 23,  // X
  totalPaid: 24, // Y
  balance: 25,   // Z
};

// Map 0-based column index → spreadsheet letter(s)
function colLetter(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val.replace(/[₹,]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function deriveStatus(paid: number, quarterFee: number): PaymentStatus {
  if (paid <= 0) return "pending";
  if (paid >= quarterFee) return "paid";
  return "partial";
}

function rowToFeeRecord(row: string[], rowIndex: number): FeeRecord | null {
  const srNo = row[COL.srNo]?.trim();
  const name = row[COL.name]?.trim();
  if (!srNo || !name || name === "Students Name") return null;

  const totalFee = parseNum(row[COL.totalFee]);
  const q1 = parseNum(row[COL.q1Paid]);
  const q2 = parseNum(row[COL.q2Paid]);
  const q3 = parseNum(row[COL.q3Paid]);
  const q4 = parseNum(row[COL.q4Paid]);
  const totalPaid = parseNum(row[COL.totalPaid]) || q1 + q2 + q3 + q4;
  const balance = parseNum(row[COL.balance]) || totalFee - totalPaid;

  const rawClass = row[COL.class]?.trim() ?? "";
  return {
    srNo,
    studentName: name,
    className: canonicalClassLabel(rawClass),
    totalFee,
    q1Paid: q1,
    q2Paid: q2,
    q3Paid: q3,
    q4Paid: q4,
    totalPaid,
    balance,
    notes: row[COL.notes]?.trim() ?? "",
    discount: parseNum(row[COL.discount]),
    sheetRow: DATA_START_ROW + rowIndex,
  };
}

/** Base annual fee before discount (standard for class, or current fee + existing discount). */
export function resolveFeeBase(record: FeeRecord): number {
  const fromClass = getBaseTuition(record.className);
  if (fromClass != null) return fromClass;
  return record.totalFee + record.discount;
}

export async function applyFeeDiscount(
  record: FeeRecord,
  discountType: DiscountType,
  discountValue: number
): Promise<{ baseFee: number; discountAmount: number; finalFee: number }> {
  const baseFee = resolveFeeBase(record);
  const { discountAmount, finalFee } = applyDiscount(baseFee, discountType, discountValue);
  await syncFeeRowAmounts(record.sheetRow, finalFee, discountAmount);
  return { baseFee, discountAmount, finalFee };
}

export async function readAllFeesFromSheetRaw(): Promise<FeeRecord[]> {
  const sheets = getSheetsClient();
  const res = await withSheetRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: FEES_SHEET_ID,
      range: `${SHEET_NAME}!A:Z`,
    })
  );
  const rows = res.data.values ?? [];
  const records = rows
    .slice(3)
    .map((row, i) => rowToFeeRecord(row as string[], i))
    .filter((r): r is FeeRecord => r != null);

  return sortByGradeThenName(
    records,
    (f) => f.className,
    (f) => f.studentName
  );
}

/** Active students only (excludes Pass out and Left/Failed/Removed). */
export async function readAllFeesFromSheet(): Promise<FeeRecord[]> {
  return cachedSheetRead(
    CACHE_FEES_ACTIVE,
    async () => {
      const inactive = await getInactiveStudentKeys();
      const records = (await readAllFeesFromSheetRaw())
        .filter((r) => !isPassOutClass(r.className, r.studentName))
        .filter((r) => !feeRecordIsInactive(r, inactive));

      return sortByGradeThenName(
        records,
        (f) => f.className,
        (f) => f.studentName
      );
    },
    FEES_CACHE_TTL_MS
  );
}

/** Short-lived cached read (see readAllFeesFromSheet); writes invalidate it. */
export const getAllFees = readAllFeesFromSheet;

export async function getFeeByName(name: string): Promise<FeeRecord | null> {
  const fees = await getAllFees();
  return fees.find((f) => f.studentName === name) ?? null;
}

export async function getFeeBySrNo(srNo: string): Promise<FeeRecord | null> {
  const fees = await getAllFees();
  return fees.find((f) => f.srNo === srNo) ?? null;
}

export async function updateFeePayment(
  sheetRow: number,
  field: "q1Paid" | "q2Paid" | "q3Paid" | "q4Paid" | "notes",
  value: string
): Promise<void> {
  const colIdx: Record<string, number> = {
    q1Paid: COL.q1Paid,
    q2Paid: COL.q2Paid,
    q3Paid: COL.q3Paid,
    q4Paid: COL.q4Paid,
    notes: COL.notes,
  };
  const col = colLetter(colIdx[field]);
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!${col}${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

export interface PendingFeeSummary {
  srNo: string;
  studentName: string;
  className: string;
  totalFee: number;
  totalPaid: number;
  balance: number;
  percentPaid: number;
}

export async function getPendingFees(): Promise<PendingFeeSummary[]> {
  const fees = await getAllFees();
  return fees
    .filter((f) => f.balance > 0)
    .map((f) => ({
      srNo: f.srNo,
      studentName: f.studentName,
      className: f.className,
      totalFee: f.totalFee,
      totalPaid: f.totalPaid,
      balance: f.balance,
      percentPaid: f.totalFee > 0 ? (f.totalPaid / f.totalFee) * 100 : 0,
    }))
    .sort((a, b) => {
      const byGrade = compareByGradeThenName(
        a.className,
        b.className,
        a.studentName,
        b.studentName
      );
      if (byGrade !== 0) return byGrade;
      return b.balance - a.balance;
    });
}

// Month (1-12) → 0-based column index (for monthly tracking only)
export const MONTH_TO_COL: Record<number, number> = {
  6: 8,  7: 9,  8: 10,  // Q1: Jun=I, Jul=J, Aug=K
  9: 12, 10: 13, 11: 14, // Q2: Sep=M, Oct=N, Nov=O
  12: 16, 1: 17, 2: 18,  // Q3: Dec=Q, Jan=R, Feb=S
  3: 20,  4: 21, 5: 22,  // Q4: Mar=U, Apr=V, May=W
};

/** Academic-year month order (Jun → May). */
export const FEE_MONTHS = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5] as const;

export type FeePayment = { date: string; amount: number; feeMonth?: number };

// All 12 monthly sub-columns (in order)
const ALL_MONTH_COLS = Object.values(MONTH_TO_COL).sort((a, b) => a - b);

// Quarter total columns (L, P, T, X)
const Q_TOTAL_COLS = [COL.q1Paid, COL.q2Paid, COL.q3Paid, COL.q4Paid];

/** Read Jun–May payment amounts from a fee row (cols I–W). */
export async function readMonthlyPaymentsFromSheetRow(
  sheetRow: number
): Promise<Record<number, number>> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!${colLetter(8)}${sheetRow}:${colLetter(22)}${sheetRow}`,
  });
  const row = res.data.values?.[0] ?? [];
  const out: Record<number, number> = {};
  for (const [month, colIdx] of Object.entries(MONTH_TO_COL)) {
    out[Number(month)] = parseNum(row[colIdx - 8]);
  }
  return out;
}

/** Read Q1–Q4 paid totals from sheet total columns (L, P, T, X). */
export async function readQuarterPaidFromSheetRow(
  sheetRow: number
): Promise<[number, number, number, number]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A${sheetRow}:Z${sheetRow}`,
  });
  const row = res.data.values?.[0] ?? [];
  return [
    parseNum(row[COL.q1Paid]),
    parseNum(row[COL.q2Paid]),
    parseNum(row[COL.q3Paid]),
    parseNum(row[COL.q4Paid]),
  ];
}

/**
 * After fees decided / discount changes, rewrite sheet totals so Q columns and
 * pending match the current annual fee and existing Q1–Q4 paid amounts.
 */
export async function syncFeeRowAmounts(
  sheetRow: number,
  finalFee: number,
  discountAmount: number
): Promise<{
  totalPaid: number;
  balance: number;
  quarterlyFees: [number, number, number, number];
  qPaid: [number, number, number, number];
}> {
  const qPaid = await readQuarterPaidFromSheetRow(sheetRow);
  const totalPaid = qPaid.reduce((s, v) => s + v, 0);
  const balance = Math.max(0, finalFee - totalPaid);
  const quarterlyFees = splitIntoQuarters(finalFee);
  const pendingPct =
    finalFee > 0 ? `${((balance / finalFee) * 100).toFixed(2)}%` : "";

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${SHEET_NAME}!${colLetter(COL.totalFee)}${sheetRow}`,
          values: [[finalFee]],
        },
        {
          range: `${SHEET_NAME}!${colLetter(COL.discount)}${sheetRow}`,
          values: [[discountAmount > 0 ? discountAmount : ""]],
        },
        {
          range: `${SHEET_NAME}!${colLetter(5)}${sheetRow}`,
          values: [[pendingPct]],
        },
        {
          range: `${SHEET_NAME}!${colLetter(COL.pendingCol)}${sheetRow}`,
          values: [[balance]],
        },
        ...Q_TOTAL_COLS.map((colIdx, i) => ({
          range: `${SHEET_NAME}!${colLetter(colIdx)}${sheetRow}`,
          values: [[qPaid[i]]],
        })),
        {
          range: `${SHEET_NAME}!${colLetter(COL.totalPaid)}${sheetRow}:${colLetter(COL.balance)}${sheetRow}`,
          values: [[totalPaid, balance]],
        },
      ],
    },
  });

  return { totalPaid, balance, quarterlyFees, qPaid };
}

// Allocate a payment into Q1→Q2→Q3→Q4 in order, regardless of payment month.
function allocateToQuarters(
  amount: number,
  currentQPaid: number[],
  quarterSize: number
): number[] {
  const newQPaid = [...currentQPaid];
  let rem = amount;
  for (let i = 0; i < 4 && rem > 0; i++) {
    const space = quarterSize > 0 ? Math.max(0, quarterSize - newQPaid[i]) : rem;
    if (space <= 0) continue;
    const toAdd = Math.min(rem, space);
    newQPaid[i] += toAdd;
    rem -= toAdd;
  }
  // Any excess stacks onto Q4
  if (rem > 0) newQPaid[3] += rem;
  return newQPaid;
}

export async function recordPaymentToSheet(
  sheetRow: number,
  date: string,
  amount: number,
  feeRecord: FeeRecord
): Promise<void> {
  const sheets = getSheetsClient();

  // Read the current monthly column value to add to it
  const month = new Date(date + "T00:00:00").getMonth() + 1;
  const monthColIdx = MONTH_TO_COL[month];

  const batchData: { range: string; values: (number | string)[][] }[] = [];

  if (monthColIdx !== undefined) {
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: FEES_SHEET_ID,
      range: `${SHEET_NAME}!${colLetter(monthColIdx)}${sheetRow}`,
    });
    const currentMonthVal = parseNum(readRes.data.values?.[0]?.[0]);
    batchData.push({
      range: `${SHEET_NAME}!${colLetter(monthColIdx)}${sheetRow}`,
      values: [[currentMonthVal + amount]],
    });
  }

  if (batchData.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: batchData,
      },
    });
  }

  // Reconcile Q totals, pending, and % from monthly columns + current annual fee
  await syncFeeRowAmounts(sheetRow, feeRecord.totalFee, feeRecord.discount);
}

// Recalculate all Q totals AND monthly columns from scratch given the full payment history.
export async function recalculateStudentFees(
  sheetRow: number,
  totalFee: number,
  payments: FeePayment[]
): Promise<void> {
  const sheets = getSheetsClient();
  const quarterSize = totalFee > 0 ? totalFee / 4 : 0;
  const qPaid = [0, 0, 0, 0];

  // Tally monthly column amounts
  const monthlyMap: Record<number, number> = {};

  for (const { date, amount, feeMonth } of payments) {
    // Quarter allocation (Q1 → Q2 → Q3 → Q4 in order)
    let rem = amount;
    for (let i = 0; i < 4 && rem > 0; i++) {
      const space = quarterSize > 0 ? Math.max(0, quarterSize - qPaid[i]) : rem;
      if (space <= 0) continue;
      const toAdd = Math.min(rem, space);
      qPaid[i] += toAdd;
      rem -= toAdd;
    }
    if (rem > 0) qPaid[3] += rem;

    // Fee month column: explicit (sheet sync) or from payment date
    const month =
      feeMonth ?? new Date(date + "T00:00:00").getMonth() + 1;
    const monthColIdx = MONTH_TO_COL[month];
    if (monthColIdx !== undefined) {
      monthlyMap[monthColIdx] = (monthlyMap[monthColIdx] ?? 0) + amount;
    }
  }

  const newTotalPaid = qPaid.reduce((s, v) => s + v, 0);
  const newBalance = totalFee - newTotalPaid;

  // Build one batch request: monthly cols + Q totals + Y/Z
  const batchData: { range: string; values: number[][] }[] = [];

  // Zero-or-set all 12 monthly columns
  for (const colIdx of ALL_MONTH_COLS) {
    batchData.push({
      range: `${SHEET_NAME}!${colLetter(colIdx)}${sheetRow}`,
      values: [[monthlyMap[colIdx] ?? 0]],
    });
  }

  // Q total columns
  for (let i = 0; i < 4; i++) {
    batchData.push({
      range: `${SHEET_NAME}!${colLetter(Q_TOTAL_COLS[i])}${sheetRow}`,
      values: [[qPaid[i]]],
    });
  }

  // totalPaid (Y) and balance (Z)
  batchData.push({
    range: `${SHEET_NAME}!${colLetter(COL.totalPaid)}${sheetRow}:${colLetter(COL.balance)}${sheetRow}`,
    values: [[newTotalPaid, newBalance]],
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: batchData,
    },
  });
}

export interface NewFeeRecordInput {
  srNo: string;
  studentName: string;
  className: string;
  totalFee: number;
  discountAmount?: number;
  grNo?: string;
}

export async function syncFeeFromAdmission(input: {
  fullName: string;
  previousName?: string;
  standard: string;
  annualFee: number;
  discountAmount: number;
  grNo: string;
}): Promise<void> {
  const fees = await readAllFeesFromSheet();
  let fee =
    fees.find(
      (f) =>
        input.previousName &&
        normalizeStudentName(f.studentName) === normalizeStudentName(input.previousName)
    ) ?? null;
  if (!fee && input.grNo) {
    fee = fees.find((f) => parseGrNoFromNotes(f.notes) === input.grNo) ?? null;
  }
  if (!fee) {
    fee =
      fees.find(
        (f) => normalizeStudentName(f.studentName) === normalizeStudentName(input.fullName)
      ) ?? null;
  }

  if (!fee) {
    const maxSr = fees.reduce((m, f) => Math.max(m, Number(f.srNo) || 0), 0);
    await addFeeRecord({
      srNo: String(maxSr + 1),
      studentName: input.fullName,
      className: input.standard,
      totalFee: input.annualFee,
      discountAmount: input.discountAmount,
      grNo: input.grNo,
    });
    return;
  }

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${SHEET_NAME}!${colLetter(COL.name)}${fee.sheetRow}`,
          values: [[input.fullName]],
        },
        {
          range: `${SHEET_NAME}!${colLetter(COL.class)}${fee.sheetRow}`,
          values: [[input.standard]],
        },
        {
          range: `${SHEET_NAME}!${colLetter(COL.notes)}${fee.sheetRow}`,
          values: [[input.grNo ? `GR: ${input.grNo}` : fee.notes]],
        },
      ],
    },
  });
  await syncFeeRowAmounts(fee.sheetRow, input.annualFee, input.discountAmount);
  await sortPortalStudentSheets();
}

export async function addFeeRecord(
  input: NewFeeRecordInput,
  opts?: { skipSort?: boolean }
): Promise<void> {
  const { srNo, studentName, className, totalFee, discountAmount = 0, grNo } = input;
  const sheets = getSheetsClient();
  const balance = totalFee > 0 ? totalFee : 0;
  const row = new Array(26).fill("");
  row[COL.srNo] = srNo;
  row[COL.name] = studentName;
  row[COL.class] = className;
  row[COL.pendingCol] = balance;
  row[COL.totalFee] = totalFee;
  row[5] = totalFee > 0 ? "0.00%" : "";
  row[COL.notes] = grNo ? `GR: ${grNo}` : "";
  row[COL.discount] = discountAmount > 0 ? discountAmount : "";
  row[COL.totalPaid] = 0;
  row[COL.balance] = balance;

  await sheets.spreadsheets.values.append({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  if (!opts?.skipSort) await sortPortalStudentSheets();
}

/** Payment / pending columns to wipe for a fresh academic year (keeps name, class, fees decided). */
const PAYMENT_CLEAR_COL_INDICES = [
  COL.pendingCol,
  5, // F — pending %
  COL.notes,
  COL.discount,
  ...Array.from({ length: 16 }, (_, i) => 8 + i), // I–X monthly + quarterly totals
  COL.totalPaid,
  COL.balance,
];

/** Clear all payment history on the current-year Fee details tab. */
export async function clearFeePaymentColumns(): Promise<{ rowsCleared: number }> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:Z`,
  });
  const rows = (res.data.values ?? []).slice(DATA_START_ROW - 1);
  let lastRow = DATA_START_ROW - 1;
  let studentRows = 0;
  for (let i = 0; i < rows.length; i++) {
    const name = rows[i][COL.name]?.trim();
    if (!name || name === "Students Name") continue;
    studentRows++;
    lastRow = DATA_START_ROW + i;
  }
  if (lastRow < DATA_START_ROW) return { rowsCleared: 0 };

  const ranges = PAYMENT_CLEAR_COL_INDICES.map(
    (c) => `${SHEET_NAME}!${colLetter(c)}${DATA_START_ROW}:${colLetter(c)}${lastRow}`
  );
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: { ranges },
  });
  return { rowsCleared: studentRows };
}
