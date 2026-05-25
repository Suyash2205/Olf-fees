import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });
const id = process.env.FEES_SHEET_ID;

function col(n) {
  if (n < 26) return String.fromCharCode(65 + n);
  return String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(65 + (n % 26));
}

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: id,
  range: "Fee details!A1:Z3",
  valueRenderOption: "FORMATTED_VALUE",
});
for (const [i, row] of (res.data.values ?? []).entries()) {
  console.log(`Header ${i + 1}:`);
  row.forEach((v, j) => {
    if (v) console.log(`  ${col(j)}: ${v}`);
  });
}

const name = "Suyash Humne";
const all = await sheets.spreadsheets.values.get({
  spreadsheetId: id,
  range: "Fee details!A4:Z500",
  valueRenderOption: "FORMATTED_VALUE",
});
const formulas = await sheets.spreadsheets.values.get({
  spreadsheetId: id,
  range: "Fee details!A4:Z500",
  valueRenderOption: "FORMULA",
});
for (let i = 0; i < (all.data.values ?? []).length; i++) {
  const row = all.data.values[i];
  if (!row[1]?.includes("Suyash")) continue;
  console.log("\nSuyash values row", i + 4);
  row.forEach((v, j) => {
    if (v) console.log(`  ${col(j)}: ${v}`);
  });
  console.log("Formulas:");
  (formulas.data.values[i] ?? []).forEach((v, j) => {
    if (v && String(v).startsWith("=")) console.log(`  ${col(j)}: ${v}`);
  });
  break;
}
