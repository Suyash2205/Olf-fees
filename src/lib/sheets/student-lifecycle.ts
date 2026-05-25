import { parseGrNoFromNotes } from "@/lib/admission-form";
import { normalizeStudentName } from "@/lib/admission-utils";
import {
  isActiveStatus,
  normalizeStatusLabel,
  upsertStatusInNotes,
} from "@/lib/student-status";
import {
  getAdmissionByGrNo,
  getAdmissionByStudentName,
  updateAdmission,
  type AdmissionRecord,
} from "./admissions";
import { getSheetsClient, FEES_SHEET_ID, STUDENTS_SHEET_ID } from "./client";
import { readAllFeesFromSheetRaw, type FeeRecord } from "./fees";
import { sortPortalStudentSheets } from "./sort-sheets";

const FEE_SHEET = "Fee details";
const STUDENT_SHEET = "Correct Student name";
const FEE_DATA_START = 4;
const STUDENT_DATA_START = 3;

async function getSheetId(spreadsheetId: string, title: string): Promise<number> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  const id = sheet?.properties?.sheetId;
  if (id == null) throw new Error(`Sheet not found: ${title}`);
  return id;
}

async function deleteSheetRow(
  spreadsheetId: string,
  sheetTitle: string,
  row1Based: number
): Promise<void> {
  const sheetId = await getSheetId(spreadsheetId, sheetTitle);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: row1Based - 1,
              endIndex: row1Based,
            },
          },
        },
      ],
    },
  });
}

async function findStudentListRow(name: string): Promise<number | null> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: STUDENTS_SHEET_ID,
    range: `${STUDENT_SHEET}!B:B`,
  });
  const norm = normalizeStudentName(name);
  const rows = res.data.values ?? [];
  for (let i = STUDENT_DATA_START - 1; i < rows.length; i++) {
    const cell = rows[i][0]?.trim();
    if (cell && normalizeStudentName(cell) === norm) {
      return i + 1;
    }
  }
  return null;
}

async function findFeeBySheetRow(sheetRow: number): Promise<FeeRecord | null> {
  const fees = await readAllFeesFromSheetRaw();
  return fees.find((f) => f.sheetRow === sheetRow) ?? null;
}

async function resolveAdmissionForFee(fee: FeeRecord): Promise<AdmissionRecord | null> {
  const gr = parseGrNoFromNotes(fee.notes);
  if (gr) {
    const byGr = await getAdmissionByGrNo(gr);
    if (byGr) return byGr;
  }
  return getAdmissionByStudentName(fee.studentName);
}

/** Delete fee row, student name list row, and admissions row. */
export async function removeStudentCompletely(opts: {
  sheetRow?: number;
  grNo?: string;
}): Promise<{ removed: string }> {
  let fee: FeeRecord | null = null;
  let admission: AdmissionRecord | null = null;

  if (opts.grNo) {
    admission = await getAdmissionByGrNo(opts.grNo);
    if (admission) {
      const fees = await readAllFeesFromSheetRaw();
      fee =
        fees.find((f) => parseGrNoFromNotes(f.notes) === opts.grNo) ??
        fees.find(
          (f) => normalizeStudentName(f.studentName) === normalizeStudentName(admission!.fullName)
        ) ??
        null;
    }
  }

  if (opts.sheetRow && !fee) {
    fee = await findFeeBySheetRow(opts.sheetRow);
  }

  if (fee && !admission) {
    admission = await resolveAdmissionForFee(fee);
  }

  const rowsToDelete: { spreadsheetId: string; sheet: string; row: number }[] = [];

  if (fee?.sheetRow) {
    rowsToDelete.push({
      spreadsheetId: FEES_SHEET_ID,
      sheet: FEE_SHEET,
      row: fee.sheetRow,
    });
  }

  const studentName = admission?.fullName ?? fee?.studentName;
  if (studentName) {
    const studentRow = await findStudentListRow(studentName);
    if (studentRow) {
      rowsToDelete.push({
        spreadsheetId: STUDENTS_SHEET_ID,
        sheet: STUDENT_SHEET,
        row: studentRow,
      });
    }
  }

  if (admission?.sheetRow) {
    rowsToDelete.push({
      spreadsheetId: FEES_SHEET_ID,
      sheet: "Admissions",
      row: admission.sheetRow,
    });
  }

  rowsToDelete.sort((a, b) => b.row - a.row);
  for (const item of rowsToDelete) {
    await deleteSheetRow(item.spreadsheetId, item.sheet, item.row);
  }

  const label = studentName ?? opts.grNo ?? "Student";
  if (rowsToDelete.length > 0) {
    await sortPortalStudentSheets();
  }
  return { removed: label };
}

export async function setStudentStatus(opts: {
  sheetRow?: number;
  grNo?: string;
  status: string;
}): Promise<{ fullName: string; status: string }> {
  const status = normalizeStatusLabel(opts.status);
  let fee: FeeRecord | null = null;
  let admission: AdmissionRecord | null = null;

  if (opts.grNo) {
    admission = await getAdmissionByGrNo(opts.grNo);
  }
  if (opts.sheetRow) {
    fee = await findFeeBySheetRow(opts.sheetRow);
  }
  if (!fee && admission) {
    const fees = await readAllFeesFromSheetRaw();
    fee =
      fees.find((f) => parseGrNoFromNotes(f.notes) === admission!.grNo) ??
      fees.find(
        (f) => normalizeStudentName(f.studentName) === normalizeStudentName(admission!.fullName)
      ) ??
      null;
  }
  if (fee && !admission) {
    admission = await resolveAdmissionForFee(fee);
  }

  if (admission) {
    await updateAdmission({ ...admission, status });
  }

  if (fee) {
    const sheets = getSheetsClient();
    const notes = upsertStatusInNotes(fee.notes, isActiveStatus(status) ? null : status);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          {
            range: `${FEE_SHEET}!G${fee.sheetRow}`,
            values: [[notes]],
          },
        ],
      },
    });
  }

  const fullName = admission?.fullName ?? fee?.studentName ?? opts.grNo ?? "Student";
  return { fullName, status };
}

export async function deleteAdmissionByGrNo(grNo: string): Promise<{ removed: string }> {
  return removeStudentCompletely({ grNo });
}
