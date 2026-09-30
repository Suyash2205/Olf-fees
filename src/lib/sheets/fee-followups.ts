/**
 * Fee follow-up call log — portal-owned `Fee Follow-ups` tab, append-only.
 * Joined to students by Sr No only.
 */
import { isValidIsoDate, type FollowUp } from "@/lib/fees/follow-ups";
import { appendKeyedRow, readKeyedTab, type TabRow } from "./keyed-tab";

export const FEE_FOLLOWUPS_SHEET = "Fee Follow-ups";

export const FEE_FOLLOWUP_HEADERS = [
  "Sr No",
  "Student Name",
  "Class",
  "Date",
  "Parent Said",
  "Reason",
  "Next Follow-up",
  "Added By",
  "Added At",
] as const;

export const FOLLOWUP_TEXT_MAX = 1000;

function toFollowUp(r: TabRow<(typeof FEE_FOLLOWUP_HEADERS)[number]>): FollowUp {
  return {
    srNo: r["Sr No"],
    studentName: r["Student Name"],
    className: r.Class,
    date: r.Date,
    parentSaid: r["Parent Said"],
    reason: r.Reason,
    nextFollowUp: r["Next Follow-up"],
    addedBy: r["Added By"],
    addedAt: r["Added At"],
    sheetRow: r.sheetRow,
  };
}

export async function readFeeFollowUps(): Promise<FollowUp[]> {
  const rows = await readKeyedTab(FEE_FOLLOWUPS_SHEET, FEE_FOLLOWUP_HEADERS, 20_000);
  return rows.map(toFollowUp);
}

export interface FollowUpInput {
  srNo: string;
  studentName: string;
  className: string;
  date: string;
  parentSaid?: string;
  reason?: string;
  nextFollowUp?: string;
}

/** Pure validation; throws a user-readable Error. Returns the cleaned fields. */
export function validateFollowUpInput(input: FollowUpInput) {
  const srNo = input.srNo.trim();
  if (!srNo) throw new Error("Sr No is required.");
  if (!isValidIsoDate(input.date)) throw new Error("Call date must be a valid date (YYYY-MM-DD).");
  const parentSaid = (input.parentSaid ?? "").trim();
  const reason = (input.reason ?? "").trim();
  const nextFollowUp = (input.nextFollowUp ?? "").trim();
  if (parentSaid.length > FOLLOWUP_TEXT_MAX || reason.length > FOLLOWUP_TEXT_MAX) {
    throw new Error(`Notes are limited to ${FOLLOWUP_TEXT_MAX} characters each.`);
  }
  if (nextFollowUp) {
    if (!isValidIsoDate(nextFollowUp)) throw new Error("Next follow-up must be a valid date.");
    if (nextFollowUp < input.date) throw new Error("Next follow-up cannot be before the call date.");
  }
  if (!parentSaid && !reason && !nextFollowUp) {
    throw new Error("Enter what the parent said, a reason, or a next follow-up date.");
  }
  return { srNo, parentSaid, reason, nextFollowUp };
}

export async function addFeeFollowUp(input: FollowUpInput, actorEmail: string): Promise<void> {
  const v = validateFollowUpInput(input);
  await appendKeyedRow(FEE_FOLLOWUPS_SHEET, FEE_FOLLOWUP_HEADERS, {
    "Sr No": v.srNo,
    "Student Name": input.studentName,
    Class: input.className,
    Date: input.date,
    "Parent Said": v.parentSaid,
    Reason: v.reason,
    "Next Follow-up": v.nextFollowUp,
    "Added By": actorEmail,
    "Added At": new Date().toISOString(),
  });
}
