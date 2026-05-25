import { unstable_cache } from "next/cache";
import type { UdiseRecord } from "@/lib/udise/record";
import { getSheetsClient, FEES_SHEET_ID } from "./client";

export type { UdiseRecord } from "@/lib/udise/record";
export { udiseDetailFields, udiseRowKey } from "@/lib/udise/record";

/** UDISE export uses Roman class labels (I = 1st, etc.) */
const UDISE_CLASS_ORDER = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function compareUdiseRecords(a: UdiseRecord, b: UdiseRecord): number {
  const ia = UDISE_CLASS_ORDER.indexOf(a.className);
  const ib = UDISE_CLASS_ORDER.indexOf(b.className);
  const ca = ia >= 0 ? ia : 99;
  const cb = ib >= 0 ? ib : 99;
  if (ca !== cb) return ca - cb;
  const sec = a.section.localeCompare(b.section, "en", { numeric: true });
  if (sec !== 0) return sec;
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

export const UDISE_SHEET = "UDISE";

/** Column order on the UDISE tab — header row 1, data from row 2 */
export const UDISE_HEADERS = [
  "Class",
  "Section",
  "Name",
  "Gender",
  "Permanent Education Number",
  "Student State Code",
  "Father Name",
  "Mother Name",
  "Social Category",
  "Minority Group",
  "BPL beneficiary",
  "CWSN",
  "Type of Impairments",
  "Is Repeater",
  "Suspected Duplicate",
  "Entry Status",
  "AADHAAR Number of Student",
  "Name As per AADHAAR",
  "AADHAAR Validation Status",
  "Admission Number in Present School (GR Number)",
  "Student's Height (in CMs)",
  "Student's Weight (in KGs)",
] as const;

export type UdiseHeader = (typeof UDISE_HEADERS)[number];

const DATA_START_ROW = 2;

const COL: Record<UdiseHeader, number> = UDISE_HEADERS.reduce(
  (acc, h, i) => {
    acc[h] = i;
    return acc;
  },
  {} as Record<UdiseHeader, number>
);

function colLetter(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
}

function rowToUdise(row: string[], rowIndex: number): UdiseRecord | null {
  const name = row[COL.Name]?.trim();
  if (!name || name === "Name") return null;

  return {
    className: row[COL.Class]?.trim() ?? "",
    section: row[COL.Section]?.trim() ?? "",
    name,
    gender: row[COL.Gender]?.trim() ?? "",
    permanentEducationNumber: row[COL["Permanent Education Number"]]?.trim() ?? "",
    studentStateCode: row[COL["Student State Code"]]?.trim() ?? "",
    fatherName: row[COL["Father Name"]]?.trim() ?? "",
    motherName: row[COL["Mother Name"]]?.trim() ?? "",
    socialCategory: row[COL["Social Category"]]?.trim() ?? "",
    minorityGroup: row[COL["Minority Group"]]?.trim() ?? "",
    bplBeneficiary: row[COL["BPL beneficiary"]]?.trim() ?? "",
    cwsn: row[COL.CWSN]?.trim() ?? "",
    typeOfImpairments: row[COL["Type of Impairments"]]?.trim() ?? "",
    isRepeater: row[COL["Is Repeater"]]?.trim() ?? "",
    suspectedDuplicate: row[COL["Suspected Duplicate"]]?.trim() ?? "",
    entryStatus: row[COL["Entry Status"]]?.trim() ?? "",
    aadhaarNumber: row[COL["AADHAAR Number of Student"]]?.trim() ?? "",
    nameAsPerAadhaar: row[COL["Name As per AADHAAR"]]?.trim() ?? "",
    aadhaarValidationStatus: row[COL["AADHAAR Validation Status"]]?.trim() ?? "",
    grNumber: row[COL["Admission Number in Present School (GR Number)"]]?.trim() ?? "",
    heightCm: row[COL["Student's Height (in CMs)"]]?.trim() ?? "",
    weightKg: row[COL["Student's Weight (in KGs)"]]?.trim() ?? "",
    sheetRow: DATA_START_ROW + rowIndex,
  };
}

export function udiseToRow(record: UdiseRecord): string[] {
  const row = new Array(UDISE_HEADERS.length).fill("");
  const set = (key: UdiseHeader, val: string) => {
    row[COL[key]] = val ?? "";
  };
  set("Class", record.className);
  set("Section", record.section);
  set("Name", record.name);
  set("Gender", record.gender);
  set("Permanent Education Number", record.permanentEducationNumber);
  set("Student State Code", record.studentStateCode);
  set("Father Name", record.fatherName);
  set("Mother Name", record.motherName);
  set("Social Category", record.socialCategory);
  set("Minority Group", record.minorityGroup);
  set("BPL beneficiary", record.bplBeneficiary);
  set("CWSN", record.cwsn);
  set("Type of Impairments", record.typeOfImpairments);
  set("Is Repeater", record.isRepeater);
  set("Suspected Duplicate", record.suspectedDuplicate);
  set("Entry Status", record.entryStatus);
  set("AADHAAR Number of Student", record.aadhaarNumber);
  set("Name As per AADHAAR", record.nameAsPerAadhaar);
  set("AADHAAR Validation Status", record.aadhaarValidationStatus);
  set("Admission Number in Present School (GR Number)", record.grNumber);
  set("Student's Height (in CMs)", record.heightCm);
  set("Student's Weight (in KGs)", record.weightKg);
  return row;
}

export async function ensureUdiseSheet(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === UDISE_SHEET);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: UDISE_SHEET } } }],
      },
    });
  }

  const endCol = colLetter(UDISE_HEADERS.length - 1);
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${UDISE_SHEET}!A1:1`,
  });
  const firstCell = headerRes.data.values?.[0]?.[0];
  if (firstCell !== "Class") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${UDISE_SHEET}!A1:${endCol}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...UDISE_HEADERS]] },
    });
  }
}

async function _fetchAllUdise(): Promise<UdiseRecord[]> {
  await ensureUdiseSheet();
  const sheets = getSheetsClient();
  const endCol = colLetter(UDISE_HEADERS.length - 1);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${UDISE_SHEET}!A:${endCol}`,
  });
  const rows = res.data.values ?? [];
  const records = rows
    .slice(1)
    .map((row, i) => rowToUdise(row as string[], i))
    .filter((r): r is UdiseRecord => r != null);

  return records.sort(compareUdiseRecords);
}

export const getAllUdise = unstable_cache(_fetchAllUdise, ["all-udise", process.env.FEES_SHEET_ID ?? ""], {
  revalidate: 60,
  tags: ["udise"],
});

export async function replaceAllUdiseRows(records: UdiseRecord[]): Promise<number> {
  await ensureUdiseSheet();
  const sheets = getSheetsClient();
  const endCol = colLetter(UDISE_HEADERS.length - 1);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: FEES_SHEET_ID,
    range: `${UDISE_SHEET}!A2:${endCol}2000`,
  });

  if (records.length === 0) return 0;

  const values = records.map(udiseToRow);
  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${UDISE_SHEET}!A2:${endCol}${1 + records.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  return records.length;
}

/** Map a row from the UDISE export xlsx (19 columns) → UdiseRecord */
export function udiseFromXlsxRow(cells: string[]): UdiseRecord | null {
  const name = cells[2]?.trim();
  if (!name) return null;
  return {
    className: cells[0]?.trim() ?? "",
    section: cells[1]?.trim() ?? "",
    name,
    gender: cells[3]?.trim() ?? "",
    permanentEducationNumber: cells[4]?.trim() ?? "",
    studentStateCode: cells[5]?.trim() ?? "",
    fatherName: cells[6]?.trim() ?? "",
    motherName: cells[7]?.trim() ?? "",
    socialCategory: cells[8]?.trim() ?? "",
    minorityGroup: cells[9]?.trim() ?? "",
    bplBeneficiary: cells[10]?.trim() ?? "",
    cwsn: cells[11]?.trim() ?? "",
    typeOfImpairments: cells[12]?.trim() ?? "",
    isRepeater: cells[13]?.trim() ?? "",
    suspectedDuplicate: cells[14]?.trim() ?? "",
    entryStatus: cells[15]?.trim() ?? "",
    aadhaarNumber: cells[16]?.trim() ?? "",
    nameAsPerAadhaar: cells[17]?.trim() ?? "",
    aadhaarValidationStatus: cells[18]?.trim() ?? "",
    grNumber: "",
    heightCm: "",
    weightKg: "",
    sheetRow: 0,
  };
}
