import { buildFullName } from "@/lib/admission-utils";
import { sortByGradeThenName } from "@/lib/sort-by-grade";
import { getSheetsClient, FEES_SHEET_ID } from "./client";

export { buildFullName };

export const ADMISSIONS_SHEET = "Admissions";

/** Column order on the Admissions tab — one header row, data from row 2 */
export const ADMISSION_HEADERS = [
  "Gr No",
  "Form No",
  "Admission Date",
  "Medium",
  "Photo URL",
  "Surname",
  "First Name",
  "Father Name",
  "Mother Name",
  "Full Name",
  "Standard",
  "DOB",
  "Place of Birth",
  "Sex",
  "State",
  "Student Contact",
  "Age Years",
  "Age Months",
  "Aadhar",
  "Religion",
  "Caste",
  "Sub Caste",
  "Nationality",
  "Blood Group",
  "Mother Tongue",
  "Residential Address",
  "Last School",
  "Reason for Leaving",
  "Resides With",
  "Father Surname",
  "Father First Name",
  "Father Middle Name",
  "Father Education",
  "Father Occupation",
  "Father Contact",
  "Mother Surname",
  "Mother First Name",
  "Mother Middle Name",
  "Mother Education",
  "Mother Occupation",
  "Mother Contact",
  "Email",
  "Annual Fee",
  "Discount",
  "Status",
  "Created At",
] as const;

const DATA_START_ROW = 2;

const COL: Record<(typeof ADMISSION_HEADERS)[number], number> = ADMISSION_HEADERS.reduce(
  (acc, h, i) => {
    acc[h] = i;
    return acc;
  },
  {} as Record<(typeof ADMISSION_HEADERS)[number], number>
);

export type AdmissionHeader = (typeof ADMISSION_HEADERS)[number];

export interface AdmissionRecord {
  grNo: string;
  formNo: string;
  admissionDate: string;
  medium: string;
  photoUrl: string;
  surname: string;
  firstName: string;
  fatherName: string;
  motherName: string;
  fullName: string;
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
  annualFee: number;
  discount: number;
  status: string;
  createdAt: string;
  sheetRow: number;
}

export type AdmissionInput = Omit<AdmissionRecord, "grNo" | "fullName" | "sheetRow" | "createdAt" | "status"> & {
  grNo?: string;
  fullName?: string;
  status?: string;
};

function colLetter(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/[₹,]/g, ""));
  return isNaN(n) ? 0 : n;
}

function rowToAdmission(row: string[], rowIndex: number): AdmissionRecord | null {
  const grNo = row[COL["Gr No"]]?.trim();
  if (!grNo || grNo === "Gr No") return null;

  return {
    grNo,
    formNo: row[COL["Form No"]]?.trim() ?? "",
    admissionDate: row[COL["Admission Date"]]?.trim() ?? "",
    medium: row[COL.Medium]?.trim() ?? "",
    photoUrl: row[COL["Photo URL"]]?.trim() ?? "",
    surname: row[COL.Surname]?.trim() ?? "",
    firstName: row[COL["First Name"]]?.trim() ?? "",
    fatherName: row[COL["Father Name"]]?.trim() ?? "",
    motherName: row[COL["Mother Name"]]?.trim() ?? "",
    fullName: row[COL["Full Name"]]?.trim() ?? "",
    standard: row[COL.Standard]?.trim() ?? "",
    dob: row[COL.DOB]?.trim() ?? "",
    placeOfBirth: row[COL["Place of Birth"]]?.trim() ?? "",
    sex: row[COL.Sex]?.trim() ?? "",
    state: row[COL.State]?.trim() ?? "",
    studentContact: row[COL["Student Contact"]]?.trim() ?? "",
    ageYears: row[COL["Age Years"]]?.trim() ?? "",
    ageMonths: row[COL["Age Months"]]?.trim() ?? "",
    aadhar: row[COL.Aadhar]?.trim() ?? "",
    religion: row[COL.Religion]?.trim() ?? "",
    caste: row[COL.Caste]?.trim() ?? "",
    subCaste: row[COL["Sub Caste"]]?.trim() ?? "",
    nationality: row[COL.Nationality]?.trim() ?? "",
    bloodGroup: row[COL["Blood Group"]]?.trim() ?? "",
    motherTongue: row[COL["Mother Tongue"]]?.trim() ?? "",
    residentialAddress: row[COL["Residential Address"]]?.trim() ?? "",
    lastSchool: row[COL["Last School"]]?.trim() ?? "",
    reasonLeaving: row[COL["Reason for Leaving"]]?.trim() ?? "",
    residesWith: row[COL["Resides With"]]?.trim() ?? "",
    fatherSurname: row[COL["Father Surname"]]?.trim() ?? "",
    fatherFirstName: row[COL["Father First Name"]]?.trim() ?? "",
    fatherMiddleName: row[COL["Father Middle Name"]]?.trim() ?? "",
    fatherEducation: row[COL["Father Education"]]?.trim() ?? "",
    fatherOccupation: row[COL["Father Occupation"]]?.trim() ?? "",
    fatherContact: row[COL["Father Contact"]]?.trim() ?? "",
    motherSurname: row[COL["Mother Surname"]]?.trim() ?? "",
    motherFirstName: row[COL["Mother First Name"]]?.trim() ?? "",
    motherMiddleName: row[COL["Mother Middle Name"]]?.trim() ?? "",
    motherEducation: row[COL["Mother Education"]]?.trim() ?? "",
    motherOccupation: row[COL["Mother Occupation"]]?.trim() ?? "",
    motherContact: row[COL["Mother Contact"]]?.trim() ?? "",
    email: row[COL.Email]?.trim() ?? "",
    annualFee: parseNum(row[COL["Annual Fee"]]),
    discount: parseNum(row[COL.Discount]),
    status: row[COL.Status]?.trim() ?? "Active",
    createdAt: row[COL["Created At"]]?.trim() ?? "",
    sheetRow: DATA_START_ROW + rowIndex,
  };
}

function admissionToRow(record: AdmissionRecord | (AdmissionInput & { grNo: string; fullName: string; createdAt: string })): string[] {
  const row = new Array(ADMISSION_HEADERS.length).fill("");
  const set = (key: AdmissionHeader, val: string | number) => {
    row[COL[key]] = val === undefined || val === null ? "" : String(val);
  };

  set("Gr No", record.grNo);
  set("Form No", record.formNo ?? "");
  set("Admission Date", record.admissionDate ?? "");
  set("Medium", record.medium ?? "English");
  set("Photo URL", record.photoUrl ?? "");
  set("Surname", record.surname ?? "");
  set("First Name", record.firstName ?? "");
  set("Father Name", record.fatherName ?? "");
  set("Mother Name", record.motherName ?? "");
  set("Full Name", record.fullName ?? buildFullName(record));
  set("Standard", record.standard ?? "");
  set("DOB", record.dob ?? "");
  set("Place of Birth", record.placeOfBirth ?? "");
  set("Sex", record.sex ?? "");
  set("State", record.state ?? "");
  set("Student Contact", record.studentContact ?? "");
  set("Age Years", record.ageYears ?? "");
  set("Age Months", record.ageMonths ?? "");
  set("Aadhar", record.aadhar ?? "");
  set("Religion", record.religion ?? "");
  set("Caste", record.caste ?? "");
  set("Sub Caste", record.subCaste ?? "");
  set("Nationality", record.nationality ?? "");
  set("Blood Group", record.bloodGroup ?? "");
  set("Mother Tongue", record.motherTongue ?? "");
  set("Residential Address", record.residentialAddress ?? "");
  set("Last School", record.lastSchool ?? "");
  set("Reason for Leaving", record.reasonLeaving ?? "");
  set("Resides With", record.residesWith ?? "");
  set("Father Surname", record.fatherSurname ?? "");
  set("Father First Name", record.fatherFirstName ?? "");
  set("Father Middle Name", record.fatherMiddleName ?? "");
  set("Father Education", record.fatherEducation ?? "");
  set("Father Occupation", record.fatherOccupation ?? "");
  set("Father Contact", record.fatherContact ?? "");
  set("Mother Surname", record.motherSurname ?? "");
  set("Mother First Name", record.motherFirstName ?? "");
  set("Mother Middle Name", record.motherMiddleName ?? "");
  set("Mother Education", record.motherEducation ?? "");
  set("Mother Occupation", record.motherOccupation ?? "");
  set("Mother Contact", record.motherContact ?? "");
  set("Email", record.email ?? "");
  set("Annual Fee", "annualFee" in record ? record.annualFee : 0);
  set("Discount", "discount" in record ? record.discount : 0);
  set("Status", record.status ?? "Active");
  set("Created At", "createdAt" in record ? record.createdAt : new Date().toISOString());

  return row;
}

export async function ensureAdmissionsSheet(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === ADMISSIONS_SHEET);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ADMISSIONS_SHEET } } }],
      },
    });
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${ADMISSIONS_SHEET}!A1:1`,
  });
  const firstCell = headerRes.data.values?.[0]?.[0];
  if (firstCell !== "Gr No") {
    const endCol = colLetter(ADMISSION_HEADERS.length - 1);
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${ADMISSIONS_SHEET}!A1:${endCol}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...ADMISSION_HEADERS]] },
    });
  }
}

export async function readAllAdmissionsFromSheet(): Promise<AdmissionRecord[]> {
  await ensureAdmissionsSheet();
  const sheets = getSheetsClient();
  const endCol = colLetter(ADMISSION_HEADERS.length - 1);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${ADMISSIONS_SHEET}!A:${endCol}`,
  });
  const rows = res.data.values ?? [];
  const records = rows
    .slice(1)
    .map((row, i) => rowToAdmission(row as string[], i))
    .filter(Boolean) as AdmissionRecord[];

  return sortByGradeThenName(
    records,
    (a) => a.standard,
    (a) => a.fullName
  );
}

/** Always reads live from Google Sheets (no server cache). */
export const getAllAdmissions = readAllAdmissionsFromSheet;

export async function getAdmissionByGrNo(grNo: string): Promise<AdmissionRecord | null> {
  const all = await readAllAdmissionsFromSheet();
  return all.find((a) => a.grNo === grNo) ?? null;
}

export async function generateGrNo(): Promise<string> {
  const all = await readAllAdmissionsFromSheet();
  const year = new Date().getFullYear();
  const prefix = `GR-${year}-`;
  const nums = all
    .map((a) => a.grNo)
    .filter((g) => g.startsWith(prefix))
    .map((g) => parseInt(g.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function getAdmissionByStudentName(
  studentName: string
): Promise<AdmissionRecord | null> {
  const all = await readAllAdmissionsFromSheet();
  const norm = studentName.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    all.find((a) => a.fullName.trim().toLowerCase().replace(/\s+/g, " ") === norm) ??
    null
  );
}

export async function updateAdmission(record: AdmissionRecord): Promise<void> {
  if (!record.sheetRow) throw new Error("Missing sheet row for update");
  await ensureAdmissionsSheet();
  const sheets = getSheetsClient();
  const endCol = colLetter(ADMISSION_HEADERS.length - 1);
  const row = admissionToRow(record);
  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${ADMISSIONS_SHEET}!A${record.sheetRow}:${endCol}${record.sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

export async function addAdmission(
  input: AdmissionInput & { annualFee: number; discount: number }
): Promise<AdmissionRecord> {
  await ensureAdmissionsSheet();
  const sheets = getSheetsClient();

  const grNo = input.grNo ?? (await generateGrNo());
  const fullName = input.fullName ?? buildFullName(input);
  const createdAt = new Date().toISOString();

  const record: AdmissionRecord = {
    ...input,
    grNo,
    fullName,
    status: input.status ?? "Active",
    createdAt,
    sheetRow: 0,
  };

  const row = admissionToRow(record);
  await sheets.spreadsheets.values.append({
    spreadsheetId: FEES_SHEET_ID,
    range: `${ADMISSIONS_SHEET}!A:${colLetter(ADMISSION_HEADERS.length - 1)}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  return record;
}
