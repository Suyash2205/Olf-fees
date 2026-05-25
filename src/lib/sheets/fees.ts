import { unstable_cache } from "next/cache";
import {
  applyDiscount,
  getBaseTuition,
  type DiscountType,
} from "@/lib/fees/structure";
import { canonicalClassLabel } from "@/lib/fees/structure";
import {
  compareByGradeThenName,
  isPassOutClass,
  sortByGradeThenName,
} from "@/lib/sort-by-grade";
import { getSheetsClient, FEES_SHEET_ID } from "./client";

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
  const newBalance = Math.max(0, finalFee - record.totalPaid);

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${SHEET_NAME}!${colLetter(COL.totalFee)}${record.sheetRow}`,
          values: [[finalFee]],
        },
        {
          range: `${SHEET_NAME}!${colLetter(COL.discount)}${record.sheetRow}`,
          values: [[discountAmount]],
        },
        {
          range: `${SHEET_NAME}!${colLetter(COL.pendingCol)}${record.sheetRow}`,
          values: [[newBalance]],
        },
        {
          range: `${SHEET_NAME}!${colLetter(COL.balance)}${record.sheetRow}`,
          values: [[newBalance]],
        },
      ],
    },
  });

  return { baseFee, discountAmount, finalFee };
}

async function _getAllFees(): Promise<FeeRecord[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:Z`,
  });
  const rows = res.data.values ?? [];
  const records = rows
    .slice(3)
    .map((row, i) => rowToFeeRecord(row as string[], i))
    .filter((r): r is FeeRecord => r != null)
    .filter((r) => !isPassOutClass(r.className, r.studentName));

  return sortByGradeThenName(
    records,
    (f) => f.className,
    (f) => f.studentName
  );
}

export const getAllFees = unstable_cache(_getAllFees, ["all-fees", process.env.FEES_SHEET_ID ?? ""], {
  revalidate: 60,
  tags: ["fees"],
});

export async function getFeeByName(name: string): Promise<FeeRecord | null> {
  const fees = await getAllFees();
  return fees.find((f) => f.studentName === name) ?? null;
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
const MONTH_TO_COL: Record<number, number> = {
  6: 8,  7: 9,  8: 10,  // Q1: Jun=I, Jul=J, Aug=K
  9: 12, 10: 13, 11: 14, // Q2: Sep=M, Oct=N, Nov=O
  12: 16, 1: 17, 2: 18,  // Q3: Dec=Q, Jan=R, Feb=S
  3: 20,  4: 21, 5: 22,  // Q4: Mar=U, Apr=V, May=W
};

// All 12 monthly sub-columns (in order)
const ALL_MONTH_COLS = Object.values(MONTH_TO_COL).sort((a, b) => a - b);

// Quarter total columns (L, P, T, X)
const Q_TOTAL_COLS = [COL.q1Paid, COL.q2Paid, COL.q3Paid, COL.q4Paid];

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
  const quarterSize = feeRecord.totalFee > 0 ? feeRecord.totalFee / 4 : 0;
  const currentQPaid = [feeRecord.q1Paid, feeRecord.q2Paid, feeRecord.q3Paid, feeRecord.q4Paid];
  const newQPaid = allocateToQuarters(amount, currentQPaid, quarterSize);

  const newTotalPaid = newQPaid.reduce((s, v) => s + v, 0);
  const newBalance = feeRecord.totalFee - newTotalPaid;

  // Read the current monthly column value to add to it
  const month = new Date(date + "T00:00:00").getMonth() + 1;
  const monthColIdx = MONTH_TO_COL[month];

  const batchData: { range: string; values: (number | string)[][] }[] = [];

  // Write changed Q total columns
  for (let i = 0; i < 4; i++) {
    if (newQPaid[i] !== currentQPaid[i]) {
      batchData.push({
        range: `${SHEET_NAME}!${colLetter(Q_TOTAL_COLS[i])}${sheetRow}`,
        values: [[newQPaid[i]]],
      });
    }
  }

  // Write totalPaid (Y) and balance (Z)
  batchData.push({
    range: `${SHEET_NAME}!${colLetter(COL.totalPaid)}${sheetRow}:${colLetter(COL.balance)}${sheetRow}`,
    values: [[newTotalPaid, newBalance]],
  });

  // Write to the payment month's column (read first to add)
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

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: batchData,
    },
  });
}

// Recalculate all Q totals AND monthly columns from scratch given the full payment history.
export async function recalculateStudentFees(
  sheetRow: number,
  totalFee: number,
  payments: { date: string; amount: number }[]
): Promise<void> {
  const sheets = getSheetsClient();
  const quarterSize = totalFee > 0 ? totalFee / 4 : 0;
  const qPaid = [0, 0, 0, 0];

  // Tally monthly column amounts
  const monthlyMap: Record<number, number> = {};

  for (const { date, amount } of payments) {
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

    // Track which monthly column this payment belongs to
    const month = new Date(date + "T00:00:00").getMonth() + 1;
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
}

export async function addFeeRecord(input: NewFeeRecordInput): Promise<void> {
  const { srNo, studentName, className, totalFee, discountAmount = 0 } = input;
  const sheets = getSheetsClient();
  const pending = totalFee > 0 ? totalFee : 0;
  // A–H: sr, name, class, pending balance, fees decided, pending %, comments, discount
  const row = [
    srNo,
    studentName,
    className,
    pending,
    totalFee,
    totalFee > 0 ? "0.00%" : "",
    "",
    discountAmount > 0 ? discountAmount : "",
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:H`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
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
