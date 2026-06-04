import type { DailyEntry } from "./dailyLog";
import {
  appendDailyEntry,
  getDailyEntriesForStudent,
  type DailyEntryInput,
} from "./dailyLog";
import type { FeeRecord } from "./fees";
import {
  FEE_MONTHS,
  readMonthlyPaymentsFromSheetRow,
  recalculateStudentFees,
  syncFeeRowAmounts,
  type FeePayment,
} from "./fees";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Which fee month (Jun=6 … May=5) a daily log row counts toward. */
export function feeMonthForEntry(entry: DailyEntry): number {
  if (entry.feeMonth && entry.feeMonth >= 1 && entry.feeMonth <= 12) {
    return entry.feeMonth;
  }
  return new Date(entry.date + "T00:00:00").getMonth() + 1;
}

function sumLogByFeeMonth(entries: DailyEntry[], month: number): number {
  return entries
    .filter((e) => feeMonthForEntry(e) === month)
    .reduce((s, e) => s + e.amount, 0);
}

function toFeePayments(entries: DailyEntry[]): FeePayment[] {
  return entries.map((e) => ({
    date: e.date,
    amount: e.amount,
    feeMonth: e.feeMonth || feeMonthForEntry(e),
  }));
}

/**
 * Keep Daily Log and Fee details in sync for one student.
 * - Sheet monthly column higher than log → append Daily Log row (today, fee month = that column).
 * - Log is source for edits/deletes → rebuild monthly + Q totals from log afterward.
 */
export async function reconcileStudentPayments(
  fee: FeeRecord,
  allEntries: DailyEntry[]
): Promise<void> {
  const studentEntries = allEntries.filter((e) => e.srNo === fee.srNo);
  const sheetMonthly = await readMonthlyPaymentsFromSheetRow(fee.sheetRow);
  const today = todayISO();
  const toAppend: DailyEntryInput[] = [];

  for (const month of FEE_MONTHS) {
    const sheetAmt = sheetMonthly[month] ?? 0;
    const logAmt = sumLogByFeeMonth(studentEntries, month);
    if (sheetAmt > logAmt + 0.001) {
      toAppend.push({
        date: today,
        studentName: fee.studentName,
        className: fee.className,
        srNo: fee.srNo,
        amount: sheetAmt - logAmt,
        feeMonth: month,
      });
    }
  }

  for (const input of toAppend) {
    await appendDailyEntry(input);
  }

  const finalEntries =
    toAppend.length > 0
      ? await getDailyEntriesForStudent(fee.srNo)
      : studentEntries;

  await recalculateStudentFees(fee.sheetRow, fee.totalFee, toFeePayments(finalEntries));
  await syncFeeRowAmounts(fee.sheetRow, fee.totalFee, fee.discount);
}
