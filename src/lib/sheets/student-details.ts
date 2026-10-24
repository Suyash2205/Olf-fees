/**
 * Missing details (Student Records): read the merged view, and save the office's edits.
 *
 * A save writes only the cells that change: Admissions cells on the student's own row, and
 * Primary Phone on their `Parent Contacts` row (created if missing). One fresh read of each
 * tab inside the shared write lock, one values.batchUpdate, and one append for new contact
 * rows — never a whole-row rewrite, never a row insert or delete on Admissions.
 */
import { InputError } from "@/lib/input-error";
import { todayIsoInTimeZone } from "@/lib/attendance/daily-summary";
import { parseGrNoFromNotes } from "@/lib/admission-form";
import { buildDetailViews, changedCells, isMissingValue, validateDetailUpdates, type DetailUpdate, type DetailView } from "@/lib/student-records/details";
import { ADMISSION_HEADERS, ADMISSIONS_SHEET, getAllAdmissions } from "./admissions";
import { getAllFees } from "./fees";
import { FEES_SHEET_ID, getSheetsClient } from "./client";
import { columnLetter, ensureKeyedTab } from "./keyed-tab";
import { invalidatePortalCache } from "./invalidate-portal-cache";
import { getResolvedParentContacts, PARENT_CONTACT_HEADERS, PARENT_CONTACTS_SHEET } from "./parent-contacts";
import { cachedSheetRead } from "./read-cache";
import { withSheetRetry } from "./retry";
import { withSheetWriteLock } from "./sync-lock";
import { getAllUdise } from "./udise";

function quoted(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

export async function getStudentDetailViews(): Promise<DetailView[]> {
  const [fees, admissions, contacts, udise] = await Promise.all([
    getAllFees(),
    getAllAdmissions(),
    getResolvedParentContacts(),
    cachedSheetRead("udise:all", () => withSheetRetry(() => getAllUdise()), 20_000),
  ]);
  const udiseAadhaar = new Map<string, string>();
  for (const u of udise) {
    const gr = u.grNumber.trim().toLowerCase();
    if (gr && !isMissingValue(u.aadhaarNumber) && !udiseAadhaar.has(gr)) udiseAadhaar.set(gr, u.aadhaarNumber.trim());
  }
  return buildDetailViews(fees, admissions as unknown as Record<string, unknown>[], contacts, udiseAadhaar);
}

export interface DetailSaveResult {
  students: number;
  /** Cells overwritten in place (new Parent Contacts rows not counted). */
  cells: number;
  phonesAdded: number;
}

export async function saveStudentDetails(updates: DetailUpdate[], actorEmail: string): Promise<DetailSaveResult> {
  const checked = validateDetailUpdates(updates, todayIsoInTimeZone());
  if (!checked.ok) throw new InputError(checked.error);
  if (checked.value.length === 0) return { students: 0, cells: 0, phonesAdded: 0 };

  const fees = await getAllFees();
  const feeBySr = new Map(fees.map((f) => [String(f.srNo).trim(), f]));
  const plan = checked.value.map((u) => {
    const fee = feeBySr.get(u.srNo);
    if (!fee) throw new InputError(`Sr No ${u.srNo} is not an active student.`);
    const gr = parseGrNoFromNotes(fee.notes ?? "");
    const needsAdmission = Object.keys(u.values).some((k) => k !== "parentPhone");
    if (needsAdmission && !gr) throw new InputError(`Sr No ${u.srNo} has no GR number, so there is no admission record to fill. Use the Admissions page.`);
    return { ...u, fee, gr: gr ?? "" };
  });

  let result: DetailSaveResult = { students: 0, cells: 0, phonesAdded: 0 };
  await withSheetWriteLock(async () => {
    const sheets = getSheetsClient();
    const data: { range: string; values: string[][] }[] = [];
    const touched = new Set<string>();
    const now = new Date().toISOString();

    // --- Admissions: fresh read, locate each student's row by GR, write only changed cells ---
    const admPlan = plan.filter((p) => Object.keys(p.values).some((k) => k !== "parentPhone"));
    if (admPlan.length) {
      const endCol = columnLetter(ADMISSION_HEADERS.length - 1);
      const res = await withSheetRetry(() =>
        sheets.spreadsheets.values.get({ spreadsheetId: FEES_SHEET_ID, range: `${ADMISSIONS_SHEET}!A:${endCol}` })
      );
      const rows = (res.data.values ?? []) as unknown[][];
      const header = (rows[0] ?? []).map((v) => String(v ?? "").trim());
      const col = (h: string) => {
        const i = ADMISSION_HEADERS.indexOf(h as (typeof ADMISSION_HEADERS)[number]);
        // The Admissions code addresses columns by position; refuse if the sheet's header disagrees.
        if (i < 0 || header[i] !== h) throw new Error(`Admissions column "${h}" is not where expected; nothing was saved.`);
        return i;
      };
      const grCol = col("Gr No");
      const rowByGr = new Map<string, number>();
      const dupes = new Set<string>();
      for (let i = 1; i < rows.length; i++) {
        const k = String(rows[i]?.[grCol] ?? "").trim().toLowerCase();
        if (!k) continue;
        if (rowByGr.has(k)) dupes.add(k);
        else rowByGr.set(k, i);
      }
      for (const p of admPlan) {
        const k = p.gr.toLowerCase();
        if (dupes.has(k)) throw new InputError(`GR ${p.gr} appears on more than one Admissions row; fix that first. Nothing was saved.`);
        const idx = rowByGr.get(k);
        if (idx === undefined) throw new InputError(`Sr No ${p.srNo} (GR ${p.gr}) has no admission record. Use the Admissions page. Nothing was saved.`);
        const current = (h: string) => String(rows[idx]?.[col(h)] ?? "");
        const cells = changedCells(p.values, current);
        for (const [h, v] of Object.entries(cells)) {
          data.push({ range: `${ADMISSIONS_SHEET}!${columnLetter(col(h))}${idx + 1}`, values: [[v]] });
          touched.add(p.srNo);
        }
      }
    }

    // --- Parent Contacts: Primary Phone, row per Sr No, created when missing ---
    const phonePlan = plan.filter((p) => p.values.parentPhone);
    const newRows: string[][] = [];
    let phoneWrites = 0;
    if (phonePlan.length) {
      await ensureKeyedTab(PARENT_CONTACTS_SHEET, PARENT_CONTACT_HEADERS);
      const res = await withSheetRetry(() =>
        sheets.spreadsheets.values.get({ spreadsheetId: FEES_SHEET_ID, range: quoted(PARENT_CONTACTS_SHEET), valueRenderOption: "FORMATTED_VALUE" })
      );
      const rows = (res.data.values ?? []) as unknown[][];
      const header = (rows[0] ?? []).map((v) => String(v ?? "").trim());
      const col = (h: string) => {
        const i = header.indexOf(h);
        if (i < 0) throw new Error(`${PARENT_CONTACTS_SHEET} has no "${h}" column`);
        return i;
      };
      const srCol = col("Sr No");
      const rowBySr = new Map<string, number>();
      for (let i = 1; i < rows.length; i++) {
        const k = String(rows[i]?.[srCol] ?? "").trim();
        if (k && !rowBySr.has(k)) rowBySr.set(k, i);
      }
      for (const p of phonePlan) {
        const fields: Record<string, string> = {
          "Primary Phone": p.values.parentPhone,
          "Student Name": p.fee.studentName,
          Class: p.fee.className,
          "Updated At": now,
          "Updated By": actorEmail,
        };
        const idx = rowBySr.get(p.srNo);
        if (idx === undefined) {
          const row = header.map(() => "");
          row[srCol] = p.srNo;
          for (const [h, v] of Object.entries(fields)) row[col(h)] = v;
          newRows.push(row);
          touched.add(p.srNo);
          phoneWrites++;
          continue;
        }
        if (String(rows[idx]?.[col("Primary Phone")] ?? "").replace(/\D/g, "").endsWith(p.values.parentPhone)) continue;
        for (const [h, v] of Object.entries(fields)) {
          data.push({ range: `${quoted(PARENT_CONTACTS_SHEET)}!${columnLetter(col(h))}${idx + 1}`, values: [[v]] });
        }
        touched.add(p.srNo);
        phoneWrites++;
      }
    }

    // RAW: Aadhaar and phone numbers stay text (no 1.2E+11), and nothing typed becomes a formula.
    if (data.length) {
      await withSheetRetry(() =>
        sheets.spreadsheets.values.batchUpdate({ spreadsheetId: FEES_SHEET_ID, requestBody: { valueInputOption: "RAW", data } })
      );
    }
    if (newRows.length) {
      await withSheetRetry(() =>
        sheets.spreadsheets.values.append({
          spreadsheetId: FEES_SHEET_ID,
          range: `${quoted(PARENT_CONTACTS_SHEET)}!A1`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: newRows },
        })
      );
    }
    result = {
      students: touched.size,
      cells: data.length,
      phonesAdded: phoneWrites,
    };
  });
  invalidatePortalCache();
  return result;
}
