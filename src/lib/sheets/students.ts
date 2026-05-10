import { getSheetsClient, STUDENTS_SHEET_ID } from "./client";

export interface Student {
  name: string;
  className: string;
  fees: string;     // raw fee string from sheet (e.g. "₹11,900")
  sheetRow: number; // actual 1-based row in sheet
}

// Headers are in rows 1-2; data starts at row 3
const DATA_START_ROW = 3;
const SHEET_NAME = "Correct Student name";

const COL = {
  name: 1,      // B: Students Name
  class: 2,     // C: Standard
  fees: 11,     // L: Fees
};

function rowToStudent(row: string[], rowIndex: number): Student | null {
  const name = row[COL.name]?.trim();
  if (!name || name === "Students Name") return null;

  return {
    name,
    className: row[COL.class]?.trim() ?? "",
    fees: row[COL.fees]?.trim() ?? "",
    sheetRow: DATA_START_ROW + rowIndex,
  };
}

export async function getAllStudents(): Promise<Student[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: STUDENTS_SHEET_ID,
    range: `${SHEET_NAME}!A:L`,
  });
  const rows = res.data.values ?? [];
  // Skip 2 header rows
  return rows
    .slice(2)
    .map((row, i) => rowToStudent(row as string[], i))
    .filter(Boolean) as Student[];
}

export async function getStudentByName(name: string): Promise<Student | null> {
  const students = await getAllStudents();
  return students.find((s) => s.name === name) ?? null;
}
