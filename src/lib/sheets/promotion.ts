import {
  CLASS_OPTIONS as CLASS_LADDER,
  type ClassOption as CanonicalClass,
  getBaseTuition,
  resolveClass,
} from "@/lib/fees/structure";
import { getSheetsClient, FEES_SHEET_ID } from "./client";
import type { FeeRecord } from "./fees";

export { CLASS_LADDER };
export type { CanonicalClass };

const SHEET_NAME = "Fee details";
const DATA_START_ROW = 4;

const COL = {
  name: 1,
  class: 2,
  totalFee: 4,
  discount: 7,
};

function tuitionForClass(cls: CanonicalClass): number {
  return getBaseTuition(cls) ?? 0;
}

const PASS_OUT_SUFFIX = " (Pass out)";
const PASS_OUT_CLASS = "Pass out";

function colLetter(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
}

export function stripPassOutSuffix(name: string): string {
  return name.replace(/\s*\(pass\s*out\)\s*$/i, "").trim();
}

export function withPassOutSuffix(name: string): string {
  const base = stripPassOutSuffix(name);
  return `${base}${PASS_OUT_SUFFIX}`;
}

export function isPassOutStudent(name: string, className: string): boolean {
  if (/\(pass\s*out\)/i.test(name)) return true;
  return /pass\s*out/i.test(className.trim());
}

export function normalizeClass(className: string): CanonicalClass | "pass-out" | null {
  const raw = className.trim();
  if (!raw) return null;
  if (/pass\s*out/i.test(raw)) return "pass-out";
  return resolveClass(raw);
}

export interface PromotionChange {
  sheetRow: number;
  studentName: string;
  className: string;
  totalFee?: number;
}

export interface PromotionResult {
  updated: number;
  skipped: number;
  errors: string[];
}

function computePromote(
  name: string,
  className: string
): PromotionChange | { skip: string } | { error: string } {
  if (isPassOutStudent(name, className)) {
    return { skip: "Already marked pass out" };
  }

  const normalized = normalizeClass(className);
  if (!normalized) {
    return { error: `Unknown class: "${className}"` };
  }

  if (normalized === "pass-out") {
    return { skip: "Already pass out" };
  }

  const idx = CLASS_LADDER.indexOf(normalized);
  if (idx === CLASS_LADDER.length - 1) {
    return {
      sheetRow: 0,
      studentName: withPassOutSuffix(name),
      className: PASS_OUT_CLASS,
    };
  }

  const next = CLASS_LADDER[idx + 1];
  return {
    sheetRow: 0,
    studentName: stripPassOutSuffix(name),
    className: next,
    totalFee: tuitionForClass(next),
  };
}

function computeDemote(
  name: string,
  className: string
): PromotionChange | { skip: string } | { error: string } {
  if (isPassOutStudent(name, className)) {
    const prev = "10th Std" as CanonicalClass;
    return {
      sheetRow: 0,
      studentName: stripPassOutSuffix(name),
      className: prev,
      totalFee: tuitionForClass(prev),
    };
  }

  const normalized = normalizeClass(className);
  if (!normalized || normalized === "pass-out") {
    return { error: `Unknown class: "${className}"` };
  }

  const idx = CLASS_LADDER.indexOf(normalized);
  if (idx <= 0) {
    return { skip: `Cannot demote below ${CLASS_LADDER[0]}` };
  }

  const prev = CLASS_LADDER[idx - 1];
  return {
    sheetRow: 0,
    studentName: stripPassOutSuffix(name),
    className: prev,
    totalFee: tuitionForClass(prev),
  };
}

async function fetchAllFeeRecords(): Promise<FeeRecord[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:Z`,
  });
  const rows = res.data.values ?? [];

  function parseNum(val: string | undefined): number {
    if (!val) return 0;
    const n = parseFloat(val.replace(/[₹,]/g, ""));
    return isNaN(n) ? 0 : n;
  }

  return rows
    .slice(3)
    .map((row, i) => {
      const r = row as string[];
      const srNo = r[0]?.trim();
      const studentName = r[COL.name]?.trim();
      if (!srNo || !studentName || studentName === "Students Name") return null;
      return {
        srNo,
        studentName,
        className: r[COL.class]?.trim() ?? "",
        totalFee: parseNum(r[COL.totalFee]),
        q1Paid: 0,
        q2Paid: 0,
        q3Paid: 0,
        q4Paid: 0,
        totalPaid: 0,
        balance: 0,
        notes: "",
        discount: parseNum(r[COL.discount]),
        sheetRow: DATA_START_ROW + i,
      } satisfies FeeRecord;
    })
    .filter(Boolean) as FeeRecord[];
}

async function applyChanges(changes: PromotionChange[]): Promise<void> {
  if (changes.length === 0) return;

  const sheets = getSheetsClient();
  const batchData: { range: string; values: (string | number)[][] }[] = [];

  for (const c of changes) {
    batchData.push({
      range: `${SHEET_NAME}!${colLetter(COL.name)}${c.sheetRow}`,
      values: [[c.studentName]],
    });
    batchData.push({
      range: `${SHEET_NAME}!${colLetter(COL.class)}${c.sheetRow}`,
      values: [[c.className]],
    });
    if (c.totalFee !== undefined) {
      batchData.push({
        range: `${SHEET_NAME}!${colLetter(COL.totalFee)}${c.sheetRow}`,
        values: [[c.totalFee]],
      });
    }
  }

  const CHUNK = 400;
  for (let i = 0; i < batchData.length; i += CHUNK) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: batchData.slice(i, i + CHUNK),
      },
    });
  }
}

function applyToRecord(
  record: FeeRecord,
  computed: PromotionChange | { skip: string } | { error: string }
): PromotionChange | null {
  if ("skip" in computed || "error" in computed) return null;
  return { ...computed, sheetRow: record.sheetRow };
}

export async function promoteAll(): Promise<PromotionResult> {
  const fees = await fetchAllFeeRecords();
  const changes: PromotionChange[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (const f of fees) {
    const computed = computePromote(f.studentName, f.className);
    if ("skip" in computed) {
      skipped++;
      continue;
    }
    if ("error" in computed) {
      errors.push(`${f.studentName}: ${computed.error}`);
      continue;
    }
    const change = applyToRecord(f, computed);
    if (change) changes.push(change);
  }

  await applyChanges(changes);
  return { updated: changes.length, skipped, errors };
}

export async function demoteAll(): Promise<PromotionResult> {
  const fees = await fetchAllFeeRecords();
  const changes: PromotionChange[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (const f of fees) {
    const computed = computeDemote(f.studentName, f.className);
    if ("skip" in computed) {
      skipped++;
      continue;
    }
    if ("error" in computed) {
      errors.push(`${f.studentName}: ${computed.error}`);
      continue;
    }
    const change = applyToRecord(f, computed);
    if (change) changes.push(change);
  }

  await applyChanges(changes);
  return { updated: changes.length, skipped, errors };
}

export async function promoteOne(sheetRow: number): Promise<PromotionResult> {
  const fees = await fetchAllFeeRecords();
  const record = fees.find((f) => f.sheetRow === sheetRow);
  if (!record) {
    return { updated: 0, skipped: 0, errors: ["Student not found"] };
  }

  const computed = computePromote(record.studentName, record.className);
  if ("skip" in computed) {
    return { updated: 0, skipped: 1, errors: [] };
  }
  if ("error" in computed) {
    return { updated: 0, skipped: 0, errors: [computed.error] };
  }

  const change = applyToRecord(record, computed)!;
  await applyChanges([change]);
  return { updated: 1, skipped: 0, errors: [] };
}

export async function demoteOne(sheetRow: number): Promise<PromotionResult> {
  const fees = await fetchAllFeeRecords();
  const record = fees.find((f) => f.sheetRow === sheetRow);
  if (!record) {
    return { updated: 0, skipped: 0, errors: ["Student not found"] };
  }

  const computed = computeDemote(record.studentName, record.className);
  if ("skip" in computed) {
    return { updated: 0, skipped: 1, errors: [computed.skip] };
  }
  if ("error" in computed) {
    return { updated: 0, skipped: 0, errors: [computed.error] };
  }

  const change = applyToRecord(record, computed)!;
  await applyChanges([change]);
  return { updated: 1, skipped: 0, errors: [] };
}
