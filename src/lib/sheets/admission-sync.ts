import { normalizeStudentName } from "@/lib/admission-utils";
import { parseGrNoFromNotes } from "@/lib/admission-form";
import { isInactiveAdmissionStatus } from "@/lib/student-status";
import { readAllAdmissionsFromSheet } from "./admissions";
import { addFeeRecord, readAllFeesFromSheetRaw, type FeeRecord } from "./fees";
import { sortPortalStudentSheets } from "./sort-sheets";
import { withSheetWriteLock } from "./sync-lock";
import { addStudent } from "./students";

function feeHasStudent(
  fees: { studentName: string; notes: string }[],
  fullName: string,
  grNo?: string
): boolean {
  const norm = normalizeStudentName(fullName);
  const wantedGr = grNo?.trim().toLowerCase();
  return fees.some((f) => {
    if (wantedGr) {
      const feeGr = parseGrNoFromNotes(f.notes)?.toLowerCase();
      if (feeGr === wantedGr) return true;
    }
    if (normalizeStudentName(f.studentName) === norm) return true;
    return false;
  });
}

export async function registerStudentFromAdmission(input: {
  fullName: string;
  standard: string;
  annualFee: number;
  discountAmount: number;
  grNo: string;
}): Promise<{ srNo: string; created: boolean }> {
  return withSheetWriteLock(async () => {
    // Re-read inside the write lock so check+append is atomic.
    const fees = await readAllFeesFromSheetRaw();
    if (feeHasStudent(fees, input.fullName, input.grNo)) {
      const existing = fees.find((f) => {
        const feeGr = parseGrNoFromNotes(f.notes)?.toLowerCase();
        if (input.grNo && feeGr === input.grNo.toLowerCase()) return true;
        return normalizeStudentName(f.studentName) === normalizeStudentName(input.fullName);
      });
      return { srNo: existing?.srNo ?? "", created: false };
    }

    const maxSr = fees.reduce((max, f) => Math.max(max, Number(f.srNo) || 0), 0);
    const srNo = String(maxSr + 1);

    await Promise.all([
      addFeeRecord({
        srNo,
        studentName: input.fullName,
        className: input.standard,
        totalFee: input.annualFee,
        discountAmount: input.discountAmount,
        grNo: input.grNo,
      }),
      addStudent(input.fullName, input.standard),
    ]);
    return { srNo, created: true };
  });
}

/** Admissions tab rows missing from Fee details (e.g. added manually in Sheets). */
export async function syncMissingAdmissionFees(): Promise<number> {
  return withSheetWriteLock(async () => {
    const [admissions, fees] = await Promise.all([
      readAllAdmissionsFromSheet(),
      readAllFeesFromSheetRaw(),
    ]);

    let maxSr = fees.reduce((m, f) => Math.max(m, Number(f.srNo) || 0), 0);
    let added = 0;

    for (const a of admissions) {
      if (isInactiveAdmissionStatus(a.status)) continue;
      const name = a.fullName.trim();
      if (!name) continue;
      if (feeHasStudent(fees, name, a.grNo)) continue;

      maxSr += 1;
      const srNo = String(maxSr);

      await addFeeRecord(
        {
          srNo,
          studentName: name,
          className: a.standard,
          totalFee: a.annualFee,
          discountAmount: a.discount,
          grNo: a.grNo,
        },
        { skipSort: true }
      );
      await addStudent(name, a.standard);

      fees.push({
        srNo,
        studentName: name,
        className: a.standard,
        totalFee: a.annualFee,
        totalPaid: 0,
        balance: a.annualFee,
        notes: `GR: ${a.grNo}`,
        discount: a.discount,
        q1Paid: 0,
        q2Paid: 0,
        q3Paid: 0,
        q4Paid: 0,
        sheetRow: 0,
      } satisfies FeeRecord);
      added++;
    }
    if (added > 0) await sortPortalStudentSheets();
    return added;
  });
}
