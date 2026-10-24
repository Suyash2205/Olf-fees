/**
 * Missing details — pure logic (no I/O): which admission fields the office can fill in from
 * Student Records, how a value is validated, and which students are missing what.
 *
 * Parent WhatsApp number goes to the `Parent Contacts` tab (what the bot and follow-ups read
 * first); every other field is a cell on the student's `Admissions` row.
 * Joins: fee row (Sr No) -> GR number in the fee notes -> Admissions row. Never by name.
 *
 * This screen only fills and corrects: it never blanks a value that is already there
 * (clearing stays on the full admission form, where the whole record is visible).
 */
import { parseGrNoFromNotes } from "@/lib/admission-form";
import { canonicalClassLabel } from "@/lib/fees/structure";
import { sortByGradeThenName } from "@/lib/sort-by-grade";
import type { Checked } from "./records";

export type DetailGroup = "contact" | "personal" | "parents" | "admission";

export const DETAIL_GROUPS: { id: DetailGroup; label: string }[] = [
  { id: "contact", label: "Phone & address" },
  { id: "personal", label: "Personal" },
  { id: "parents", label: "Parents" },
  { id: "admission", label: "Admission" },
];

type Kind = "phone" | "aadhaar" | "date" | "select" | "text";

export interface DetailField {
  key: string;
  label: string;
  group: DetailGroup;
  kind: Kind;
  /** Admissions column; absent for the parent phone (Parent Contacts tab). The key is the AdmissionRecord property. */
  header?: string;
  options?: readonly string[];
  max?: number;
}

export const SEX_OPTIONS = ["Male", "Female"] as const;
export const RESIDES_WITH_OPTIONS = ["Father & Mother", "Mother", "Father", "Guardian"] as const;

export const DETAIL_FIELDS: readonly DetailField[] = [
  { key: "parentPhone", label: "Parent WhatsApp no.", group: "contact", kind: "phone" },
  { key: "residentialAddress", label: "Address", group: "contact", kind: "text", header: "Residential Address", max: 300 },
  { key: "dob", label: "Date of birth", group: "personal", kind: "date", header: "DOB" },
  { key: "sex", label: "Gender", group: "personal", kind: "select", header: "Sex", options: SEX_OPTIONS },
  { key: "aadhar", label: "Aadhaar no.", group: "personal", kind: "aadhaar", header: "Aadhar" },
  { key: "placeOfBirth", label: "Place of birth", group: "personal", kind: "text", header: "Place of Birth" },
  { key: "state", label: "State", group: "personal", kind: "text", header: "State" },
  { key: "religion", label: "Religion", group: "personal", kind: "text", header: "Religion" },
  { key: "caste", label: "Caste", group: "personal", kind: "text", header: "Caste" },
  { key: "motherTongue", label: "Mother tongue", group: "personal", kind: "text", header: "Mother Tongue" },
  { key: "bloodGroup", label: "Blood group", group: "personal", kind: "text", header: "Blood Group", max: 10 },
  { key: "fatherName", label: "Father name", group: "parents", kind: "text", header: "Father Name" },
  { key: "motherName", label: "Mother name", group: "parents", kind: "text", header: "Mother Name" },
  { key: "fatherOccupation", label: "Father occupation", group: "parents", kind: "text", header: "Father Occupation" },
  { key: "motherOccupation", label: "Mother occupation", group: "parents", kind: "text", header: "Mother Occupation" },
  { key: "residesWith", label: "Resides with", group: "parents", kind: "select", header: "Resides With", options: RESIDES_WITH_OPTIONS },
  { key: "admissionDate", label: "Admission date", group: "admission", kind: "date", header: "Admission Date" },
  { key: "lastSchool", label: "Last school", group: "admission", kind: "text", header: "Last School" },
];

const FIELD_BY_KEY = new Map(DETAIL_FIELDS.map((f) => [f.key, f]));

export function detailField(key: string): DetailField | undefined {
  return FIELD_BY_KEY.get(key);
}

/** Blank, or a placeholder someone typed instead of leaving it blank. */
export function isMissingValue(v: string | undefined | null): boolean {
  const t = String(v ?? "").trim();
  return t === "" || t === "-" || t === "--" || t.toUpperCase() === "NA" || t.toUpperCase() === "N/A";
}

/** Indian mobile → 10 digits, or null (same rule as Parent Contacts). */
export function normalizeMobile(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

function validDate(t: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;
}

/** Validate one submitted value. "" means "no value given" and is returned as "". */
export function validateDetail(field: DetailField, raw: string, todayIso: string): Checked<string> {
  const t = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (t === "") return { ok: true, value: "" };
  switch (field.kind) {
    case "phone": {
      const n = normalizeMobile(t);
      return n ? { ok: true, value: n } : { ok: false, error: `${field.label} "${t}" is not a valid 10-digit mobile number.` };
    }
    case "aadhaar": {
      const d = t.replace(/[\s-]/g, "");
      return /^[2-9]\d{11}$/.test(d) ? { ok: true, value: d } : { ok: false, error: `Aadhaar "${t}" must be 12 digits.` };
    }
    case "date": {
      if (!validDate(t)) return { ok: false, error: `${field.label} must be a valid date.` };
      if (t > todayIso) return { ok: false, error: `${field.label} cannot be in the future.` };
      if (t < "1990-01-01") return { ok: false, error: `${field.label} looks wrong (${t}).` };
      return { ok: true, value: t };
    }
    case "select": {
      const hit = field.options?.find((o) => o.toLowerCase() === t.toLowerCase());
      return hit ? { ok: true, value: hit } : { ok: false, error: `${field.label} must be one of: ${field.options?.join(", ")}.` };
    }
    case "text": {
      // Written RAW, but a leading = + - @ would still turn into a formula if someone retyped it in the sheet.
      if (/^[=+@]/.test(t)) return { ok: false, error: `${field.label} cannot start with "${t[0]}".` };
      const max = field.max ?? 100;
      return t.length <= max ? { ok: true, value: t } : { ok: false, error: `${field.label} is too long (max ${max} characters).` };
    }
  }
}

// ---------- view ----------

export interface DetailView {
  srNo: string;
  studentName: string;
  className: string;
  grNo: string;
  /** Current value per field key ("" when missing). */
  values: Record<string, string>;
  missing: string[];
  /** Numbers on file that are not valid mobiles, so staff can see what to fix. */
  invalidPhones: string[];
  /** Aadhaar in the UDISE import when Admissions has none — a hint to copy over. */
  udiseAadhaar: string;
}

export interface DetailFee {
  srNo: string;
  studentName: string;
  className: string;
  notes: string;
}

export interface DetailContact {
  phones: string[];
  invalidRaw: string[];
}

export function buildDetailViews(
  fees: DetailFee[],
  admissions: Record<string, unknown>[],
  contacts: Map<string, DetailContact>,
  udiseAadhaarByGr: Map<string, string> = new Map()
): DetailView[] {
  const admByGr = new Map<string, Record<string, unknown>>();
  for (const a of admissions) {
    const k = String(a.grNo ?? "").trim().toLowerCase();
    if (k && !admByGr.has(k)) admByGr.set(k, a);
  }
  const views = fees.map((f): DetailView => {
    const srNo = String(f.srNo).trim();
    const gr = parseGrNoFromNotes(f.notes ?? "") ?? "";
    const adm = gr ? admByGr.get(gr.toLowerCase()) : undefined;
    const c = contacts.get(srNo);
    const values: Record<string, string> = {};
    const missing: string[] = [];
    for (const field of DETAIL_FIELDS) {
      const v = field.kind === "phone" ? c?.phones[0] ?? "" : adm && field.header ? String(adm[field.key] ?? "") : "";
      values[field.key] = isMissingValue(v) ? "" : v.trim();
      if (isMissingValue(v)) missing.push(field.key);
    }
    return {
      srNo,
      studentName: f.studentName.trim(),
      className: canonicalClassLabel(f.className),
      grNo: gr,
      values,
      missing,
      invalidPhones: c?.invalidRaw ?? [],
      udiseAadhaar: values.aadhar ? "" : udiseAadhaarByGr.get(gr.toLowerCase()) ?? "",
    };
  });
  return sortByGradeThenName(views, (v) => v.className, (v) => v.studentName);
}

// ---------- save planning ----------

export interface DetailUpdate {
  srNo: string;
  fields: Record<string, string>;
}

/**
 * Validate a batch before anything is written. All-or-nothing: the first problem is returned
 * with the student's Sr No. Empty values are dropped (they mean "left blank").
 */
export function validateDetailUpdates(updates: DetailUpdate[], todayIso: string): Checked<{ srNo: string; values: Record<string, string> }[]> {
  if (updates.length === 0) return { ok: false, error: "Nothing to save." };
  if (updates.length > 100) return { ok: false, error: "Too many students in one save (max 100)." };
  const seen = new Set<string>();
  const out: { srNo: string; values: Record<string, string> }[] = [];
  for (const u of updates) {
    const srNo = String(u.srNo ?? "").trim();
    if (!srNo) return { ok: false, error: "A row has no Sr No." };
    if (seen.has(srNo)) return { ok: false, error: `Sr No ${srNo} appears twice in one save.` };
    seen.add(srNo);
    const values: Record<string, string> = {};
    for (const [key, raw] of Object.entries(u.fields ?? {})) {
      const field = detailField(key);
      if (!field) return { ok: false, error: `Unknown field "${key}".` };
      const c = validateDetail(field, String(raw ?? ""), todayIso);
      if (!c.ok) return { ok: false, error: `Sr No ${srNo}: ${c.error}` };
      if (c.value !== "") values[key] = c.value;
    }
    if (Object.keys(values).length) out.push({ srNo, values });
  }
  return { ok: true, value: out };
}

/** The cells that actually change for one student, given what the sheet holds right now. */
export function changedCells(values: Record<string, string>, current: (header: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(values)) {
    const field = detailField(key);
    if (!field?.header) continue;
    if (String(current(field.header) ?? "").trim() !== v) out[field.header] = v;
  }
  return out;
}
