/**
 * Reconcile one fee row on the sheet (Q totals, pending) from Q total columns + annual fee.
 * Usage: node scripts/repair-fee-sync.mjs "Student Name"
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

const SHEET_NAME = "Fee details";
const DATA_START_ROW = 4;
const id = process.env.FEES_SHEET_ID;
const nameQuery = process.argv[2]?.trim();
if (!nameQuery) {
  console.error("Usage: node scripts/repair-fee-sync.mjs \"Student Name\"");
  process.exit(1);
}

const COL = {
  name: 1,
  totalFee: 4,
  discount: 7,
  pendingCol: 3,
  q1Paid: 11,
  q2Paid: 15,
  q3Paid: 19,
  q4Paid: 23,
  totalPaid: 24,
  balance: 25,
};

const Q_TOTAL_COLS = [COL.q1Paid, COL.q2Paid, COL.q3Paid, COL.q4Paid];

function col(n) {
  if (n < 26) return String.fromCharCode(65 + n);
  return String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(65 + (n % 26));
}

function parseNum(val) {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/[₹,]/g, ""));
  return isNaN(n) ? 0 : n;
}

const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const all = await sheets.spreadsheets.values.get({
  spreadsheetId: id,
  range: `${SHEET_NAME}!A4:Z500`,
});
let sheetRow = null;
let totalFee = 0;
let discount = 0;
for (let i = 0; i < (all.data.values ?? []).length; i++) {
  const row = all.data.values[i];
  if (!row[COL.name]?.includes(nameQuery)) continue;
  sheetRow = DATA_START_ROW + i;
  totalFee = parseNum(row[COL.totalFee]);
  discount = parseNum(row[COL.discount]);
  break;
}
if (!sheetRow) {
  console.error(`No row found matching "${nameQuery}"`);
  process.exit(1);
}

const months = await sheets.spreadsheets.values.get({
  spreadsheetId: id,
  range: `${SHEET_NAME}!A${sheetRow}:Z${sheetRow}`,
});
const monthRow = months.data.values?.[0] ?? [];
const qPaid = Q_TOTAL_COLS.map((colIdx) => parseNum(monthRow[colIdx]));
const totalPaid = qPaid.reduce((s, v) => s + v, 0);
const balance = Math.max(0, totalFee - totalPaid);
const pendingPct = totalFee > 0 ? `${((balance / totalFee) * 100).toFixed(2)}%` : "";

await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: id,
  requestBody: {
    valueInputOption: "USER_ENTERED",
    data: [
      { range: `${SHEET_NAME}!${col(COL.totalFee)}${sheetRow}`, values: [[totalFee]] },
      { range: `${SHEET_NAME}!${col(COL.discount)}${sheetRow}`, values: [[discount > 0 ? discount : ""]] },
      { range: `${SHEET_NAME}!${col(5)}${sheetRow}`, values: [[pendingPct]] },
      { range: `${SHEET_NAME}!${col(COL.pendingCol)}${sheetRow}`, values: [[balance]] },
      {
        range: `${SHEET_NAME}!${col(COL.q1Paid)}${sheetRow}:${col(COL.q4Paid)}${sheetRow}`,
        values: [qPaid],
      },
      {
        range: `${SHEET_NAME}!${col(COL.totalPaid)}${sheetRow}:${col(COL.balance)}${sheetRow}`,
        values: [[totalPaid, balance]],
      },
    ],
  },
});

console.log(`Repaired row ${sheetRow} for ${nameQuery}:`);
console.log(`  Fees decided: ${totalFee}, discount: ${discount}`);
console.log(`  Q paid: ${qPaid.join(", ")}`);
console.log(`  Total paid: ${totalPaid}, pending: ${balance} (${pendingPct})`);
