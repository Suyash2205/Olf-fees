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
  // Skip blank rows and header-like rows
  if (!srNo || !name || name === "Students Name") return null;

  const totalFee = parseNum(row[COL.totalFee]);
  const q1 = parseNum(row[COL.q1Paid]);
  const q2 = parseNum(row[COL.q2Paid]);
  const q3 = parseNum(row[COL.q3Paid]);
  const q4 = parseNum(row[COL.q4Paid]);
  const totalPaid = parseNum(row[COL.totalPaid]) || q1 + q2 + q3 + q4;
  const balance = parseNum(row[COL.balance]) || totalFee - totalPaid;

  return {
    srNo,
    studentName: name,
    className: row[COL.class]?.trim() ?? "",
    totalFee,
    q1Paid: q1,
    q2Paid: q2,
    q3Paid: q3,
    q4Paid: q4,
    totalPaid,
    balance,
    notes: row[COL.notes]?.trim() ?? "",
    sheetRow: DATA_START_ROW + rowIndex,
  };
}

export async function getAllFees(): Promise<FeeRecord[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:Z`,
  });
  const rows = res.data.values ?? [];
  // Skip the 3 header rows
  return rows
    .slice(3)
    .map((row, i) => rowToFeeRecord(row as string[], i))
    .filter(Boolean) as FeeRecord[];
}

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
    .sort((a, b) => b.balance - a.balance);
}

// Month (1-12) → 0-based column index (for monthly tracking only)
const MONTH_TO_COL: Record<number, number> = {
  6: 8,  7: 9,  8: 10,  // Q1: Jun=I, Jul=J, Aug=K
  9: 12, 10: 13, 11: 14, // Q2: Sep=M, Oct=N, Nov=O
  12: 16, 1: 17, 2: 18,  // Q3: Dec=Q, Jan=R, Feb=S
  3: 20,  4: 21, 5: 22,  // Q4: Mar=U, Apr=V, May=W
};

// Quarter total columns (L, P, T, X) — these are what the website reads
const Q_TOTAL_COLS = [COL.q1Paid, COL.q2Paid, COL.q3Paid, COL.q4Paid]; // 11, 15, 19, 23

export async function recordPaymentToSheet(
  sheetRow: number,
  date: string,
  amount: number,
  feeRecord: FeeRecord
): Promise<void> {
  const sheets = getSheetsClient();
  const quarterSize = feeRecord.totalFee > 0 ? feeRecord.totalFee / 4 : 0;

  // Allocate payment in order Q1 → Q2 → Q3 → Q4, regardless of payment month
  const currentQPaid = [feeRecord.q1Paid, feeRecord.q2Paid, feeRecord.q3Paid, feeRecord.q4Paid];
  const newQPaid = [...currentQPaid];
  let rem = amount;

  for (let i = 0; i < 4 && rem > 0; i++) {
    const space = quarterSize > 0 ? Math.max(0, quarterSize - currentQPaid[i]) : rem;
    if (space <= 0) continue;
    const toAdd = Math.min(rem, space);
    newQPaid[i] += toAdd;
    rem -= toAdd;
  }
  // If all quarters are full (rem still > 0), stack onto Q4
  if (rem > 0) newQPaid[3] += rem;

  // Write each changed Q total column directly (these are what the website reads)
  for (let i = 0; i < 4; i++) {
    if (newQPaid[i] !== currentQPaid[i]) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: FEES_SHEET_ID,
        range: `${SHEET_NAME}!${colLetter(Q_TOTAL_COLS[i])}${sheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[newQPaid[i]]] },
      });
    }
  }

  // Update totalPaid (Y) and balance (Z) so website reads correctly
  const newTotalPaid = newQPaid.reduce((s, v) => s + v, 0);
  const newBalance = feeRecord.totalFee - newTotalPaid;
  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!${colLetter(COL.totalPaid)}${sheetRow}:${colLetter(COL.balance)}${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[newTotalPaid, newBalance]] },
  });

  // Also write to the payment month's column for physical receipt tracking
  const month = new Date(date + "T00:00:00").getMonth() + 1;
  const monthColIdx = MONTH_TO_COL[month];
  if (monthColIdx !== undefined) {
    const monthCol = colLetter(monthColIdx);
    const currentRes = await sheets.spreadsheets.values.get({
      spreadsheetId: FEES_SHEET_ID,
      range: `${SHEET_NAME}!${monthCol}${sheetRow}`,
    });
    const currentVal = parseNum(currentRes.data.values?.[0]?.[0]);
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${SHEET_NAME}!${monthCol}${sheetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[currentVal + amount]] },
    });
  }
}

// Recalculate all Q totals from scratch given a list of payment amounts (in order)
export async function recalculateStudentFees(
  sheetRow: number,
  totalFee: number,
  amounts: number[]
): Promise<void> {
  const sheets = getSheetsClient();
  const quarterSize = totalFee > 0 ? totalFee / 4 : 0;
  const qPaid = [0, 0, 0, 0];

  for (const amount of amounts) {
    let rem = amount;
    for (let i = 0; i < 4 && rem > 0; i++) {
      const space = quarterSize > 0 ? Math.max(0, quarterSize - qPaid[i]) : rem;
      if (space <= 0) continue;
      const toAdd = Math.min(rem, space);
      qPaid[i] += toAdd;
      rem -= toAdd;
    }
    if (rem > 0) qPaid[3] += rem;
  }

  for (let i = 0; i < 4; i++) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${SHEET_NAME}!${colLetter(Q_TOTAL_COLS[i])}${sheetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[qPaid[i]]] },
    });
  }

  const newTotalPaid = qPaid.reduce((s, v) => s + v, 0);
  const newBalance = totalFee - newTotalPaid;
  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!${colLetter(COL.totalPaid)}${sheetRow}:${colLetter(COL.balance)}${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[newTotalPaid, newBalance]] },
  });
}

export async function addFeeRecord(
  srNo: string,
  studentName: string,
  className: string,
  totalFee: number
): Promise<void> {
  const sheets = getSheetsClient();
  // Build a row matching the sheet columns (A-E minimum; rest blank)
  // A=srNo, B=studentName, C=className, D=0(pending prev), E=totalFee
  const row = [srNo, studentName, className, "0", totalFee.toString()];
  await sheets.spreadsheets.values.append({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:E`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}
