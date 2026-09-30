/**
 * Integration check for the student-records + calendar + absence stream.
 * Runs against the TEST spreadsheet only. Prints counts, never names or phone numbers.
 *
 *   npx tsx scripts/verify-records-stream.ts
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const TEST_SHEET = "1VUEptFDTPdybJvpjiGribCHezMDMALvmRkgc_pg7DxY";

// --- env (no dotenv dependency in this repo) ---
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (process.env.FEES_SHEET_ID !== TEST_SHEET) {
  console.error("ABORT: FEES_SHEET_ID is not the TEST spreadsheet.");
  process.exit(1);
}

let failures = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const { getSheetsClient, FEES_SHEET_ID } = await import("../src/lib/sheets/client");
  const { withSheetRetry } = await import("../src/lib/sheets/retry");
  const { invalidateSheetCache } = await import("../src/lib/sheets/read-cache");
  const cal = await import("../src/lib/sheets/school-calendar");
  const guard = await import("../src/lib/attendance/calendar-guard");
  const rec = await import("../src/lib/sheets/student-records");
  const recLib = await import("../src/lib/student-records/records");
  const { buildChronicAbsenceReport } = await import("../src/lib/attendance/absence-report");
  const { buildDailyAttendanceSummary, todayIsoInTimeZone } = await import("../src/lib/attendance/daily-summary");
  const sc = await import("../src/lib/attendance/school-calendar");
  const { getAllFees } = await import("../src/lib/sheets/fees");
  const { readAllAttendanceRows } = await import("../src/lib/sheets/attendance");
  const { getAttendanceClassSummaries } = await import("../src/lib/attendance/students");
  const { getResolvedParentContacts } = await import("../src/lib/sheets/parent-contacts");
  const { buildAbsenceEmailText, buildAbsenceEmailSubject } = await import("../src/lib/email/attendance-absence-template");

  if (FEES_SHEET_ID !== TEST_SHEET) throw new Error("client resolved a different sheet id");
  const sheets = getSheetsClient();
  const q = (t: string) => `'${t.replace(/'/g, "''")}'`;

  async function titles(): Promise<{ title: string; sheetId: number }[]> {
    const meta = await withSheetRetry(() =>
      sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID, fields: "sheets.properties(title,sheetId)" })
    );
    return (meta.data.sheets ?? []).map((s) => ({ title: s.properties!.title!, sheetId: s.properties!.sheetId! }));
  }

  /** header rows + row count + content hash for the existing school tabs. */
  async function snapshot() {
    const all = await titles();
    const watch = all.filter(
      (t) => t.title === "Fee details" || t.title === "Admissions" || t.title === "UDISE" || t.title.startsWith("Attendance · ")
    );
    const res = await withSheetRetry(() =>
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: FEES_SHEET_ID,
        ranges: watch.map((t) => q(t.title)),
        valueRenderOption: "UNFORMATTED_VALUE",
      })
    );
    const out: Record<string, { rows: number; header: string; hash: string }> = {};
    watch.forEach((t, i) => {
      const values = (res.data.valueRanges?.[i]?.values ?? []) as unknown[][];
      const headerN = t.title === "Fee details" ? 3 : t.title.startsWith("Attendance · ") ? 2 : 1;
      // "Fee details" row 2 is a live totals row and other sessions post payments to the TEST
      // sheet concurrently, so for that tab only header rows 1 and 3 and the row count are compared.
      const isFees = t.title === "Fee details";
      out[t.title] = {
        rows: values.length,
        header: JSON.stringify(isFees ? [values[0], values[2]] : values.slice(0, headerN)),
        hash: isFees ? "n/a" : crypto.createHash("sha1").update(JSON.stringify(values)).digest("hex"),
      };
    });
    return { out, tabs: all.map((t) => t.title) };
  }

  async function deleteRowsWhere(title: string, pred: (row: string[]) => boolean): Promise<number> {
    const all = await titles();
    const tab = all.find((t) => t.title === title);
    if (!tab) return 0;
    const res = await withSheetRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId: FEES_SHEET_ID, range: q(title) })
    );
    const values = (res.data.values ?? []) as string[][];
    const idx: number[] = [];
    for (let i = 1; i < values.length; i++) if (pred(values[i].map(String))) idx.push(i);
    for (const i of idx.sort((a, b) => b - a)) {
      await withSheetRetry(() =>
        sheets.spreadsheets.batchUpdate({
          spreadsheetId: FEES_SHEET_ID,
          requestBody: {
            requests: [
              { deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: i, endIndex: i + 1 } } },
            ],
          },
        })
      );
    }
    invalidateSheetCache();
    return idx.length;
  }

  const before = await snapshot();
  const tabsBefore = new Set(before.tabs);
  console.log(`Snapshot: ${Object.keys(before.out).length} school tabs (${Object.keys(before.out).filter((t) => t.startsWith("Attendance · ")).length} attendance)`);
  console.log(`Portal tabs present before: School Calendar=${tabsBefore.has("School Calendar")} Student Records=${tabsBefore.has("Student Records")}`);

  const MARK = "ZZ-VERIFY-RECORDS";

  // ---------------- calendar ----------------
  const HOLIDAY_DATE = "2030-01-08"; // a Tuesday far in the future
  const OTHER_DATE = "2030-01-09";
  const entry = await cal.addCalendarEntry(
    { startDate: HOLIDAY_DATE, type: "Holiday", classes: ["5th Std"], title: MARK },
    "verify-script@example.invalid"
  );
  check("calendar: entry added", entry.startDate === HOLIDAY_DATE);
  const rows = await cal.readCalendarRows();
  const mine = rows.find((r) => r.title === MARK);
  check("calendar: entry reads back as active", !!mine && mine.status === "active" && mine.entry?.classes?.[0] === "5th Std");

  const blocked = await guard.attendanceBlockedReason(HOLIDAY_DATE, "5th Std");
  check("guard: rejects holiday for the listed class", !!blocked && /holiday for 5th Std/.test(blocked), blocked ?? "null");
  check("guard: other class is open", (await guard.attendanceBlockedReason(HOLIDAY_DATE, "6th Std")) === null);
  check("guard: next day is open", (await guard.attendanceBlockedReason(OTHER_DATE, "5th Std")) === null);
  check("guard: a Saturday is open by default", (await guard.attendanceBlockedReason("2030-01-12", "5th Std")) === null);
  check("guard: a Sunday is blocked by default", !!(await guard.attendanceBlockedReason("2030-01-13", "5th Std")));

  let cancelled = false;
  try {
    await cal.cancelCalendarEntry(mine!.sheetRow, mine!.date);
    cancelled = true;
  } catch (e) {
    console.log("cancel error:", (e as Error).message);
  }
  check("calendar: cancel succeeds", cancelled);
  check("guard: open again after cancel", (await guard.attendanceBlockedReason(HOLIDAY_DATE, "5th Std")) === null);
  let bad = "";
  try {
    await cal.addCalendarEntry({ startDate: "2030-01-10", endDate: "2030-01-01", type: "Holiday", classes: "All", title: MARK }, "x");
  } catch (e) {
    bad = (e as Error).message;
  }
  check("calendar: invalid range rejected", /before/.test(bad), bad);

  // ---------------- student records ----------------
  const fees = await getAllFees();
  const existingRecords = await rec.readStudentRecordRows();
  const taken = new Set(existingRecords.map((r) => r["Sr No"]));
  const eligible = fees.filter((f) => !taken.has(String(f.srNo)) && recLib.udiseApplies(f.className));
  const pre = fees.find((f) => !taken.has(String(f.srNo)) && !recLib.udiseApplies(f.className));
  check("records: found test students without existing rows", eligible.length >= 2);
  const [s1, s2] = eligible;

  let rejected = "";
  try {
    await rec.saveStudentRecords([{ srNo: String(s1.srNo), fields: { height: "300" } }], "verify");
  } catch (e) {
    rejected = (e as Error).message;
  }
  check("records: out-of-range height rejected before any write", /between 50 and 220/.test(rejected));
  if (pre) {
    let r2 = "";
    try {
      await rec.saveStudentRecords([{ srNo: String(pre.srNo), fields: { udiseStatus: "Updated" } }], "verify");
    } catch (e) {
      r2 = (e as Error).message;
    }
    check("records: UDISE on pre-primary rejected", /pre-primary/.test(r2));
  }
  let r3 = "";
  try {
    await rec.saveStudentRecords([{ srNo: "999999999", fields: { height: "100" } }], "verify");
  } catch (e) {
    r3 = (e as Error).message;
  }
  check("records: unknown Sr No rejected", /not an active student/.test(r3));

  const created = await rec.saveStudentRecords(
    [
      { srNo: String(s1.srNo), fields: { height: "120.5", weight: "22", measuredOn: "2026-09-01", udiseStatus: "Not updated", udiseReason: "Aadhaar missing", udiseNote: MARK } },
      { srNo: String(s2.srNo), fields: { height: "130", weight: "30" } },
    ],
    "verify-script@example.invalid"
  );
  check("records: batch save created 2 rows", created.created === 2 && created.saved === 2, JSON.stringify(created));
  let views = await recRead();
  const v1 = views.find((v) => v.srNo === String(s1.srNo))!;
  check(
    "records: height/weight/UDISE read back",
    v1.height === "120.5" && v1.weight === "22" && v1.measuredOn === "2026-09-01" && v1.udiseStatus === "Not updated" && v1.udiseReason === "Aadhaar missing" && v1.udiseNote === MARK
  );
  check("records: udise pending list includes the student", recLib.udisePendingList(views, "Aadhaar missing").some((v) => v.srNo === v1.srNo));

  const again = await rec.saveStudentRecords([{ srNo: String(s1.srNo), fields: { height: "120.5" } }], "verify");
  check("records: re-saving identical values is a no-op", again.saved === 0 && again.unchanged === 1, JSON.stringify(again));
  const upd = await rec.saveStudentRecords([{ srNo: String(s1.srNo), fields: { height: "121" } }], "verify");
  views = await recRead();
  check("records: update of existing row (no duplicate row)", upd.created === 0 && upd.saved === 1 && views.find((v) => v.srNo === v1.srNo)!.height === "121");
  const raw = await rec.readStudentRecordRows();
  check("records: exactly one row per Sr No", raw.filter((r) => r["Sr No"] === v1.srNo).length === 1);

  async function recRead() {
    return rec.getStudentRecordViews(); // keyed-tab cache is invalidated by every save
  }

  // ---------------- absence + 7:30 summary (counts only) ----------------
  const today = todayIsoInTimeZone();
  const t0 = Date.now();
  const report = await buildChronicAbsenceReport(today);
  console.log(`absence (${today}): flagged=${report.flagged.length} everyDay=${report.absentEveryDay.length} classes=${report.countsByClass.length} in ${Date.now() - t0}ms`);
  check("absence: computed without error", Array.isArray(report.flagged));
  const contacts = await getResolvedParentContacts();
  const text = buildAbsenceEmailText(report, (sr) => contacts.get(sr));
  check("absence: email text renders", text.length > 0 && buildAbsenceEmailSubject(report).length > 0, `${text.length} chars`);

  const [classes, entries] = await Promise.all([getAttendanceClassSummaries(), cal.readCalendarEntries()]);
  const school = sc.isSchoolDayForAnyClass(today, classes.map((c) => c.className), entries);
  const summary = await buildDailyAttendanceSummary(today);
  const unmarked = summary.unmarkedClasses.filter((c) => sc.isSchoolDay(today, c, entries));
  console.log(`7:30 summary: schoolDay=${school} classesMarked=${summary.byClass.length} unmarked=${unmarked.length}/${summary.unmarkedClasses.length}`);
  check("summary: builder runs", typeof summary.overallRate === "number");

  // absence cron handler: skip reasons (dry run, sends nothing)
  const { NextRequest } = await import("next/server");
  const cron = await import("../src/app/api/cron/attendance-absence-alert/route");
  const h = { authorization: `Bearer ${process.env.CRON_SECRET}` };
  const call = async (qs: string) => {
    const r = await cron.GET(new NextRequest(`http://x/api/cron/attendance-absence-alert?dryRun=1${qs}`, { headers: h }));
    return (await r.json()) as { skipped?: boolean; reason?: string };
  };
  if (school && summary.byClass.length === 0) {
    const r = await call("");
    check("cron: skips with 'no attendance marked today' when nothing marked", r.skipped === true && r.reason === "no attendance marked today", JSON.stringify(r));
  } else {
    console.log("cron: today has marks or is not a school day, skip check not applicable now");
  }
  const sun = await call("&date=2026-09-27");
  check("cron: Sunday is 'not a school day'", sun.reason === "not a school day");

  const all = await readAllAttendanceRows();
  const weekend = all.filter((r) => [0, 6].includes(sc.weekdayOf(r.date))).length;
  console.log(`attendance rows total=${all.length}, dated on Sat/Sun=${weekend} (Sundays ignored by the default calendar rule)`);

  // ---------------- cleanup ----------------
  const delCal = await deleteRowsWhere("School Calendar", (r) => r.some((c) => c.includes(MARK)));
  const sr = new Set([String(s1.srNo), String(s2.srNo)]);
  const delRec = await deleteRowsWhere("Student Records", (r) => sr.has(r[0]));
  console.log(`cleanup: removed ${delCal} calendar row(s), ${delRec} student-record row(s)`);
  check("cleanup: removed what was created", delCal >= 1 && delRec === 2);
  const leftoverCal = (await cal.readCalendarRows()).filter((r) => r.title.includes(MARK)).length;
  const leftoverRec = (await rec.readStudentRecordRows()).filter((r) => sr.has(r["Sr No"])).length;
  check("cleanup: nothing left behind", leftoverCal === 0 && leftoverRec === 0);

  const after = await snapshot();
  let same = true;
  for (const [t, b] of Object.entries(before.out)) {
    const a = after.out[t];
    if (!a || a.rows !== b.rows || a.header !== b.header || a.hash !== b.hash) {
      same = false;
      console.log(
        `  CHANGED: ${t} (rows ${b.rows}->${a?.rows}, header ${a?.header === b.header ? "same" : "DIFFERENT"}, content hash ${a?.hash === b.hash ? "same" : "differs"})`
      );
    }
  }
  check(`snapshot unchanged (${Object.keys(before.out).length} tabs: header rows, row counts, content hashes)`, same);
  const newTabs = after.tabs.filter((t) => !tabsBefore.has(t));
  console.log(`new tabs created by this run: ${newTabs.join(", ") || "none"}`);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(2);
});
