import { parseGrNoFromNotes } from "@/lib/admission-form";
import { normalizeStudentName } from "@/lib/admission-utils";
import { isActiveStatus } from "@/lib/student-status";
import { readAllAdmissionsFromSheet } from "./admissions";

export async function getInactiveStudentKeys(): Promise<Set<string>> {
  const admissions = await readAllAdmissionsFromSheet();
  const keys = new Set<string>();
  for (const a of admissions) {
    if (isActiveStatus(a.status)) continue;
    keys.add(normalizeStudentName(a.fullName));
    if (a.grNo) keys.add(a.grNo.toLowerCase());
  }
  return keys;
}

export function feeRecordIsInactive(
  fee: { studentName: string; notes: string },
  inactiveKeys: Set<string>
): boolean {
  if (inactiveKeys.has(normalizeStudentName(fee.studentName))) return true;
  const gr = parseGrNoFromNotes(fee.notes);
  if (gr && inactiveKeys.has(gr.toLowerCase())) return true;
  if (/STATUS:\s*(Left|Failed|Removed)/i.test(fee.notes)) return true;
  return false;
}
