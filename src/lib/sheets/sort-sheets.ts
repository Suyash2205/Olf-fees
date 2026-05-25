import { canonicalClassLabel } from "@/lib/fees/structure";
import { compareByGradeThenName } from "@/lib/sort-by-grade";
import { getSheetsClient, FEES_SHEET_ID, STUDENTS_SHEET_ID } from "./client";
import { withSheetWriteLock } from "./sync-lock";

const FEE_SHEET = "Fee details";
const FEE_DATA_START = 4;
const FEE_COLS = 26;

const FEE_COL = { name: 1, class: 2 };

const STUDENT_SHEET = "Correct Student name";
const STUDENT_DATA_START = 3;
const STUDENT_COLS = 12;

const STUDENT_COL = { name: 1, class: 2 };

function padRow(row: string[], width: number): string[] {
  const out = [...row];
  while (out.length < width) out.push("");
  return out.slice(0, width);
}

function isNamedStudentRow(row: string[], nameCol: number): boolean {
  const name = row[nameCol]?.trim();
  return Boolean(name && name !== "Students Name");
}

/** Rewrite Fee details data rows: grouped by Standard, then name (Pass out last). */
export async function sortFeeDetailsSheet(): Promise<{ rowsSorted: number }> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${FEE_SHEET}!A:Z`,
  });
  const allRows = res.data.values ?? [];
  if (allRows.length < FEE_DATA_START) return { rowsSorted: 0 };

  const dataRows = allRows.slice(FEE_DATA_START - 1);
  const studentRows: string[][] = [];
  const otherRows: string[][] = [];

  for (const raw of dataRows) {
    const row = padRow(raw as string[], FEE_COLS);
    if (isNamedStudentRow(row, FEE_COL.name)) {
      studentRows.push(row);
    } else {
      otherRows.push(row);
    }
  }

  if (studentRows.length === 0) return { rowsSorted: 0 };

  studentRows.sort((a, b) =>
    compareByGradeThenName(
      canonicalClassLabel(a[FEE_COL.class]?.trim() ?? ""),
      canonicalClassLabel(b[FEE_COL.class]?.trim() ?? ""),
      a[FEE_COL.name]?.trim() ?? "",
      b[FEE_COL.name]?.trim() ?? ""
    )
  );

  const sortedData = [...studentRows, ...otherRows];
  const endRow = FEE_DATA_START + sortedData.length - 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${FEE_SHEET}!A${FEE_DATA_START}:Z${endRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: sortedData },
  });

  return { rowsSorted: studentRows.length };
}

/** Rewrite Correct Student name rows by Standard, then name. */
export async function sortStudentsSheet(): Promise<{ rowsSorted: number }> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: STUDENTS_SHEET_ID,
    range: `${STUDENT_SHEET}!A:L`,
  });
  const allRows = res.data.values ?? [];
  if (allRows.length < STUDENT_DATA_START) return { rowsSorted: 0 };

  const dataRows = allRows.slice(STUDENT_DATA_START - 1);
  const studentRows: string[][] = [];
  const otherRows: string[][] = [];

  for (const raw of dataRows) {
    const row = padRow(raw as string[], STUDENT_COLS);
    if (isNamedStudentRow(row, STUDENT_COL.name)) {
      studentRows.push(row);
    } else {
      otherRows.push(row);
    }
  }

  if (studentRows.length === 0) return { rowsSorted: 0 };

  studentRows.sort((a, b) =>
    compareByGradeThenName(
      a[STUDENT_COL.class]?.trim() ?? "",
      b[STUDENT_COL.class]?.trim() ?? "",
      a[STUDENT_COL.name]?.trim() ?? "",
      b[STUDENT_COL.name]?.trim() ?? ""
    )
  );

  const sortedData = [...studentRows, ...otherRows];
  const endRow = STUDENT_DATA_START + sortedData.length - 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: STUDENTS_SHEET_ID,
    range: `${STUDENT_SHEET}!A${STUDENT_DATA_START}:L${endRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: sortedData },
  });

  return { rowsSorted: studentRows.length };
}

/** Keep Fee details and student name list in the same grade order. */
export async function sortPortalStudentSheets(): Promise<void> {
  return withSheetWriteLock(async () => {
    await sortFeeDetailsSheet();
    await sortStudentsSheet();
  });
}
