import type { AdmissionRecord } from "@/lib/sheets/admissions";
import type { FeeRecord } from "@/lib/sheets/fees";
import type { DiscountType } from "@/lib/fees/structure";
import { buildFullName, normalizeStudentName } from "@/lib/admission-utils";

export type AdmissionFormValues = {
  formNo: string;
  admissionDate: string;
  medium: string;
  photoUrl: string;
  surname: string;
  firstName: string;
  fatherName: string;
  motherName: string;
  standard: string;
  dob: string;
  placeOfBirth: string;
  sex: string;
  state: string;
  studentContact: string;
  ageYears: string;
  ageMonths: string;
  aadhar: string;
  religion: string;
  caste: string;
  subCaste: string;
  nationality: string;
  bloodGroup: string;
  motherTongue: string;
  residentialAddress: string;
  lastSchool: string;
  reasonLeaving: string;
  residesWith: string;
  fatherSurname: string;
  fatherFirstName: string;
  fatherMiddleName: string;
  fatherEducation: string;
  fatherOccupation: string;
  fatherContact: string;
  motherSurname: string;
  motherFirstName: string;
  motherMiddleName: string;
  motherEducation: string;
  motherOccupation: string;
  motherContact: string;
  email: string;
  discountType: DiscountType;
  discountValue: string;
};

export const EMPTY_ADMISSION_FORM: AdmissionFormValues = {
  formNo: "",
  admissionDate: new Date().toISOString().slice(0, 10),
  medium: "English",
  photoUrl: "",
  surname: "",
  firstName: "",
  fatherName: "",
  motherName: "",
  standard: "",
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
  discountType: "none",
  discountValue: "",
};

export function parseGrNoFromNotes(notes: string): string | null {
  const m = notes.match(/GR:\s*(GR-\d{4}-\d+)/i);
  return m ? m[1] : null;
}

/** Keep STATUS / other note text; set or replace GR number. */
export function upsertGrInNotes(notes: string, grNo: string): string {
  const base = notes.replace(/GR:\s*GR-\d{4}-\d+/gi, "").trim();
  const grPart = `GR: ${grNo}`;
  return base ? `${base} ${grPart}` : grPart;
}

/** Split fee-sheet full name into form fields (First Father Surname). */
export function splitFullNameToForm(fullName: string): Pick<
  AdmissionFormValues,
  "firstName" | "fatherName" | "surname"
> {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", fatherName: "", surname: "" };
  if (parts.length === 1) return { firstName: parts[0], fatherName: "", surname: "" };
  return {
    firstName: parts[0],
    fatherName: parts.slice(1, -1).join(" "),
    surname: parts[parts.length - 1],
  };
}

export function admissionToFormValues(a: AdmissionRecord): AdmissionFormValues {
  let discountType: DiscountType = "none";
  let discountValue = "";
  if (a.discount > 0 && a.annualFee > 0) {
    const base = a.annualFee + a.discount;
    const pct = Math.round((a.discount / base) * 100);
    if (pct > 0 && pct <= 100 && Math.abs(a.discount - Math.round((base * pct) / 100)) < 2) {
      discountType = "percent";
      discountValue = String(pct);
    } else {
      discountType = "amount";
      discountValue = String(a.discount);
    }
  }

  return {
    ...EMPTY_ADMISSION_FORM,
    formNo: a.formNo,
    admissionDate: a.admissionDate,
    medium: a.medium,
    photoUrl: a.photoUrl,
    surname: a.surname,
    firstName: a.firstName,
    fatherName: a.fatherName,
    motherName: a.motherName,
    standard: a.standard,
    dob: a.dob,
    placeOfBirth: a.placeOfBirth,
    sex: a.sex,
    state: a.state,
    studentContact: a.studentContact,
    ageYears: a.ageYears,
    ageMonths: a.ageMonths,
    aadhar: a.aadhar,
    religion: a.religion,
    caste: a.caste,
    subCaste: a.subCaste,
    nationality: a.nationality,
    bloodGroup: a.bloodGroup,
    motherTongue: a.motherTongue,
    residentialAddress: a.residentialAddress,
    lastSchool: a.lastSchool,
    reasonLeaving: a.reasonLeaving,
    residesWith: a.residesWith,
    fatherSurname: a.fatherSurname,
    fatherFirstName: a.fatherFirstName,
    fatherMiddleName: a.fatherMiddleName,
    fatherEducation: a.fatherEducation,
    fatherOccupation: a.fatherOccupation,
    fatherContact: a.fatherContact,
    motherSurname: a.motherSurname,
    motherFirstName: a.motherFirstName,
    motherMiddleName: a.motherMiddleName,
    motherEducation: a.motherEducation,
    motherOccupation: a.motherOccupation,
    motherContact: a.motherContact,
    email: a.email,
    discountType,
    discountValue,
  };
}

export function feeToFormDefaults(fee: FeeRecord): AdmissionFormValues {
  const nameParts = splitFullNameToForm(fee.studentName);
  return {
    ...EMPTY_ADMISSION_FORM,
    ...nameParts,
    standard: fee.className,
    discountType: fee.discount > 0 ? "amount" : "none",
    discountValue: fee.discount > 0 ? String(fee.discount) : "",
  };
}

export function findAdmissionByStudentName(
  admissions: AdmissionRecord[],
  studentName: string
): AdmissionRecord | null {
  const norm = normalizeStudentName(studentName);
  return (
    admissions.find((a) => normalizeStudentName(a.fullName) === norm) ?? null
  );
}

export function formValuesToFullName(form: AdmissionFormValues): string {
  return buildFullName({
    surname: form.surname,
    firstName: form.firstName,
    fatherName: form.fatherName,
  });
}
