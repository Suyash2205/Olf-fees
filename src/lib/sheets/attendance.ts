import {
  CLASS_OPTIONS,
  canonicalClassLabel,
} from "@/lib/fees/structure";
import type {
  AttendanceDaySummary,
  AttendanceEntry,
  AttendanceRow,
  AttendanceStatus,
} from "@/lib/attendance/types";
import {
  attendanceStatusLabel,
  parseAttendanceStatus,
} from "@/lib/attendance/types";
import { getLatestAttendanceAuditByClass } from "@/lib/sheets/attendance-audit-log";
import { getSheetsClient, FEES_SHEET_ID } from "./client";
import { withSheetRetry } from "./retry";
import { cachedSheetRead, invalidateSheetCache } from "./read-cache";
import {
  normalizeSheetDate,
  verifySheetWrite,
} from "./verify-write";

/** Cache key prefixes for attendance reads (invalidated on save). */
const CACHE_MARKED = "attendance:marked:";
const CACHE_ALLROWS = "attendance:allrows";

export const ATTENDANCE_SHEET_PREFIX = "Attendance · ";

const MATRIX_HEADERS = ["Name", "Sr No", "Dates"] as const;
const NAME_COL = 0;
const SR_COL = 1;
const DATE_START_COL = 2;
const HEADER_ROWS = 2;

const OLD_HEADERS = [
  "Date",
  "Student Name",
  "Sr No",
  "Status",
  "Teacher Email",
  "Teacher Name",
  "Submitted At",
] as const;

const ensuredSheets = new Set<string>();

interface MatrixStudent {
  studentName: string;
  srNo: string;
  statuses: Map<string, AttendanceStatus>;
}

interface AttendanceMatrix {
  dates: string[];
  students: MatrixStudent[];
}

export function attendanceSheetTitle(className: string): string {
  return `${ATTENDANCE_SHEET_PREFIX}${canonicalClassLabel(className)}`;
}

export function isAttendanceSheetTitle(title: string): boolean {
  return title.startsWith(ATTENDANCE_SHEET_PREFIX);
}

export function classNameFromSheetTitle(title: string): string | null {
  if (!isAttendanceSheetTitle(title)) return null;
  return title.slice(ATTENDANCE_SHEET_PREFIX.length);
}

function studentRowKey(srNo: string, studentName: string): string {
  return `${srNo}|${studentName}`;
}

function isOldLogFormat(values: string[][]): boolean {
  return values[0]?.[0] === OLD_HEADERS[0];
}

function isMatrixFormat(values: string[][]): boolean {
  return values[0]?.[NAME_COL] === MATRIX_HEADERS[0];
}

async function ensureClassAttendanceSheet(className: string): Promise<string> {
  const title = attendanceSheetTitle(className);
  if (ensuredSheets.has(title)) return title;

  const sheets = getSheetsClient();
  const meta = await withSheetRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID })
  );
  const exists = meta.data.sheets?.some((s) => s.properties?.title === title);

  if (!exists) {
    await withSheetRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId: FEES_SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title } } }],
        },
      })
    );
    await writeMatrixToSheet(title, { dates: [], students: [] });
  }

  ensuredSheets.add(title);
  return title;
}

function parseOldLogRows(values: string[][], className: string): AttendanceRow[] {
  const rows = values.slice(1);
  const result: AttendanceRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const status = parseAttendanceStatus(row[3] ?? "");
    if (!row[0] || !row[1] || !status) continue;
    result.push({
      rowId: String(i + 2),
      date: normalizeSheetDate(row[0]),
      studentName: row[1] ?? "",
      srNo: row[2] ?? "",
      status,
      teacherEmail: row[4] ?? "",
      teacherName: row[5] ?? "",
      submittedAt: row[6] ?? "",
      className: canonicalClassLabel(className),
    });
  }
  return result;
}

function rowsToMatrix(rows: AttendanceRow[]): AttendanceMatrix {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const studentMap = new Map<string, MatrixStudent>();

  for (const row of rows) {
    const key = studentRowKey(row.srNo, row.studentName);
    const student =
      studentMap.get(key) ??
      ({
        studentName: row.studentName,
        srNo: row.srNo,
        statuses: new Map<string, AttendanceStatus>(),
      } satisfies MatrixStudent);
    student.statuses.set(row.date, row.status);
    studentMap.set(key, student);
  }

  const students = [...studentMap.values()].sort((a, b) =>
    a.studentName.localeCompare(b.studentName)
  );
  return { dates, students };
}

function parseMatrix(values: string[][]): AttendanceMatrix {
  const dateRow = values[1] ?? [];
  const dates: string[] = [];
  for (let col = DATE_START_COL; col < dateRow.length; col++) {
    const raw = String(dateRow[col] ?? "").trim();
    if (!raw) continue;
    dates.push(normalizeSheetDate(raw));
  }

  const students: MatrixStudent[] = [];
  for (let rowIdx = HEADER_ROWS; rowIdx < values.length; rowIdx++) {
    const row = values[rowIdx] ?? [];
    const studentName = String(row[NAME_COL] ?? "").trim();
    const srNo = String(row[SR_COL] ?? "").trim();
    if (!studentName) continue;

    const statuses = new Map<string, AttendanceStatus>();
    for (let col = DATE_START_COL; col < row.length; col++) {
      const dateIdx = col - DATE_START_COL;
      const date = dates[dateIdx];
      if (!date) continue;
      const status = parseAttendanceStatus(row[col] ?? "");
      if (status) statuses.set(date, status);
    }

    students.push({ studentName, srNo, statuses });
  }

  return { dates, students };
}

function matrixToAttendanceRows(matrix: AttendanceMatrix, className: string): AttendanceRow[] {
  const label = canonicalClassLabel(className);
  const rows: AttendanceRow[] = [];
  let rowId = HEADER_ROWS + 1;

  for (const student of matrix.students) {
    for (const date of matrix.dates) {
      const status = student.statuses.get(date);
      if (!status) continue;
      rows.push({
        rowId: String(rowId),
        date,
        studentName: student.studentName,
        srNo: student.srNo,
        status,
        teacherEmail: "",
        teacherName: "",
        submittedAt: "",
        className: label,
      });
    }
    rowId += 1;
  }

  return rows;
}

function matrixToSheetValues(matrix: AttendanceMatrix): string[][] {
  const colCount = DATE_START_COL + matrix.dates.length;
  const headerRow = Array.from({ length: colCount }, () => "");
  headerRow[NAME_COL] = MATRIX_HEADERS[0];
  headerRow[SR_COL] = MATRIX_HEADERS[1];
  headerRow[DATE_START_COL] = MATRIX_HEADERS[2];

  const dateRow = Array.from({ length: colCount }, () => "");
  for (let i = 0; i < matrix.dates.length; i++) {
    dateRow[DATE_START_COL + i] = matrix.dates[i];
  }

  const studentRows = matrix.students.map((student) => {
    const row = Array.from({ length: colCount }, () => "");
    row[NAME_COL] = student.studentName;
    row[SR_COL] = student.srNo;
    for (let i = 0; i < matrix.dates.length; i++) {
      const date = matrix.dates[i];
      const status = student.statuses.get(date);
      if (status) row[DATE_START_COL + i] = attendanceStatusLabel(status);
    }
    return row;
  });

  return [headerRow, dateRow, ...studentRows];
}

function colLetter(idx: number): string {
  let n = idx + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function readSheetValues(className: string): Promise<string[][]> {
  const title = await ensureClassAttendanceSheet(className);
  const sheets = getSheetsClient();
  const res = await withSheetRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: FEES_SHEET_ID,
      range: `'${title}'!A:ZZ`,
    })
  );
  return res.data.values ?? [];
}

async function writeMatrixToSheet(title: string, matrix: AttendanceMatrix): Promise<void> {
  const sheets = getSheetsClient();
  const values = matrixToSheetValues(matrix);
  const endCol = values[0]?.length ?? DATE_START_COL;
  const endRow = Math.max(values.length, HEADER_ROWS);

  await withSheetRetry(() =>
    sheets.spreadsheets.values.clear({
      spreadsheetId: FEES_SHEET_ID,
      range: `'${title}'!A:ZZ`,
    })
  );

  if (endCol > 0) {
    await withSheetRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: FEES_SHEET_ID,
        range: `'${title}'!A1:${colLetter(endCol - 1)}${endRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values },
      })
    );
  }
}

async function readMatrix(className: string): Promise<AttendanceMatrix> {
  const label = canonicalClassLabel(className);
  const values = await readSheetValues(label);
  if (values.length === 0 || (!isMatrixFormat(values) && !isOldLogFormat(values))) {
    return { dates: [], students: [] };
  }
  if (isOldLogFormat(values)) {
    const matrix = rowsToMatrix(parseOldLogRows(values, label));
    await writeMatrixToSheet(attendanceSheetTitle(label), matrix);
    return matrix;
  }
  return parseMatrix(values);
}

function upsertMatrixForDate(
  matrix: AttendanceMatrix,
  date: string,
  entries: AttendanceEntry[]
): AttendanceMatrix {
  const normalizedDate = normalizeSheetDate(date);
  const dates = [...matrix.dates];
  if (!dates.includes(normalizedDate)) {
    dates.push(normalizedDate);
    dates.sort();
  }

  const studentMap = new Map<string, MatrixStudent>();
  for (const student of matrix.students) {
    studentMap.set(studentRowKey(student.srNo, student.studentName), {
      studentName: student.studentName,
      srNo: student.srNo,
      statuses: new Map(student.statuses),
    });
  }

  for (const entry of entries) {
    const key = studentRowKey(entry.srNo, entry.studentName);
    const student =
      studentMap.get(key) ??
      ({
        studentName: entry.studentName,
        srNo: entry.srNo,
        statuses: new Map<string, AttendanceStatus>(),
      } satisfies MatrixStudent);
    student.statuses.set(normalizedDate, entry.status);
    studentMap.set(key, student);
  }

  const students = [...studentMap.values()].sort((a, b) =>
    a.studentName.localeCompare(b.studentName)
  );

  return { dates, students };
}

export async function readClassAttendance(className: string): Promise<AttendanceRow[]> {
  const label = canonicalClassLabel(className);
  const matrix = await readMatrix(label);
  return matrixToAttendanceRows(matrix, label);
}

export async function readAttendanceForDate(
  className: string,
  date: string
): Promise<AttendanceRow[]> {
  const normalized = normalizeSheetDate(date);
  const all = await readClassAttendance(className);
  return all.filter((r) => r.date === normalized);
}

export async function listAttendanceDaySummaries(
  className: string
): Promise<AttendanceDaySummary[]> {
  const label = canonicalClassLabel(className);
  const rows = await readClassAttendance(label);
  const auditByDate = await getLatestAttendanceAuditByClass(label);
  const byDate = new Map<string, AttendanceDaySummary>();

  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (!existing) {
      const audit = auditByDate.get(row.date);
      byDate.set(row.date, {
        date: row.date,
        className: label,
        present: row.status === "present" ? 1 : 0,
        absent: row.status === "absent" ? 1 : 0,
        total: 1,
        submittedAt: audit?.submittedAt ?? "",
        teacherName: audit?.teacherName ?? "",
      });
      continue;
    }
    existing.total += 1;
    if (row.status === "present") existing.present += 1;
    else existing.absent += 1;
  }

  for (const [date, summary] of byDate.entries()) {
    const audit = auditByDate.get(date);
    if (audit) {
      summary.submittedAt = audit.submittedAt;
      summary.teacherName = audit.teacherName;
    }
  }

  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveAttendanceForDate(
  className: string,
  date: string,
  entries: AttendanceEntry[],
  _teacher: { email: string; name: string }
): Promise<{ present: number; absent: number; total: number }> {
  const normalizedDate = normalizeSheetDate(date);
  const label = canonicalClassLabel(className);
  const title = await ensureClassAttendanceSheet(label);

  const current = await readMatrix(label);
  const next = upsertMatrixForDate(current, normalizedDate, entries);
  await writeMatrixToSheet(title, next);

  // A save changes what's marked — drop cached "marked" / "all rows" reads so
  // the next screen load reflects it immediately.
  invalidateSheetCache(CACHE_MARKED);
  invalidateSheetCache(CACHE_ALLROWS);

  const present = entries.filter((e) => e.status === "present").length;
  const absent = entries.filter((e) => e.status === "absent").length;

  await verifySheetWrite(async () => {
    const saved = await readAttendanceForDate(label, normalizedDate);
    if (saved.length !== entries.length) return false;
    for (const entry of entries) {
      const match = saved.find(
        (r) =>
          r.srNo === entry.srNo &&
          r.studentName === entry.studentName &&
          r.status === entry.status
      );
      if (!match) return false;
    }
    return true;
  }, `${label} attendance for ${normalizedDate}`);

  return { present, absent, total: entries.length };
}

/** Titles of every "Attendance · <class>" tab in the workbook (one metadata read). */
async function listAttendanceSheetTitles(): Promise<string[]> {
  const sheets = getSheetsClient();
  const meta = await withSheetRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID })
  );
  return (
    meta.data.sheets
      ?.map((s) => s.properties?.title ?? "")
      .filter((t) => isAttendanceSheetTitle(t)) ?? []
  );
}

/**
 * Parse raw sheet values into a matrix WITHOUT triggering a legacy-format
 * migration write. Used by bulk read paths where writing back during a read
 * burst would waste quota and risk write races.
 */
function valuesToMatrixReadOnly(values: string[][], className: string): AttendanceMatrix {
  if (values.length === 0) return { dates: [], students: [] };
  if (isOldLogFormat(values)) return rowsToMatrix(parseOldLogRows(values, className));
  if (isMatrixFormat(values)) return parseMatrix(values);
  return { dates: [], students: [] };
}

/** Read every attendance tab in ONE batchGet call (1 read request, not N). */
async function batchReadClassMatrices(
  titles: string[]
): Promise<{ title: string; className: string; matrix: AttendanceMatrix }[]> {
  if (titles.length === 0) return [];
  const sheets = getSheetsClient();
  const res = await withSheetRetry(() =>
    sheets.spreadsheets.values.batchGet({
      spreadsheetId: FEES_SHEET_ID,
      ranges: titles.map((t) => `'${t}'!A:ZZ`),
    })
  );
  const valueRanges = res.data.valueRanges ?? [];
  const out: { title: string; className: string; matrix: AttendanceMatrix }[] = [];
  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    const className = classNameFromSheetTitle(title);
    if (!className) continue;
    const values = (valueRanges[i]?.values ?? []) as string[][];
    out.push({ title, className, matrix: valuesToMatrixReadOnly(values, className) });
  }
  return out;
}

export async function readAllAttendanceRows(): Promise<AttendanceRow[]> {
  return cachedSheetRead(
    CACHE_ALLROWS,
    async () => {
      const titles = await listAttendanceSheetTitles();
      const matrices = await batchReadClassMatrices(titles);
      const all: AttendanceRow[] = [];
      for (const { className, matrix } of matrices) {
        all.push(...matrixToAttendanceRows(matrix, className));
      }
      return all;
    },
    20_000
  );
}

export async function getClassesMarkedForDate(date: string): Promise<string[]> {
  const normalizedDate = normalizeSheetDate(date);
  return cachedSheetRead(
    `${CACHE_MARKED}${normalizedDate}`,
    async () => {
      const titles = await listAttendanceSheetTitles();
      const matrices = await batchReadClassMatrices(titles);
      const marked: string[] = [];
      for (const { className, matrix } of matrices) {
        if (matrix.students.some((s) => s.statuses.has(normalizedDate))) {
          marked.push(canonicalClassLabel(className));
        }
      }
      return marked;
    },
    20_000
  );
}

export async function ensureAllAttendanceSheets(): Promise<void> {
  for (const cls of CLASS_OPTIONS) {
    await ensureClassAttendanceSheet(cls);
  }
}
