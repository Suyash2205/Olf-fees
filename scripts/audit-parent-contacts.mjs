/**
 * Phase 0 audit for the WhatsApp attendance bot (docs/WHATSAPP_ATTENDANCE_BOT_PLAN.md).
 *
 * Question it answers: of the active students who can appear in attendance,
 * how many resolve to at least one usable parent mobile number?
 *
 * READ-ONLY. Never writes to any sheet.
 *
 * Privacy: phone numbers are NEVER printed. stdout is counts + student names only.
 * The per-student gap list is written to a file outside the repo (--out).
 *
 * Usage:
 *   node scripts/audit-parent-contacts.mjs [--out /path/to/gaps.csv]
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const outIdx = process.argv.indexOf("--out");
const outPath = outIdx > -1 ? process.argv[outIdx + 1] : null;

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

// --- mirrors of src/lib helpers (kept literal so the audit needs no TS build) ---

/** src/lib/admission-form.ts:96 */
function parseGrNoFromNotes(notes) {
  const m = String(notes ?? "").match(/(?:GR:\s*)?(GR-\d{4}-\d+)/i);
  return m ? m[1] : null;
}

/** src/lib/admission-utils.ts:13 */
function normalizeStudentName(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** src/lib/student-status.ts */
const INACTIVE_STATUSES = new Set(["left", "failed", "removed"]);
function isInactiveStatus(status) {
  const s = String(status ?? "").trim().toLowerCase();
  return s ? INACTIVE_STATUSES.has(s) : false;
}

/**
 * A usable Indian mobile for WhatsApp: 10 digits starting 6-9,
 * tolerating +91 / 91 / 0 prefixes and spaces/dashes.
 * Returns null when unusable. The number itself is never logged.
 */
function normalizeMobile(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(d.length - 10);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10) return null;
  if (!/^[6-9]/.test(d)) return null;
  return d;
}

// --- read the two tabs -------------------------------------------------------

// "Fee details": 3 header rows, data from row 4. A=srNo B=name C=class G=notes
const FEE_DATA_START_ROW = 4;
const feeRows = await getRange("'Fee details'!A:Z");
const fees = [];
for (let i = FEE_DATA_START_ROW - 1; i < feeRows.length; i++) {
  const row = feeRows[i] ?? [];
  const srNo = String(row[0] ?? "").trim();
  const name = String(row[1] ?? "").trim();
  if (!srNo || !name || name === "Students Name") continue;
  fees.push({
    srNo,
    studentName: name,
    className: String(row[2] ?? "").trim(),
    notes: String(row[6] ?? "").trim(),
    sheetRow: i + 1,
  });
}

// "Admissions": 1 header row, data from row 2. Columns resolved by header name.
const admRows = await getRange("Admissions!A:AS");
const admHeaders = (admRows[0] ?? []).map((h) => String(h ?? "").trim());
const colOf = (h) => admHeaders.indexOf(h);
const C = {
  grNo: colOf("Gr No"),
  fullName: colOf("Full Name"),
  standard: colOf("Standard"),
  studentContact: colOf("Student Contact"),
  fatherContact: colOf("Father Contact"),
  motherContact: colOf("Mother Contact"),
  status: colOf("Status"),
};
for (const [k, v] of Object.entries(C)) {
  if (v === -1) {
    console.error(`FATAL: Admissions tab has no "${k}" column. Headers found:\n${admHeaders.join(" | ")}`);
    process.exit(1);
  }
}

const admissions = [];
for (let i = 1; i < admRows.length; i++) {
  const row = admRows[i] ?? [];
  const grNo = String(row[C.grNo] ?? "").trim();
  const fullName = String(row[C.fullName] ?? "").trim();
  if (!grNo && !fullName) continue;
  admissions.push({
    grNo,
    fullName,
    standard: String(row[C.standard] ?? "").trim(),
    status: String(row[C.status] ?? "").trim(),
    father: normalizeMobile(row[C.fatherContact]),
    mother: normalizeMobile(row[C.motherContact]),
    student: normalizeMobile(row[C.studentContact]),
    rawFather: String(row[C.fatherContact] ?? "").trim(),
    rawMother: String(row[C.motherContact] ?? "").trim(),
    rawStudent: String(row[C.studentContact] ?? "").trim(),
  });
}

// --- indexes -----------------------------------------------------------------

const byGr = new Map();
for (const a of admissions) if (a.grNo) byGr.set(a.grNo.toLowerCase(), a);

// Name index — used ONLY to measure how much a name fallback would buy us.
// Names that appear more than once are marked ambiguous and never counted as a match.
const byName = new Map();
for (const a of admissions) {
  const k = normalizeStudentName(a.fullName);
  if (!k) continue;
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(a);
}

// Inactive keys — src/lib/sheets/fees-inactive.ts
const activeNameKeys = new Set();
for (const a of admissions) if (!isInactiveStatus(a.status)) activeNameKeys.add(normalizeStudentName(a.fullName));
const inactiveKeys = new Set();
for (const a of admissions) {
  if (isInactiveStatus(a.status)) {
    const k = normalizeStudentName(a.fullName);
    if (!activeNameKeys.has(k)) inactiveKeys.add(k);
    if (a.grNo) inactiveKeys.add(a.grNo.toLowerCase());
  }
}
function feeIsInactive(f) {
  if (inactiveKeys.has(normalizeStudentName(f.studentName))) return true;
  const gr = parseGrNoFromNotes(f.notes);
  if (gr && inactiveKeys.has(gr.toLowerCase())) return true;
  if (/STATUS:\s*(Left|Failed|Removed)/i.test(f.notes)) return true;
  return false;
}

// --- the audit ---------------------------------------------------------------

const active = fees.filter((f) => !feeIsInactive(f));

const stats = {
  feeRowsTotal: fees.length,
  inactive: fees.length - active.length,
  active: active.length,
  grPresent: 0,
  grMissing: 0,
  grUnmatched: 0,
  resolvedViaGr: 0,
  withNumberViaGr: 0,
  bothParents: 0,
  oneParent: 0,
  studentContactOnly: 0,
  noNumber: 0,
  malformedNumber: 0,
  nameFallbackWouldHelp: 0,
  nameFallbackAmbiguous: 0,
};

const duplicateFeeNames = new Map();
for (const f of active) {
  const k = normalizeStudentName(f.studentName);
  duplicateFeeNames.set(k, (duplicateFeeNames.get(k) ?? 0) + 1);
}

const gaps = [];
const byClassCoverage = new Map();

for (const f of active) {
  const gr = parseGrNoFromNotes(f.notes);
  let adm = null;
  let route = "";

  if (gr) {
    stats.grPresent += 1;
    adm = byGr.get(gr.toLowerCase()) ?? null;
    if (adm) {
      stats.resolvedViaGr += 1;
      route = "gr";
    } else {
      stats.grUnmatched += 1;
    }
  } else {
    stats.grMissing += 1;
  }

  // Measure (do not use) what an exact-name fallback would recover.
  if (!adm) {
    const candidates = byName.get(normalizeStudentName(f.studentName)) ?? [];
    if (candidates.length === 1) {
      const c = candidates[0];
      if (c.father || c.mother || c.student) stats.nameFallbackWouldHelp += 1;
    } else if (candidates.length > 1) {
      stats.nameFallbackAmbiguous += 1;
    }
  }

  const parents = adm ? [adm.father, adm.mother].filter(Boolean) : [];
  const hasParent = parents.length > 0;
  const hasStudentOnly = !hasParent && !!adm?.student;

  if (hasParent) {
    stats.withNumberViaGr += 1;
    if (adm.father && adm.mother && adm.father !== adm.mother) stats.bothParents += 1;
    else stats.oneParent += 1;
  } else if (hasStudentOnly) {
    stats.studentContactOnly += 1;
  } else {
    stats.noNumber += 1;
  }

  if (adm) {
    const rawAny = [adm.rawFather, adm.rawMother].some((r) => r && !normalizeMobile(r));
    if (rawAny) stats.malformedNumber += 1;
  }

  const cls = f.className || "(no class)";
  const bucket = byClassCoverage.get(cls) ?? { total: 0, covered: 0 };
  bucket.total += 1;
  if (hasParent) bucket.covered += 1;
  byClassCoverage.set(cls, bucket);

  if (!hasParent) {
    gaps.push({
      srNo: f.srNo,
      studentName: f.studentName,
      className: f.className,
      sheetRow: f.sheetRow,
      grInNotes: gr ?? "",
      reason: !gr
        ? "no GR in fee notes"
        : !adm
        ? "GR not found on Admissions tab"
        : hasStudentOnly
        ? "only a student contact, no parent number"
        : (adm.rawFather || adm.rawMother)
        ? "parent number present but not a valid 10-digit mobile"
        : "no parent number on Admissions tab",
      duplicateName: (duplicateFeeNames.get(normalizeStudentName(f.studentName)) ?? 0) > 1 ? "YES" : "",
    });
  }
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

// --- report (no phone numbers, ever) ----------------------------------------

console.log("");
console.log("═══ Parent-contact coverage audit ═══");
console.log(`Fee rows read:            ${stats.feeRowsTotal}`);
console.log(`  inactive (Left/Failed): ${stats.inactive}`);
console.log(`  ACTIVE STUDENTS:        ${stats.active}   ← the denominator`);
console.log("");
console.log("── The join chain ──");
console.log(`GR number in fee notes:   ${stats.grPresent} (${pct(stats.grPresent, stats.active)}%)`);
console.log(`  missing entirely:       ${stats.grMissing}`);
console.log(`  present but no match:   ${stats.grUnmatched}`);
console.log(`Matched an admission row: ${stats.resolvedViaGr} (${pct(stats.resolvedViaGr, stats.active)}%)`);
console.log("");
console.log("── HEADLINE ──");
console.log(
  `Students with >=1 usable parent mobile: ${stats.withNumberViaGr} of ${stats.active}  =  ${pct(
    stats.withNumberViaGr,
    stats.active
  )}%`
);
console.log("");
console.log("── Breakdown ──");
console.log(`  both father + mother:   ${stats.bothParents}`);
console.log(`  exactly one parent:     ${stats.oneParent}`);
console.log(`  student contact only:   ${stats.studentContactOnly}  (not a parent — excluded)`);
console.log(`  no number at all:       ${stats.noNumber}`);
console.log(`  malformed number seen:  ${stats.malformedNumber}  (present but not a valid 10-digit mobile)`);
console.log("");
console.log("── If we added a name-based fallback (we should NOT — here for sizing only) ──");
console.log(`  would recover:          ${stats.nameFallbackWouldHelp}`);
console.log(`  ambiguous duplicates:   ${stats.nameFallbackAmbiguous}  ← why name matching is unsafe`);
console.log("");
console.log("── Coverage by class ──");
const classRows = [...byClassCoverage.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
for (const [cls, b] of classRows) {
  const p = pct(b.covered, b.total);
  const bar = "█".repeat(Math.round(p / 5)).padEnd(20, "░");
  console.log(`  ${cls.padEnd(12)} ${bar} ${String(b.covered).padStart(3)}/${String(b.total).padEnd(3)} ${p}%`);
}
console.log("");

if (outPath) {
  const header = "Sr No,Student Name,Class,Fee sheet row,GR in notes,Reason,Duplicate name\n";
  const csv =
    header +
    gaps
      .map((g) =>
        [g.srNo, g.studentName, g.className, g.sheetRow, g.grInNotes, g.reason, g.duplicateName]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
  writeFileSync(outPath, csv);
  console.log(`Gap list (${gaps.length} students) written to: ${outPath}`);
  console.log("This file contains student names — keep it out of git.");
} else {
  console.log(`${gaps.length} students have no usable parent number. Re-run with --out <path> for the list.`);
}
console.log("");
