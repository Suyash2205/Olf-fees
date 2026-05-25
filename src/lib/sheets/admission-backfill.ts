import {
  feeToFormDefaults,
  parseGrNoFromNotes,
  upsertGrInNotes,
} from "@/lib/admission-form";
import { normalizeStudentName } from "@/lib/admission-utils";
import {
  appendAdmissionsBatch,
  readAllAdmissionsFromSheet,
  type AdmissionInput,
  type AdmissionRecord,
} from "./admissions";
import {
  buildInactiveKeysFromAdmissions,
  feeRecordIsInactive,
} from "./fees-inactive";
import { readAllFeesFromSheetRaw, type FeeRecord } from "./fees";
import { getSheetsClient, FEES_SHEET_ID } from "./client";
import { withSheetWriteLock } from "./sync-lock";

const FEE_SHEET_NAME = "Fee details";
const FEE_NOTES_COL = 6; // G

function colLetter(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
}

function buildAdmissionIndex(admissions: AdmissionRecord[]) {
  const byName = new Set<string>();
  const byGr = new Set<string>();
  for (const a of admissions) {
    if (a.fullName.trim()) byName.add(normalizeStudentName(a.fullName));
    if (a.grNo) byGr.add(a.grNo.toLowerCase());
  }
  return { byName, byGr };
}

function feeAlreadyHasAdmission(
  fee: FeeRecord,
  index: ReturnType<typeof buildAdmissionIndex>
): boolean {
  if (index.byName.has(normalizeStudentName(fee.studentName))) return true;
  const gr = parseGrNoFromNotes(fee.notes);
  if (gr && index.byGr.has(gr.toLowerCase())) return true;
  return false;
}

function feeToAdmissionInput(fee: FeeRecord, grNo: string): AdmissionInput & {
  annualFee: number;
  discount: number;
  grNo: string;
} {
  const form = feeToFormDefaults(fee);
  const firstName = form.firstName.trim() || fee.studentName.trim();
  const surname = form.surname.trim() || firstName;

  return {
    grNo,
    formNo: "",
    admissionDate: "",
    medium: "English",
    photoUrl: "",
    surname,
    firstName,
    fatherName: form.fatherName,
    motherName: "",
    fullName: fee.studentName.trim(),
    standard: fee.className,
    dob: "",
    placeOfBirth: "",
    sex: "",
    state: "",
    studentContact: "",
    ageYears: "",
    ageMonths: "",
    aadhar: "",
    religion: "",
    caste: "",
    subCaste: "",
    nationality: "Indian",
    bloodGroup: "",
    motherTongue: "",
    residentialAddress: "",
    lastSchool: "",
    reasonLeaving: "",
    residesWith: "",
    fatherSurname: "",
    fatherFirstName: "",
    fatherMiddleName: "",
    fatherEducation: "",
    fatherOccupation: "",
    fatherContact: "",
    motherSurname: "",
    motherFirstName: "",
    motherMiddleName: "",
    motherEducation: "",
    motherOccupation: "",
    motherContact: "",
    email: "",
    annualFee: fee.totalFee,
    discount: fee.discount,
    status: "Incomplete",
  };
}

async function linkGrNumbersToFeeRows(
  links: { sheetRow: number; notes: string; grNo: string }[]
): Promise<void> {
  const needsLink = links.filter(
    ({ notes, grNo }) => parseGrNoFromNotes(notes) !== grNo
  );
  if (needsLink.length === 0) return;

  const sheets = getSheetsClient();
  const CHUNK = 400;
  const data = needsLink.map(({ sheetRow, notes, grNo }) => ({
    range: `${FEE_SHEET_NAME}!${colLetter(FEE_NOTES_COL)}${sheetRow}`,
    values: [[upsertGrInNotes(notes, grNo)]],
  }));
  for (let i = 0; i < data.length; i += CHUNK) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: data.slice(i, i + CHUNK),
      },
    });
  }
}

export type BackfillAdmissionsResult = {
  created: number;
  skipped: number;
  skippedNames: string[];
  createdGrNos: string[];
};

/**
 * Create Admissions tab rows for every active fee-sheet student missing a profile.
 * Name, class, annual fee, and discount are copied from Fee details; other fields stay blank.
 */
export async function backfillAdmissionsFromFees(): Promise<BackfillAdmissionsResult> {
  // Reads outside the global write lock so other pages are not blocked as long.
  const [feesRaw, admissions] = await Promise.all([
    readAllFeesFromSheetRaw(),
    readAllAdmissionsFromSheet(),
  ]);

  const inactiveKeys = buildInactiveKeysFromAdmissions(admissions);
  const index = buildAdmissionIndex(admissions);

  const toCreate: FeeRecord[] = [];
  const skippedNames: string[] = [];

  for (const fee of feesRaw) {
    if (!fee.studentName.trim()) continue;
    if (feeRecordIsInactive(fee, inactiveKeys)) {
      skippedNames.push(fee.studentName);
      continue;
    }
    if (feeAlreadyHasAdmission(fee, index)) {
      skippedNames.push(fee.studentName);
      continue;
    }
    toCreate.push(fee);
  }

  if (toCreate.length === 0) {
    return { created: 0, skipped: skippedNames.length, skippedNames, createdGrNos: [] };
  }

  const year = new Date().getFullYear();
  const prefix = `GR-${year}-`;
  const nums = admissions
    .map((a) => a.grNo)
    .filter((g) => g.startsWith(prefix))
    .map((g) => parseInt(g.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  let nextNum = nums.length ? Math.max(...nums) : 0;

  const inputs = toCreate.map((fee) => {
    nextNum += 1;
    const grNo = `${prefix}${String(nextNum).padStart(4, "0")}`;
    return feeToAdmissionInput(fee, grNo);
  });

  return withSheetWriteLock(async () => {
    // Re-check under lock in case another request created rows while we prepared.
    const fresh = await readAllAdmissionsFromSheet();
    const freshIndex = buildAdmissionIndex(fresh);
    const stillToCreate = toCreate.filter((f) => !feeAlreadyHasAdmission(f, freshIndex));

    if (stillToCreate.length === 0) {
      return {
        created: 0,
        skipped: skippedNames.length,
        skippedNames,
        createdGrNos: [],
      };
    }

    const freshNums = fresh
      .map((a) => a.grNo)
      .filter((g) => g.startsWith(prefix))
      .map((g) => parseInt(g.slice(prefix.length), 10))
      .filter((n) => !isNaN(n));
    let freshNext = freshNums.length ? Math.max(...freshNums) : 0;

    const freshInputs = stillToCreate.map((fee) => {
      freshNext += 1;
      const grNo = `${prefix}${String(freshNext).padStart(4, "0")}`;
      return feeToAdmissionInput(fee, grNo);
    });

    const records = await appendAdmissionsBatch(freshInputs);

    await linkGrNumbersToFeeRows(
      stillToCreate.map((fee, i) => ({
        sheetRow: fee.sheetRow,
        notes: fee.notes,
        grNo: records[i].grNo,
      }))
    );

    return {
      created: records.length,
      skipped: skippedNames.length,
      skippedNames,
      createdGrNos: records.map((r) => r.grNo),
    };
  });
}
