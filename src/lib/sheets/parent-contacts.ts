/**
 * Parent phone numbers, keyed by Sr No (the fee-sheet identity).
 *
 * Source of truth, in order:
 *   1. `Parent Contacts` tab — numbers the office entered or corrected in the portal.
 *   2. `Admissions` Father/Mother Contact, reached via the GR number in the fee Notes.
 * Never matched by student name (duplicate names exist — see 0b89df8).
 */
import type { AdmissionRecord } from "./admissions";
import { getAllAdmissions } from "./admissions";
import type { FeeRecord } from "./fees";
import { getAllFees } from "./fees";
import { appendKeyedRow, readKeyedTab, updateKeyedRow, type TabRow } from "./keyed-tab";
import { parseGrNoFromNotes } from "@/lib/admission-form";

export const PARENT_CONTACTS_SHEET = "Parent Contacts";

export const PARENT_CONTACT_HEADERS = [
  "Sr No",
  "Student Name",
  "Class",
  "Parent Name",
  "Primary Phone",
  "Alternate Phone",
  "Notes",
  "Updated At",
  "Updated By",
] as const;

export type ParentContactRow = TabRow<(typeof PARENT_CONTACT_HEADERS)[number]>;

/** Every Indian mobile written in a free-text cell, normalised, in order. */
export function extractIndianMobiles(raw: string): string[] {
  const found = String(raw ?? "").match(/(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g) ?? [];
  return [...new Set(found.map((m) => normalizeIndianMobile(m)).filter((n): n is string => !!n))];
}

/** Indian mobile → 10 digits, or null. Accepts +91 / 0 prefixes, spaces, dashes. */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export interface ResolvedParentContact {
  srNo: string;
  parentName: string;
  /** Distinct valid 10-digit numbers, primary first. */
  phones: string[];
  source: "portal" | "admissions" | "none";
  /** Raw values present but not valid mobiles — shown so staff can fix them. */
  invalidRaw: string[];
}

function uniq(list: string[]): string[] {
  return [...new Set(list)];
}

/** Pure: resolve contacts for fee rows from portal overrides + admissions. */
export function resolveParentContacts(
  fees: Pick<FeeRecord, "srNo" | "notes">[],
  admissions: Pick<AdmissionRecord, "grNo" | "fatherName" | "motherName" | "fatherContact" | "motherContact">[],
  overrides: Pick<ParentContactRow, "Sr No" | "Parent Name" | "Primary Phone" | "Alternate Phone">[]
): Map<string, ResolvedParentContact> {
  const admissionByGr = new Map(admissions.map((a) => [a.grNo.trim().toLowerCase(), a]));
  const overrideBySr = new Map(overrides.map((o) => [o["Sr No"].trim(), o]));
  const out = new Map<string, ResolvedParentContact>();

  for (const fee of fees) {
    const srNo = String(fee.srNo).trim();
    const gr = parseGrNoFromNotes(fee.notes ?? "");
    const adm = gr ? admissionByGr.get(gr.toLowerCase()) : undefined;
    const ov = overrideBySr.get(srNo);
    const invalidRaw: string[] = [];

    const check = (raw: string | undefined): (string | null)[] => {
      const v = String(raw ?? "").trim();
      if (!v) return [];
      const n = normalizeIndianMobile(v);
      if (n) return [n];
      // One cell sometimes holds two numbers ("98xxxxxxxx / 70xxxxxxxx"); use each valid one.
      const many = extractIndianMobiles(v);
      if (!many.length) invalidRaw.push(v);
      return many;
    };

    const ovPhones = ov ? [...check(ov["Primary Phone"]), ...check(ov["Alternate Phone"])] : [];
    const admPhones = adm ? [...check(adm.fatherContact), ...check(adm.motherContact)] : [];
    const portalValid = ovPhones.filter((p): p is string => !!p);
    const admValid = admPhones.filter((p): p is string => !!p);

    const phones = uniq([...portalValid, ...admValid]);
    const admName = adm ? [adm.fatherName, adm.motherName].map((s) => s?.trim()).filter(Boolean).join(" / ") : "";
    out.set(srNo, {
      srNo,
      parentName: ov?.["Parent Name"]?.trim() || admName,
      phones,
      source: portalValid.length ? "portal" : admValid.length ? "admissions" : "none",
      invalidRaw,
    });
  }
  return out;
}

export async function readParentContacts(): Promise<ParentContactRow[]> {
  return readKeyedTab(PARENT_CONTACTS_SHEET, PARENT_CONTACT_HEADERS, 20_000);
}

/** Contacts for every active student, keyed by Sr No. */
export async function getResolvedParentContacts(): Promise<Map<string, ResolvedParentContact>> {
  const [fees, admissions, overrides] = await Promise.all([
    getAllFees(),
    getAllAdmissions(),
    readParentContacts(),
  ]);
  return resolveParentContacts(fees, admissions, overrides);
}

export interface ParentContactInput {
  srNo: string;
  studentName: string;
  className: string;
  parentName?: string;
  primaryPhone?: string;
  alternatePhone?: string;
  notes?: string;
}

/** Create or update the Parent Contacts row for one student. Phones are validated. */
export async function upsertParentContact(input: ParentContactInput, actorEmail: string): Promise<void> {
  const srNo = input.srNo.trim();
  if (!srNo) throw new Error("Sr No is required.");
  const fields: Record<string, string> = {
    "Student Name": input.studentName,
    Class: input.className,
    "Updated At": new Date().toISOString(),
    "Updated By": actorEmail,
  };
  for (const [key, header] of [
    ["primaryPhone", "Primary Phone"],
    ["alternatePhone", "Alternate Phone"],
  ] as const) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (raw.trim() === "") {
      fields[header] = "";
      continue;
    }
    const n = normalizeIndianMobile(raw);
    if (!n) throw new Error(`"${raw}" is not a valid 10-digit mobile number.`);
    fields[header] = n;
  }
  if (input.parentName !== undefined) fields["Parent Name"] = input.parentName.trim();
  if (input.notes !== undefined) fields.Notes = input.notes.trim();

  const existing = (await readParentContacts()).find((r) => r["Sr No"] === srNo);
  if (existing) {
    await updateKeyedRow(PARENT_CONTACTS_SHEET, PARENT_CONTACT_HEADERS, existing.sheetRow, fields, {
      header: "Sr No",
      value: srNo,
    });
  } else {
    await appendKeyedRow(PARENT_CONTACTS_SHEET, PARENT_CONTACT_HEADERS, { "Sr No": srNo, ...fields });
  }
}
