/**
 * Compare audit log payment/other-fee creates against actual sheet rows.
 * Usage: node scripts/audit-vs-sheets.mjs [studentNameSubstring] [daysBack]
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

const nameFilter = process.argv[2]?.trim() ?? "";
const daysBack = Number(process.argv[3] ?? 7);
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - daysBack);

const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });
const id = process.env.FEES_SHEET_ID;

async function getRange(range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  });
  return res.data.values ?? [];
}

function parseAuditDetails(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normDate(d) {
  if (!d) return "";
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return s;
}

const [auditRows, otherRows, dailyRows, feeRows] = await Promise.all([
  getRange("Audit Log!A2:H5000"),
  getRange("Other Fees Log!A2:H5000"),
  getRange("Daily Fees Log!A2:H5000"),
  getRange("Fee details!A4:Z500"),
]);

const otherEntries = otherRows
  .map((row, i) => ({
    rowNum: i + 2,
    date: normDate(row[0]),
    studentName: row[1] ?? "",
    className: row[2] ?? "",
    srNo: row[3] ?? "",
    feeType: row[4] ?? "",
    amount: Number(String(row[5] ?? "").replace(/[₹,]/g, "")) || 0,
    paymentMode: row[6] ?? "",
    notes: row[7] ?? "",
  }))
  .filter((e) => e.date && e.studentName);

const dailyEntries = dailyRows
  .map((row, i) => ({
    rowNum: i + 2,
    date: normDate(row[0]),
    studentName: row[1] ?? "",
    srNo: row[3] ?? "",
    amount: Number(String(row[4] ?? "").replace(/[₹,]/g, "")) || 0,
  }))
  .filter((e) => e.date && e.studentName);

const audits = auditRows
  .map((row, i) => ({
    rowNum: i + 2,
    timestamp: row[0] ?? "",
    action: row[3] ?? "",
    resource: row[4] ?? "",
    resourceId: row[5] ?? "",
    summary: row[6] ?? "",
    details: parseAuditDetails(row[7] ?? "{}"),
  }))
  .filter((a) => a.action === "create" && (a.resource === "other-fees" || a.resource === "payments"))
  .filter((a) => {
    const ts = new Date(a.timestamp);
    return !isNaN(ts.getTime()) && ts >= cutoff;
  });

function matchesOther(audit) {
  const d = audit.details;
  const date = normDate(d.date);
  const amount = Number(d.amount);
  const feeType = d.feeType ?? "";
  const name = audit.summary.match(/—\s*(.+)$/)?.[1]?.trim() ?? "";
  return otherEntries.some(
    (e) =>
      e.date === date &&
      Math.abs(e.amount - amount) < 0.01 &&
      e.feeType === feeType &&
      (e.srNo === audit.resourceId ||
        e.studentName.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(e.studentName.toLowerCase()))
  );
}

function matchesDaily(audit) {
  const d = audit.details;
  const date = normDate(d.date);
  const amount = Number(d.amount);
  const name =
    audit.summary.match(/for\s+(.+?)\s+on\s/i)?.[1]?.trim() ??
    audit.summary.match(/for\s+(.+)$/i)?.[1]?.trim() ??
    "";
  return dailyEntries.some(
    (e) =>
      e.date === date &&
      Math.abs(e.amount - amount) < 0.01 &&
      (e.srNo === audit.resourceId ||
        e.studentName.toLowerCase().includes(name.toLowerCase()))
  );
}

console.log(`\n=== Sheet: ${id} ===`);
console.log(`Audit creates (last ${daysBack}d): ${audits.length}`);
console.log(`Other Fees Log rows: ${otherEntries.length}`);
console.log(`Daily Fees Log rows: ${dailyEntries.length}\n`);

const missing = [];
for (const a of audits) {
  const ok = a.resource === "other-fees" ? matchesOther(a) : matchesDaily(a);
  if (!ok) missing.push(a);
}

if (missing.length) {
  console.log(`⚠️  ${missing.length} audit create(s) with NO matching sheet row:\n`);
  for (const a of missing) {
    console.log(`  [${a.timestamp}] ${a.resource}: ${a.summary}`);
    console.log(`    details: ${JSON.stringify(a.details)}`);
  }
} else {
  console.log("✓ All recent audit creates have matching sheet rows.");
}

if (nameFilter) {
  const studentOther = otherEntries.filter((e) =>
    e.studentName.toLowerCase().includes(nameFilter.toLowerCase())
  );
  const studentDaily = dailyEntries.filter((e) =>
    e.studentName.toLowerCase().includes(nameFilter.toLowerCase())
  );
  const studentAudits = audits.filter(
    (a) =>
      a.summary.toLowerCase().includes(nameFilter.toLowerCase()) ||
      a.resourceId.toLowerCase().includes(nameFilter.toLowerCase())
  );

  console.log(`\n=== Student filter: "${nameFilter}" ===`);
  console.log("\nOther Fees Log:");
  for (const e of studentOther) {
    console.log(
      `  row ${e.rowNum}: ${e.date} | ${e.feeType} | ₹${e.amount} | ${e.paymentMode} | srNo=${e.srNo}`
    );
  }
  if (!studentOther.length) console.log("  (none)");

  console.log("\nDaily Fees Log:");
  for (const e of studentDaily) {
    console.log(`  row ${e.rowNum}: ${e.date} | ₹${e.amount} | srNo=${e.srNo}`);
  }
  if (!studentDaily.length) console.log("  (none)");

  console.log("\nRecent audit creates:");
  for (const a of studentAudits) {
    console.log(`  [${a.timestamp}] ${a.summary}`);
  }
  if (!studentAudits.length) console.log("  (none)");

  const matchingFeeRows = feeRows.filter((r) =>
    String(r[1] ?? "").toLowerCase().includes(nameFilter.toLowerCase())
  );
  for (const feeRow of matchingFeeRows) {
    const idx = feeRows.indexOf(feeRow) + 4;
    console.log(`\nFee details row ${idx}:`);
    console.log(`  Name: ${feeRow[1]}, Class: ${feeRow[2]}, Pending: ${feeRow[3]}`);
    console.log(`  Total fee: ${feeRow[4]}, Total paid (Y): ${feeRow[24]}, Balance (Z): ${feeRow[25]}`);
    console.log(`  Q1-Q4 paid (L,P,T,X): ${feeRow[11]}, ${feeRow[15]}, ${feeRow[19]}, ${feeRow[23]}`);
  }
}

if (process.argv.includes("--gap-check")) {
  const gapRows = await getRange("Other Fees Log!A7:H1005");
  const nonEmpty = [];
  gapRows.forEach((row, i) => {
    if (row?.some((c) => c !== undefined && String(c).trim() !== "")) {
      nonEmpty.push({ row: i + 7, data: row });
    }
  });
  console.log(`\n=== Other Fees Log gap (rows 7–1005) ===`);
  console.log(`Non-empty rows in gap: ${nonEmpty.length}`);
  const dataRows = otherEntries.map((e) => e.rowNum).sort((a, b) => a - b);
  console.log(`All data row numbers: ${dataRows.join(", ")}`);

  const dailyNums = dailyEntries.map((e) => e.rowNum).sort((a, b) => a - b);
  console.log(`\nDaily Fees Log row numbers: ${dailyNums.join(", ")}`);
}
