/**
 * `Student Records` tab (portal-owned, keyed by Sr No): height / weight / UDISE status.
 * Reads are cached; writes go through one values.batchUpdate (existing rows) plus one
 * values.append (brand-new rows), inside the shared sheet write lock. Never touches any
 * other tab, and never inserts/deletes rows or columns.
 */
import {
  STUDENT_RECORD_HEADERS,
  STUDENT_RECORDS_SHEET,
  buildStudentRecordViews,
  validateRecordFields,
  type StudentRecordFields,
  type StudentRecordView,
} from "@/lib/student-records/records";
import { InputError } from "@/lib/input-error";
import { todayIsoInTimeZone } from "@/lib/attendance/daily-summary";
import { getAllAdmissions } from "./admissions";
import { getAllFees } from "./fees";
import { FEES_SHEET_ID, getSheetsClient } from "./client";
import { columnLetter, ensureKeyedTab, readKeyedTab } from "./keyed-tab";
import { cachedSheetRead, invalidateSheetCache } from "./read-cache";
import { withSheetRetry } from "./retry";
import { withSheetWriteLock } from "./sync-lock";
import { getAllUdise } from "./udise";

const TAB_CACHE_KEY = `keyed-tab:${STUDENT_RECORDS_SHEET}`;

function quoted(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

export async function readStudentRecordRows() {
  return readKeyedTab(STUDENT_RECORDS_SHEET, STUDENT_RECORD_HEADERS, 20_000);
}

/** UDISE import tab, cached + retried (getAllUdise itself does neither). */
async function readUdiseCached() {
  return cachedSheetRead("udise:all", () => withSheetRetry(() => getAllUdise()), 20_000);
}

/** One merged view per active student: records tab + fees + admissions + UDISE hints. */
export async function getStudentRecordViews(): Promise<StudentRecordView[]> {
  const [fees, admissions, udise, records] = await Promise.all([
    getAllFees(),
    getAllAdmissions(),
    readUdiseCached(),
    readStudentRecordRows(),
  ]);
  return buildStudentRecordViews(fees, admissions, udise, records);
}

export interface StudentRecordUpdate {
  srNo: string;
  fields: StudentRecordFields;
}

export interface SaveResult {
  saved: number;
  unchanged: number;
  created: number;
}

/**
 * Validate and save a batch of edits. All-or-nothing on validation: if any row is invalid,
 * nothing is written and the error names the student's Sr No.
 */
export async function saveStudentRecords(
  updates: StudentRecordUpdate[],
  actorEmail: string
): Promise<SaveResult> {
  if (updates.length === 0) throw new InputError("Nothing to save.");
  if (updates.length > 200) throw new InputError("Too many rows in one save (max 200).");

  const fees = await getAllFees();
  const feeBySr = new Map(fees.map((f) => [String(f.srNo).trim(), f]));
  const todayIso = todayIsoInTimeZone();

  const clean: { srNo: string; studentName: string; className: string; values: Record<string, string> }[] = [];
  const seen = new Set<string>();
  for (const u of updates) {
    const srNo = String(u.srNo ?? "").trim();
    const fee = feeBySr.get(srNo);
    if (!fee) throw new InputError(`Sr No ${srNo || "(blank)"} is not an active student.`);
    if (seen.has(srNo)) throw new InputError(`Sr No ${srNo} appears twice in one save.`);
    seen.add(srNo);
    const checked = validateRecordFields(u.fields ?? {}, { className: fee.className, todayIso });
    if (!checked.ok) throw new InputError(`Sr No ${srNo}: ${checked.error}`);
    if (Object.keys(checked.value).length === 0) continue;
    clean.push({ srNo, studentName: fee.studentName, className: fee.className, values: checked.value });
  }
  if (clean.length === 0) return { saved: 0, unchanged: updates.length, created: 0 };

  let result: SaveResult = { saved: 0, unchanged: 0, created: 0 };
  await withSheetWriteLock(async () => {
    await ensureKeyedTab(STUDENT_RECORDS_SHEET, STUDENT_RECORD_HEADERS);
    const sheets = getSheetsClient();
    // Fresh read inside the lock so two quick saves can never both "create" the same Sr No.
    const res = await withSheetRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: FEES_SHEET_ID,
        range: quoted(STUDENT_RECORDS_SHEET),
        valueRenderOption: "FORMATTED_VALUE",
      })
    );
    const values = (res.data.values ?? []) as unknown[][];
    const headerRow = (values[0] ?? []).map((v) => String(v ?? "").trim());
    const col = (h: string) => {
      const i = headerRow.indexOf(h);
      if (i < 0) throw new Error(`${STUDENT_RECORDS_SHEET} has no "${h}" column`);
      return i;
    };
    const srCol = col("Sr No");
    const rowBySr = new Map<string, number>(); // sr -> 0-based index in `values`
    for (let i = 1; i < values.length; i++) {
      const k = String(values[i]?.[srCol] ?? "").trim();
      if (k && !rowBySr.has(k)) rowBySr.set(k, i);
    }

    const now = new Date().toISOString();
    const data: { range: string; values: string[][] }[] = [];
    const newRows: string[][] = [];
    let unchanged = 0;

    for (const c of clean) {
      const stamped: Record<string, string> = {
        ...c.values,
        "Student Name": c.studentName,
        Class: c.className,
      };
      const idx = rowBySr.get(c.srNo);
      if (idx === undefined) {
        const row = headerRow.map(() => "");
        row[srCol] = c.srNo;
        for (const [h, v] of Object.entries({ ...stamped, "Updated At": now, "Updated By": actorEmail })) {
          row[col(h)] = v;
        }
        newRows.push(row);
        continue;
      }
      const current = values[idx] ?? [];
      const changed = Object.entries(c.values).filter(
        ([h, v]) => String(current[col(h)] ?? "").trim() !== v
      );
      if (changed.length === 0) {
        unchanged++;
        continue;
      }
      for (const [h, v] of Object.entries({ ...stamped, "Updated At": now, "Updated By": actorEmail })) {
        data.push({
          range: `${quoted(STUDENT_RECORDS_SHEET)}!${columnLetter(col(h))}${idx + 1}`,
          values: [[v]],
        });
      }
    }

    if (data.length > 0) {
      await withSheetRetry(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: FEES_SHEET_ID,
          requestBody: { valueInputOption: "RAW", data },
        })
      );
    }
    if (newRows.length > 0) {
      await withSheetRetry(() =>
        sheets.spreadsheets.values.append({
          spreadsheetId: FEES_SHEET_ID,
          range: `${quoted(STUDENT_RECORDS_SHEET)}!A1`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: newRows },
        })
      );
    }
    result = {
      saved: clean.length - unchanged,
      unchanged: unchanged + (updates.length - clean.length),
      created: newRows.length,
    };
  });
  invalidateSheetCache(TAB_CACHE_KEY);
  return result;
}
