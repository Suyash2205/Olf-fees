/**
 * Student Records — pure logic (no I/O): tab shape, validation, UDISE applicability,
 * the merged per-student view, the two pending reports, and CSV building.
 *
 * Joins: fee row (Sr No) -> GR number in the fee notes -> Admissions row and UDISE row.
 * Never by name.
 */
import { parseGrNoFromNotes } from "@/lib/admission-form";
import { canonicalClassLabel } from "@/lib/fees/structure";
import { classSortIndex, sortByGradeThenName } from "@/lib/sort-by-grade";

export const STUDENT_RECORDS_SHEET = "Student Records";

export const STUDENT_RECORD_HEADERS = [
  "Sr No",
  "Student Name",
  "Class",
  "Height (cm)",
  "Weight (kg)",
  "Measured On",
  "UDISE Status",
  "UDISE Reason",
  "UDISE Note",
  "Updated At",
  "Updated By",
] as const;

export const UDISE_STATUSES = ["Updated", "Not updated"] as const;
export const UDISE_REASONS = [
  "Aadhaar missing",
  "Aadhaar name mismatch",
  "Documents pending",
  "Transfer/TC pending",
  "Other",
] as const;
export const NO_REASON_FILTER = "(no reason recorded)";

export const HEIGHT_RANGE = { min: 50, max: 220 } as const;
export const WEIGHT_RANGE = { min: 5, max: 150 } as const;
export const MAX_NOTE_LENGTH = 500;

const PRE_PRIMARY = new Set<string>(["P.G.", "Nursery", "Jr. Kg.", "Sr. Kg."]);

export function isPrePrimary(className: string): boolean {
  return PRE_PRIMARY.has(canonicalClassLabel(className));
}

/**
 * UDISE applies to 1st Std and above only. A class label we cannot recognise is treated as
 * applicable, so an odd label shows up in the pending report instead of vanishing from it.
 */
export function udiseApplies(className: string): boolean {
  return !isPrePrimary(className);
}

export const UDISE_NOT_APPLICABLE_TEXT = "Not applicable: pre-primary";

// ---------- validation ----------

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

function parseMeasure(raw: string, label: string, min: number, max: number, unit: string): Checked<string> {
  const t = String(raw ?? "").trim();
  if (t === "") return { ok: true, value: "" };
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, error: `${label} must be a number (${unit}).` };
  const n = Math.round(Number(t) * 10) / 10;
  if (n < min || n > max) {
    return { ok: false, error: `${label} must be between ${min} and ${max} ${unit} (got ${t}).` };
  }
  return { ok: true, value: String(n) };
}

export const validateHeight = (raw: string) =>
  parseMeasure(raw, "Height", HEIGHT_RANGE.min, HEIGHT_RANGE.max, "cm");
export const validateWeight = (raw: string) =>
  parseMeasure(raw, "Weight", WEIGHT_RANGE.min, WEIGHT_RANGE.max, "kg");

export function validateMeasuredOn(raw: string, todayIso: string): Checked<string> {
  const t = String(raw ?? "").trim();
  if (t === "") return { ok: true, value: "" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) !== t) {
    return { ok: false, error: `Measured On must be a valid date (got "${t}").` };
  }
  if (t > todayIso) return { ok: false, error: "Measured On cannot be in the future." };
  return { ok: true, value: t };
}

/** Editable fields, keyed by the API name. Only the keys present are changed. */
export interface StudentRecordFields {
  height?: string;
  weight?: string;
  measuredOn?: string;
  udiseStatus?: string;
  udiseReason?: string;
  udiseNote?: string;
}

const FIELD_HEADER: Record<keyof StudentRecordFields, (typeof STUDENT_RECORD_HEADERS)[number]> = {
  height: "Height (cm)",
  weight: "Weight (kg)",
  measuredOn: "Measured On",
  udiseStatus: "UDISE Status",
  udiseReason: "UDISE Reason",
  udiseNote: "UDISE Note",
};

/** Validate one student's edit; returns sheet-header -> value for only the supplied fields. */
export function validateRecordFields(
  fields: StudentRecordFields,
  ctx: { className: string; todayIso: string }
): Checked<Record<string, string>> {
  const out: Record<string, string> = {};
  const take = (key: keyof StudentRecordFields, c: Checked<string>) => {
    if (!c.ok) return c.error;
    out[FIELD_HEADER[key]] = c.value;
    return null;
  };
  let err: string | null = null;
  if (fields.height !== undefined) err ??= take("height", validateHeight(fields.height));
  if (fields.weight !== undefined) err ??= take("weight", validateWeight(fields.weight));
  if (fields.measuredOn !== undefined) err ??= take("measuredOn", validateMeasuredOn(fields.measuredOn, ctx.todayIso));

  const touchesUdise =
    fields.udiseStatus !== undefined || fields.udiseReason !== undefined || fields.udiseNote !== undefined;
  if (!err && touchesUdise) {
    const status = String(fields.udiseStatus ?? "").trim();
    const reason = String(fields.udiseReason ?? "").trim();
    const note = String(fields.udiseNote ?? "").trim();
    if (!udiseApplies(ctx.className)) {
      err = `UDISE status does not apply to ${canonicalClassLabel(ctx.className)} (${UDISE_NOT_APPLICABLE_TEXT}).`;
    } else if (status && !(UDISE_STATUSES as readonly string[]).includes(status)) {
      err = `UDISE Status must be one of: ${UDISE_STATUSES.join(", ")}.`;
    } else if (reason && !(UDISE_REASONS as readonly string[]).includes(reason)) {
      err = `UDISE Reason must be one of: ${UDISE_REASONS.join(", ")}.`;
    } else if (status === "Updated" && reason) {
      err = "A UDISE reason only applies when the status is Not updated.";
    } else if (note.length > MAX_NOTE_LENGTH) {
      err = `UDISE Note must be ${MAX_NOTE_LENGTH} characters or fewer.`;
    } else {
      if (fields.udiseStatus !== undefined) out[FIELD_HEADER.udiseStatus] = status;
      if (fields.udiseReason !== undefined) out[FIELD_HEADER.udiseReason] = reason;
      if (fields.udiseNote !== undefined) out[FIELD_HEADER.udiseNote] = note;
    }
  }
  return err ? { ok: false, error: err } : { ok: true, value: out };
}

// ---------- merged view ----------

export interface StudentRecordView {
  srNo: string;
  studentName: string;
  className: string;
  grNo: string;
  height: string;
  weight: string;
  measuredOn: string;
  udiseApplicable: boolean;
  udiseStatus: string;
  udiseReason: string;
  udiseNote: string;
  /** From the UDISE import tab, as a hint only. */
  udiseHeightHint: string;
  udiseWeightHint: string;
  penFound: boolean;
  hasAdmission: boolean;
  aadhaarMissingInAdmissions: boolean;
  aadhaarInUdiseImport: boolean;
}

export interface ViewFee {
  srNo: string;
  studentName: string;
  className: string;
  notes: string;
}
export interface ViewAdmission {
  grNo: string;
  aadhar: string;
}
export interface ViewUdise {
  grNumber: string;
  permanentEducationNumber: string;
  aadhaarNumber: string;
  heightCm: string;
  weightKg: string;
}
export interface ViewRecordRow {
  "Sr No": string;
  "Height (cm)": string;
  "Weight (kg)": string;
  "Measured On": string;
  "UDISE Status": string;
  "UDISE Reason": string;
  "UDISE Note": string;
}

const blankish = (v: string | undefined) => {
  const t = String(v ?? "").trim();
  return t === "" || t.toUpperCase() === "NA";
};

export function buildStudentRecordViews(
  fees: ViewFee[],
  admissions: ViewAdmission[],
  udise: ViewUdise[],
  records: ViewRecordRow[]
): StudentRecordView[] {
  const admByGr = new Map<string, ViewAdmission>();
  for (const a of admissions) {
    const k = a.grNo.trim().toLowerCase();
    if (k && !admByGr.has(k)) admByGr.set(k, a);
  }
  const udiseByGr = new Map<string, ViewUdise>();
  for (const u of udise) {
    const k = u.grNumber.trim().toLowerCase();
    if (k && !udiseByGr.has(k)) udiseByGr.set(k, u);
  }
  const recBySr = new Map<string, ViewRecordRow>();
  for (const r of records) {
    const k = r["Sr No"].trim();
    if (k && !recBySr.has(k)) recBySr.set(k, r);
  }

  const views = fees.map((f): StudentRecordView => {
    const srNo = String(f.srNo).trim();
    const gr = parseGrNoFromNotes(f.notes ?? "") ?? "";
    const adm = gr ? admByGr.get(gr.toLowerCase()) : undefined;
    const u = gr ? udiseByGr.get(gr.toLowerCase()) : undefined;
    const rec = recBySr.get(srNo);
    const className = canonicalClassLabel(f.className);
    return {
      srNo,
      studentName: f.studentName,
      className,
      grNo: gr,
      height: rec?.["Height (cm)"] ?? "",
      weight: rec?.["Weight (kg)"] ?? "",
      measuredOn: rec?.["Measured On"] ?? "",
      udiseApplicable: udiseApplies(className),
      udiseStatus: rec?.["UDISE Status"] ?? "",
      udiseReason: rec?.["UDISE Reason"] ?? "",
      udiseNote: rec?.["UDISE Note"] ?? "",
      udiseHeightHint: blankish(u?.heightCm) ? "" : String(u?.heightCm).trim(),
      udiseWeightHint: blankish(u?.weightKg) ? "" : String(u?.weightKg).trim(),
      penFound: !!u && !blankish(u.permanentEducationNumber),
      hasAdmission: !!adm,
      aadhaarMissingInAdmissions: !!adm && String(adm.aadhar ?? "").trim() === "",
      aadhaarInUdiseImport: !!u && !blankish(u.aadhaarNumber),
    };
  });
  return sortByGradeThenName(views, (v) => v.className, (v) => v.studentName);
}

// ---------- reports ----------

/** 1st Std+ students whose UDISE status is not "Updated", sorted by class. Optionally one reason. */
export function udisePendingList(views: StudentRecordView[], reason?: string): StudentRecordView[] {
  return views.filter((v) => {
    if (!v.udiseApplicable || v.udiseStatus === "Updated") return false;
    if (!reason) return true;
    return reason === NO_REASON_FILTER ? v.udiseReason === "" : v.udiseReason === reason;
  });
}

export interface AadhaarPendingRow {
  className: string;
  srNo: string;
  studentName: string;
  grNo: string;
  statusNote: string;
}

/** Active students with a blank Aadhaar in Admissions, plus students with no admission row. */
export function aadhaarPendingList(views: StudentRecordView[]): AadhaarPendingRow[] {
  const out: AadhaarPendingRow[] = [];
  for (const v of views) {
    let note: string | null = null;
    if (!v.hasAdmission) {
      note = v.grNo
        ? `No admission row found for ${v.grNo}`
        : "No admission row (no GR number in fee notes)";
    } else if (v.aadhaarMissingInAdmissions) {
      note = "Aadhaar blank in Admissions";
    }
    if (!note) continue;
    if (v.aadhaarInUdiseImport) note += " · Aadhaar present in UDISE import (copy it over)";
    out.push({ className: v.className, srNo: v.srNo, studentName: v.studentName, grNo: v.grNo, statusNote: note });
  }
  return out.sort((a, b) => classSortIndex(a.className) - classSortIndex(b.className));
}

export function udiseHintText(v: Pick<StudentRecordView, "penFound">): string {
  return v.penFound ? "PEN found in UDISE import" : "";
}

// ---------- CSV ----------

/** Escape one CSV cell; neutralise spreadsheet formulas (=, +, -, @) so opened files cannot run them. */
export function csvCell(value: string | number | null | undefined): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function udisePendingCsv(rows: StudentRecordView[]): string {
  return toCsv(
    ["Class", "Sr No", "Name", "GR No", "UDISE Status", "Reason", "Note", "PEN in UDISE import"],
    rows.map((v) => [
      v.className,
      v.srNo,
      v.studentName,
      v.grNo,
      v.udiseStatus || "Not updated",
      v.udiseReason,
      v.udiseNote,
      v.penFound ? "Yes" : "",
    ])
  );
}

export function aadhaarPendingCsv(rows: AadhaarPendingRow[]): string {
  return toCsv(
    ["Class", "Sr No", "Name", "GR No", "Status"],
    rows.map((r) => [r.className, r.srNo, r.studentName, r.grNo, r.statusNote])
  );
}

export function measurementsCsv(views: StudentRecordView[]): string {
  return toCsv(
    ["Class", "Sr No", "Name", "Height (cm)", "Weight (kg)", "Measured On"],
    views.map((v) => [v.className, v.srNo, v.studentName, v.height, v.weight, v.measuredOn])
  );
}
