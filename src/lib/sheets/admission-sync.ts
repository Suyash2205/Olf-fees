import { normalizeStudentName } from "@/lib/admission-utils";
import { readAllAdmissionsFromSheet } from "./admissions";
import { addFeeRecord, readAllFeesFromSheet, type FeeRecord } from "./fees";
import { sortPortalStudentSheets } from "./sort-sheets";
import { addStudent } from "./students";

function feeHasStudent(
  fees: { studentName: string; notes: string }[],
  fullName: string,
  grNo?: string
): boolean {
  const norm = normalizeStudentName(fullName);
  return fees.some((f) => {
    if (normalizeStudentName(f.studentName) === norm) return true;
    if (grNo && f.notes.includes(grNo)) return true;
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
  const fees = await readAllFeesFromSheet();
  if (feeHasStudent(fees, input.fullName, input.grNo)) {
    const existing = fees.find(
      (f) => normalizeStudentName(f.studentName) === normalizeStudentName(input.fullName)
    );
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
}

/** Admissions tab rows missing from Fee details (e.g. added manually in Sheets). */
export async function syncMissingAdmissionFees(): Promise<number> {
  const [admissions, fees] = await Promise.all([
    readAllAdmissionsFromSheet(),
    readAllFeesFromSheet(),
  ]);

  let maxSr = fees.reduce((m, f) => Math.max(m, Number(f.srNo) || 0), 0);
  let added = 0;

  for (const a of admissions) {
    if (a.status && a.status.toLowerCase() !== "active") continue;
    const name = a.fullName.trim();
    if (!name) continue;
    if (feeHasStudent(fees, name, a.grNo)) continue;

    maxSr += 1;
    const srNo = String(maxSr);

    await addFeeRecord({
      srNo,
      studentName: name,
      className: a.standard,
      totalFee: a.annualFee,
      discountAmount: a.discount,
      grNo: a.grNo,
    });
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
}
