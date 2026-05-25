import { computeFeeBreakdown, type DiscountType } from "@/lib/fees/structure";
import { formValuesToFullName } from "@/lib/admission-form";
import type { AdmissionFormValues } from "@/lib/admission-form";
import {
  addAdmission,
  getAdmissionByGrNo,
  updateAdmission,
  type AdmissionRecord,
} from "./admissions";
import { syncFeeFromAdmission } from "./fees";
import { registerStudentFromAdmission } from "./admission-sync";

export function parseAdmissionFormBody(body: Record<string, unknown>): {
  form: AdmissionFormValues;
  annualFee: number;
  discountAmount: number;
} {
  const discountType = (body.discountType ?? "none") as DiscountType;
  const discountValue = Number(body.discountValue) || 0;
  const standard = String(body.standard ?? "").trim();

  const form: AdmissionFormValues = {
    formNo: String(body.formNo ?? "").trim(),
    admissionDate: String(body.admissionDate ?? "").trim(),
    medium: String(body.medium ?? "English").trim(),
    photoUrl: String(body.photoUrl ?? "").trim(),
    surname: String(body.surname ?? "").trim(),
    firstName: String(body.firstName ?? "").trim(),
    fatherName: String(body.fatherName ?? "").trim(),
    motherName: String(body.motherName ?? "").trim(),
    standard,
    dob: String(body.dob ?? "").trim(),
    placeOfBirth: String(body.placeOfBirth ?? "").trim(),
    sex: String(body.sex ?? "").trim(),
    state: String(body.state ?? "").trim(),
    studentContact: String(body.studentContact ?? "").trim(),
    ageYears: String(body.ageYears ?? "").trim(),
    ageMonths: String(body.ageMonths ?? "").trim(),
    aadhar: String(body.aadhar ?? "").trim(),
    religion: String(body.religion ?? "").trim(),
    caste: String(body.caste ?? "").trim(),
    subCaste: String(body.subCaste ?? "").trim(),
    nationality: String(body.nationality ?? "Indian").trim(),
    bloodGroup: String(body.bloodGroup ?? "").trim(),
    motherTongue: String(body.motherTongue ?? "").trim(),
    residentialAddress: String(body.residentialAddress ?? "").trim(),
    lastSchool: String(body.lastSchool ?? "").trim(),
    reasonLeaving: String(body.reasonLeaving ?? "").trim(),
    residesWith: String(body.residesWith ?? "").trim(),
    fatherSurname: String(body.fatherSurname ?? "").trim(),
    fatherFirstName: String(body.fatherFirstName ?? "").trim(),
    fatherMiddleName: String(body.fatherMiddleName ?? "").trim(),
    fatherEducation: String(body.fatherEducation ?? "").trim(),
    fatherOccupation: String(body.fatherOccupation ?? "").trim(),
    fatherContact: String(body.fatherContact ?? "").trim(),
    motherSurname: String(body.motherSurname ?? "").trim(),
    motherFirstName: String(body.motherFirstName ?? "").trim(),
    motherMiddleName: String(body.motherMiddleName ?? "").trim(),
    motherEducation: String(body.motherEducation ?? "").trim(),
    motherOccupation: String(body.motherOccupation ?? "").trim(),
    motherContact: String(body.motherContact ?? "").trim(),
    email: String(body.email ?? "").trim(),
    discountType,
    discountValue: String(body.discountValue ?? ""),
  };

  const breakdown = computeFeeBreakdown(standard, discountType, discountValue);
  if (!breakdown) {
    throw new Error(`Unknown standard: ${standard}`);
  }

  const annualFee =
    body.annualFee !== undefined && body.annualFee !== ""
      ? Number(body.annualFee)
      : breakdown.finalFee;

  return { form, annualFee, discountAmount: breakdown.discountAmount };
}

function admissionInputFromForm(
  form: AdmissionFormValues,
  annualFee: number,
  discountAmount: number
) {
  return {
    formNo: form.formNo,
    admissionDate: form.admissionDate,
    medium: form.medium,
    photoUrl: form.photoUrl,
    surname: form.surname,
    firstName: form.firstName,
    fatherName: form.fatherName,
    motherName: form.motherName,
    standard: form.standard,
    dob: form.dob,
    placeOfBirth: form.placeOfBirth,
    sex: form.sex,
    state: form.state,
    studentContact: form.studentContact,
    ageYears: form.ageYears,
    ageMonths: form.ageMonths,
    aadhar: form.aadhar,
    religion: form.religion,
    caste: form.caste,
    subCaste: form.subCaste,
    nationality: form.nationality,
    bloodGroup: form.bloodGroup,
    motherTongue: form.motherTongue,
    residentialAddress: form.residentialAddress,
    lastSchool: form.lastSchool,
    reasonLeaving: form.reasonLeaving,
    residesWith: form.residesWith,
    fatherSurname: form.fatherSurname,
    fatherFirstName: form.fatherFirstName,
    fatherMiddleName: form.fatherMiddleName,
    fatherEducation: form.fatherEducation,
    fatherOccupation: form.fatherOccupation,
    fatherContact: form.fatherContact,
    motherSurname: form.motherSurname,
    motherFirstName: form.motherFirstName,
    motherMiddleName: form.motherMiddleName,
    motherEducation: form.motherEducation,
    motherOccupation: form.motherOccupation,
    motherContact: form.motherContact,
    email: form.email,
    annualFee,
    discount: discountAmount,
    fullName: formValuesToFullName(form),
  };
}

function formToAdmissionRecord(
  form: AdmissionFormValues,
  grNo: string,
  annualFee: number,
  discountAmount: number,
  existing?: AdmissionRecord
): AdmissionRecord {
  const fullName = formValuesToFullName(form);
  return {
    grNo,
    formNo: form.formNo,
    admissionDate: form.admissionDate,
    medium: form.medium,
    photoUrl: form.photoUrl,
    surname: form.surname,
    firstName: form.firstName,
    fatherName: form.fatherName,
    motherName: form.motherName,
    fullName,
    standard: form.standard,
    dob: form.dob,
    placeOfBirth: form.placeOfBirth,
    sex: form.sex,
    state: form.state,
    studentContact: form.studentContact,
    ageYears: form.ageYears,
    ageMonths: form.ageMonths,
    aadhar: form.aadhar,
    religion: form.religion,
    caste: form.caste,
    subCaste: form.subCaste,
    nationality: form.nationality,
    bloodGroup: form.bloodGroup,
    motherTongue: form.motherTongue,
    residentialAddress: form.residentialAddress,
    lastSchool: form.lastSchool,
    reasonLeaving: form.reasonLeaving,
    residesWith: form.residesWith,
    fatherSurname: form.fatherSurname,
    fatherFirstName: form.fatherFirstName,
    fatherMiddleName: form.fatherMiddleName,
    fatherEducation: form.fatherEducation,
    fatherOccupation: form.fatherOccupation,
    fatherContact: form.fatherContact,
    motherSurname: form.motherSurname,
    motherFirstName: form.motherFirstName,
    motherMiddleName: form.motherMiddleName,
    motherEducation: form.motherEducation,
    motherOccupation: form.motherOccupation,
    motherContact: form.motherContact,
    email: form.email,
    annualFee,
    discount: discountAmount,
    status: existing?.status ?? "Active",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    sheetRow: existing?.sheetRow ?? 0,
  };
}

export async function createAdmissionFromForm(
  body: Record<string, unknown>
): Promise<AdmissionRecord> {
  const surname = String(body.surname ?? "").trim();
  const firstName = String(body.firstName ?? "").trim();
  const standard = String(body.standard ?? "").trim();
  if (!surname || !firstName || !standard) {
    throw new Error("Surname, first name, and standard are required");
  }

  const { form, annualFee, discountAmount } = parseAdmissionFormBody(body);

  const admission = await addAdmission(admissionInputFromForm(form, annualFee, discountAmount));

  await registerStudentFromAdmission({
    fullName: admission.fullName,
    standard: admission.standard,
    annualFee,
    discountAmount,
    grNo: admission.grNo,
  });

  return admission;
}

export async function updateAdmissionFromForm(
  grNo: string,
  body: Record<string, unknown>
): Promise<AdmissionRecord> {
  const existing = await getAdmissionByGrNo(grNo);
  if (!existing) throw new Error("Admission record not found");

  const { form, annualFee, discountAmount } = parseAdmissionFormBody(body);
  const updated = formToAdmissionRecord(form, grNo, annualFee, discountAmount, existing);

  await updateAdmission(updated);
  await syncFeeFromAdmission({
    fullName: updated.fullName,
    previousName: existing.fullName,
    standard: updated.standard,
    annualFee,
    discountAmount,
    grNo,
  });

  return updated;
}

/** Create admission profile for an existing fee-sheet student. */
export async function completeAdmissionForStudent(
  body: Record<string, unknown> & { linkStudentName?: string }
): Promise<AdmissionRecord> {
  const linkName = String(body.linkStudentName ?? "").trim();
  const { form, annualFee, discountAmount } = parseAdmissionFormBody(body);
  const fullName = formValuesToFullName(form);

  const admission = await addAdmission(admissionInputFromForm(form, annualFee, discountAmount));

  await syncFeeFromAdmission({
    fullName,
    previousName: linkName || fullName,
    standard: form.standard,
    annualFee,
    discountAmount,
    grNo: admission.grNo,
  });

  return admission;
}
