import type { NextRequest } from "next/server";
import { recordAudit } from "@/lib/audit";
import type { PortalActor } from "@/lib/portal-auth";
import type { DailyEntry } from "./dailyLog";
import {
  appendDailyEntry,
  getDailyEntriesForStudent,
  type DailyEntryInput,
} from "./dailyLog";
import { FEES_SHEET_ID } from "./client";
import type { FeeRecord } from "./fees";
import {
  FEE_MONTHS,
  readMonthlyPaymentsFromSheetRow,
  recalculateStudentFees,
  syncFeeRowAmounts,
  type FeePayment,
} from "./fees";
import { getRecentSpreadsheetEditors } from "./sheet-revision-hint";

const MONTH_LABELS = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function manualSheetImportComment(month: number): string {
  const label = MONTH_LABELS[month] ?? `month ${month}`;
  return `Manual sheet entry (Fee details ${label} column). Not recorded via portal.`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Which fee month (Jun=6 … May=5) a Daily Fees Log row counts toward. */
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
 * Keep Daily Fees Log and Fee details in sync for one student.
 * - Sheet monthly column higher than log → append Daily Fees Log row (today, fee month = that column).
 * - Log is source for edits/deletes → rebuild monthly + Q totals from log afterward.
 */
export async function reconcileStudentPayments(
  fee: FeeRecord,
  allEntries: DailyEntry[],
  audit?: { req: NextRequest; actor: PortalActor }
): Promise<{ sheetEntriesAdded: number }> {
  const studentEntries = allEntries.filter((e) => e.srNo === fee.srNo);
  const sheetMonthly = await readMonthlyPaymentsFromSheetRow(fee.sheetRow);
  const today = todayISO();
  const toAppend: DailyEntryInput[] = [];
  const logTotal = studentEntries.reduce((s, e) => s + e.amount, 0);
  let importTotal = 0;

  for (const month of FEE_MONTHS) {
    const sheetAmt = sheetMonthly[month] ?? 0;
    const logAmt = sumLogByFeeMonth(studentEntries, month);
    if (sheetAmt > logAmt + 0.001) {
      const diff = sheetAmt - logAmt;
      // Ignore bogus sheet→log imports that would exceed the annual fee (e.g. Q totals
      // accidentally written into monthly columns by a past sync bug).
      if (logTotal + importTotal + diff > fee.totalFee + 0.001) continue;
      importTotal += diff;
      toAppend.push({
        date: today,
        studentName: fee.studentName,
        className: fee.className,
        srNo: fee.srNo,
        amount: diff,
        feeMonth: month,
        comment: manualSheetImportComment(month),
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

  if (audit && toAppend.length > 0) {
    let recentSheetEditors: Awaited<ReturnType<typeof getRecentSpreadsheetEditors>> = [];
    try {
      recentSheetEditors = await getRecentSpreadsheetEditors(FEES_SHEET_ID, 5);
    } catch {
      /* Drive revision hints are best-effort */
    }

    await recordAudit(audit.req, {
      action: "sync",
      resource: "payments",
      resourceId: fee.srNo,
      summary: `Imported ${toAppend.length} manual sheet payment(s) for ${fee.studentName}`,
      details: {
        source: "manual_sheet_entry",
        studentName: fee.studentName,
        note: "Amount was already in Fee details monthly columns (manual/pre-portal sheet edit). Portal user below triggered import only.",
        sheetEditAttribution:
          "Google Sheets does not expose per-cell editor via API. Recent spreadsheet editors are listed; check Fee details > Version history for the exact cell edit.",
        recentSheetEditors,
        entries: toAppend.map((e) => ({
          date: e.date,
          amount: e.amount,
          feeMonth: e.feeMonth,
          feeMonthLabel: MONTH_LABELS[e.feeMonth ?? 0] ?? null,
          comment: e.comment,
        })),
      },
      actor: audit.actor,
    });
  }

  return { sheetEntriesAdded: toAppend.length };
}
