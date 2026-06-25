import { parseGrNoFromNotes } from "@/lib/admission-form";
import { normalizeStudentName } from "@/lib/admission-utils";
import { isActiveStatus } from "@/lib/student-status";
import { readAllAdmissionsFromSheet, type AdmissionRecord } from "./admissions";

export function buildInactiveKeysFromAdmissions(
  admissions: AdmissionRecord[]
): Set<string> {
  const keys = new Set<string>();
  const activeNameKeys = new Set<string>();

  for (const a of admissions) {
    if (!isActiveStatus(a.status)) continue;
    activeNameKeys.add(normalizeStudentName(a.fullName));
  }

  for (const a of admissions) {
    if (isActiveStatus(a.status)) continue;
    const nameKey = normalizeStudentName(a.fullName);
    // Do not hide by name if an active admission exists with the same name.
    if (!activeNameKeys.has(nameKey)) {
      keys.add(nameKey);
    }
    if (a.grNo) keys.add(a.grNo.toLowerCase());
  }
  return keys;
}

export async function getInactiveStudentKeys(): Promise<Set<string>> {
  const admissions = await readAllAdmissionsFromSheet();
  return buildInactiveKeysFromAdmissions(admissions);
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
