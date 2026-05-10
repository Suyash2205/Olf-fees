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
