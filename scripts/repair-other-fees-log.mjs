/**
 * One-time repair: compact Other Fees Log rows + backfill missing audit entries.
 * Usage: node scripts/repair-other-fees-log.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SHEET = "Other Fees Log";
const id = process.env.FEES_SHEET_ID;

const BACKFILL = [
  {
    date: "2026-06-16",
    studentName: "Dhruvi Yashwant Modlekar",
    className: "Nursery",
    srNo: "511",
    feeType: "Bag",
    amount: 500,
    paymentMode: "Cash",
    notes: "Backfilled from audit log (missing sheet row)",
  },
];

const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

function parseEntry(row, rowNum) {
  const amount = Number(String(row[5] ?? "").replace(/[₹,]/g, "")) || 0;
  if (!row[0] || !row[1] || !row[4] || amount <= 0) return null;
  return {
    rowNum,
    date: String(row[0]).slice(0, 10),
    studentName: row[1] ?? "",
    className: row[2] ?? "",
    srNo: row[3] ?? "",
    feeType: row[4] ?? "",
    amount,
    paymentMode: row[6] ?? "Cash",
    notes: row[7] ?? "",
  };
}

function entryKey(e) {
  return `${e.srNo}|${e.date}|${e.feeType}|${e.amount}`;
}

async function readEntries() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${SHEET}!A:H`,
  });
  const rows = res.data.values ?? [];
  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const e = parseEntry(rows[i], i + 1);
    if (e) entries.push(e);
  }
  return entries;
}

async function compact(entries) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  const gridRows =
    meta.data.sheets?.find((s) => s.properties?.title === SHEET)?.properties?.gridProperties
      ?.rowCount ?? entries.length + 2;

  if (gridRows > 1) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: id,
      range: `${SHEET}!A2:H${gridRows}`,
    });
  }
  if (entries.length === 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${SHEET}!A2:H${entries.length + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: entries.map((e) => [
        e.date,
        e.studentName,
        e.className,
        e.srNo,
        e.feeType,
        e.amount,
        e.paymentMode,
        e.notes,
      ]),
    },
  });
}

const before = await readEntries();
console.log(`Before: ${before.length} entries`);
console.log(`Row numbers: ${before.map((e) => e.rowNum).join(", ")}`);

const keys = new Set(before.map(entryKey));
const toAdd = BACKFILL.filter((b) => !keys.has(entryKey(b)));
if (toAdd.length) {
  console.log(`Backfilling ${toAdd.length} missing entry(ies)...`);
  for (const b of toAdd) before.push(b);
} else {
  console.log("No backfill needed (already present).");
}

await compact(before);
const after = await readEntries();
console.log(`After compact: ${after.length} entries in rows 2–${after.length + 1}`);
console.log(`Row numbers: ${after.map((e) => e.rowNum).join(", ")}`);
