/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Stream A integration check — runs the REAL route handlers and sheet helpers against the
 * TEST spreadsheet, then reverts everything it created and re-asserts the sheet is unchanged.
 *
 *   npx vitest run --config vitest.integration.config.ts
 *
 * Prints counts and pass/fail only — no names or phone numbers.
 */
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { describe, expect, it, vi } from "vitest";

const TEST_SHEET_ID = "1VUEptFDTPdybJvpjiGribCHezMDMALvmRkgc_pg7DxY";
// Hard stop before touching anything.
if (process.env.FEES_SHEET_ID !== TEST_SHEET_ID) {
  throw new Error("ABORT: FEES_SHEET_ID is not the TEST spreadsheet.");
}

vi.mock("next/cache", () => ({ revalidateTag: () => {}, revalidatePath: () => {} }));

import { getSheetsClient, FEES_SHEET_ID } from "@/lib/sheets/client";
import { columnLetter } from "@/lib/sheets/keyed-tab";
import { invalidateSheetCache } from "@/lib/sheets/read-cache";
import { getAllDailyEntries, deleteDailyEntry, appendDailyEntry } from "@/lib/sheets/dailyLog";
import {
  getAllOtherFeeEntries,
} from "@/lib/sheets/otherFeesLog";
import { getAllFees, getFeeBySrNo, type FeeRecord } from "@/lib/sheets/fees";
import { FEE_FOLLOWUPS_SHEET, readFeeFollowUps } from "@/lib/sheets/fee-followups";
import {
  PARENT_CONTACTS_SHEET,
  PARENT_CONTACT_HEADERS,
  readParentContacts,
} from "@/lib/sheets/parent-contacts";
import { saveAllOrNothing } from "@/lib/fees/split-payment";
import { todayIsoInTimeZone } from "@/lib/attendance/daily-summary";

import { POST as dailyPost, DELETE as dailyDelete, GET as dailyGet } from "@/app/api/daily-entry/route";
import { POST as otherPost, DELETE as otherDelete } from "@/app/api/other-fees/route";
import { GET as receiptSearch } from "@/app/api/receipts/search/route";
import { GET as followUpGet, POST as followUpPost } from "@/app/api/fee-followups/route";
import { GET as contactGet, PUT as contactPut } from "@/app/api/parent-contact/route";
import { GET as pendingGet } from "@/app/api/pending-report/route";
import { GET as cronGet } from "@/app/api/cron/fee-followups/route";

/**
 * The service account's Sheets quota (60 reads/min) is shared with the live portal, so this
 * script paces itself: at most one Sheets API call every PACE_MS, whatever the app code does.
 */
const PACE_MS = 3000;
let lastCall = 0;
let chain: Promise<unknown> = Promise.resolve();
function paced<T extends (...a: any[]) => Promise<any>>(fn: T, self: unknown): T {
  return ((...args: any[]) => {
    const run = chain.then(async () => {
      const wait = lastCall + PACE_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      return fn.apply(self, args);
    });
    chain = run.catch(() => undefined);
    return run;
  }) as T;
}
function throttleSheets() {
  const s: any = getSheetsClient();
  for (const [obj, names] of [
    [s.spreadsheets, ["get", "batchUpdate"]],
    [s.spreadsheets.values, ["get", "update", "append", "batchUpdate", "clear", "batchClear", "batchGet"]],
  ] as [any, string[]][]) {
    for (const n of names) {
      if (obj[n] && !obj[n].__paced) {
        obj[n] = paced(obj[n], obj);
        obj[n].__paced = true;
      }
    }
  }
}

const TABS = ["Fee details", "Daily Fees Log", "Other Fees Log", "Admissions"] as const;
const RUN = Date.now().toString(36);
const TODAY = todayIsoInTimeZone();
const log = (...a: unknown[]) => console.log("[verify]", ...a);

type Grid = string[][];

async function snapshot(): Promise<Record<string, Grid>> {
  const sheets = getSheetsClient();
  const out: Record<string, Grid> = {};
  for (const t of TABS) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: FEES_SHEET_ID,
      range: `'${t}'!A1:AZ`,
      valueRenderOption: "FORMULA",
    });
    out[t] = ((res.data.values ?? []) as unknown[][]).map((r) => r.map((c) => String(c ?? "")));
  }
  return out;
}

/** Cell-level diff of two grids → list of "A1" refs that changed (trailing blanks ignored). */
function diff(before: Grid, after: Grid): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = [];
  const rows = Math.max(before.length, after.length);
  for (let r = 0; r < rows; r++) {
    const a = before[r] ?? [];
    const b = after[r] ?? [];
    const cols = Math.max(a.length, b.length);
    for (let c = 0; c < cols; c++) {
      if ((a[c] ?? "") !== (b[c] ?? "")) out.push({ row: r + 1, col: c });
    }
  }
  return out;
}

/**
 * "Other Fees Log" has formula-only rows below the data (I-K prefilled to row ~990). Every real
 * row delete (existing behaviour of the delete button) removes one of them, so compare with
 * that formula-only tail trimmed from both sides.
 */
function trimFormulaTail(grid: Grid): Grid {
  let end = grid.length;
  const isTail = (r: string[]) => r.every((c, i) => (i >= 8 && i <= 10) || (c ?? "") === "");
  while (end > 1 && isTail(grid[end - 1] ?? [])) end--;
  return grid.slice(0, end);
}

function dataRowCount(grid: Grid, keyCol = 0): number {
  return grid.slice(1).filter((r) => (r[keyCol] ?? "").trim() !== "").length;
}

let cookie = "";
async function authCookie() {
  const email = (process.env.FEES_ALLOWED_EMAILS ?? "").split(",")[0]?.trim() || "verify@example.com";
  const token = await encode({
    token: { email, name: "Verify Script" },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  return `next-auth.session-token=${token}; __Secure-next-auth.session-token=${token}`;
}

function req(url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: init?.method ?? "GET",
    headers: { cookie, "content-type": "application/json", ...(init?.headers ?? {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function json(res: Response) {
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, any> };
}

async function deleteRowsInTab(title: string, sheetRows: number[]) {
  if (sheetRows.length === 0) return;
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID, fields: "sheets.properties" });
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === title)?.properties?.sheetId;
  if (sheetId == null) throw new Error(`tab ${title} missing`);
  // Bottom-up so indexes stay valid.
  const requests = [...sheetRows]
    .sort((a, b) => b - a)
    .map((r) => ({
      deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: r - 1, endIndex: r } },
    }));
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: FEES_SHEET_ID, requestBody: { requests } });
}

let flakeRetries = 0;
/** POST a payment; if Sheets fails to confirm a write (rolled back, nothing kept), retry - and count it. */
async function postPayment(body: Record<string, unknown>) {
  for (let attempt = 0; ; attempt++) {
    const r = await json(await dailyPost(req("/api/daily-entry", { method: "POST", body })));
    if (r.status === 500 && /could not be confirmed/.test(String(r.body.error)) && attempt < 2) {
      flakeRetries++;
      log("write not confirmed by Sheets; rolled back; retrying (", flakeRetries, ")");
      continue;
    }
    return r;
  }
}

function feeTotals(f: FeeRecord) {
  return { q1: f.q1Paid, q2: f.q2Paid, q3: f.q3Paid, q4: f.q4Paid, paid: f.totalPaid, balance: f.balance, fee: f.totalFee };
}

const state: { contactsBefore?: Awaited<ReturnType<typeof readParentContacts>>[number]; srNo?: string; contactTouched: boolean } = {
  contactTouched: false,
};

/** Rows created by this script: marker comment, or one of the receipt shapes it uses. */
function isMine(note: string | undefined, receipt: string | undefined): boolean {
  return /^(verify script|rollback probe)/.test(note ?? "") || /^(VFY|RB-|VFYO-)|^000\d{5}$/.test(receipt ?? "");
}

/** Remove anything a previous (possibly failed) run left behind, via the real delete paths. */
async function cleanupOrphans() {
  invalidateSheetCache();
  for (const e of await getAllDailyEntries()) {
    if (!isMine(e.comment, e.receiptNo)) continue;
    await dailyDelete(
      req("/api/daily-entry", {
        method: "DELETE",
        body: { entryId: e.id, studentName: e.studentName, srNo: e.srNo, date: e.date, amount: e.amount, feeMonth: e.feeMonth },
      })
    );
    invalidateSheetCache();
  }
  for (const e of await getAllOtherFeeEntries()) {
    if (!isMine(e.notes, e.receiptNo)) continue;
    await otherDelete(
      req("/api/other-fees", {
        method: "DELETE",
        body: { entryId: e.id, srNo: e.srNo, date: e.date, amount: e.amount, feeType: e.feeType },
      })
    );
    invalidateSheetCache();
  }
  invalidateSheetCache();
  const fu = (await readFeeFollowUps()).filter((x) => x.parentSaid.startsWith("verify-"));
  await deleteRowsInTab(FEE_FOLLOWUPS_SHEET, fu.map((x) => x.sheetRow));
  if (state.contactTouched) {
    invalidateSheetCache();
    const { updateKeyedRow } = await import("@/lib/sheets/keyed-tab");
    if (state.contactsBefore) {
      const fields: Record<string, string> = {};
      for (const h of PARENT_CONTACT_HEADERS) if (h !== "Sr No") fields[h] = state.contactsBefore[h];
      await updateKeyedRow(PARENT_CONTACTS_SHEET, PARENT_CONTACT_HEADERS, state.contactsBefore.sheetRow, fields, {
        header: "Sr No",
        value: state.srNo!,
      });
    } else {
      const cur = (await readParentContacts()).filter((c) => c["Sr No"] === state.srNo && c["Parent Name"] === "Verify Parent");
      await deleteRowsInTab(PARENT_CONTACTS_SHEET, cur.map((c) => c.sheetRow));
    }
    state.contactTouched = false;
  }
  invalidateSheetCache();
}

describe("Stream A against the TEST sheet", () => {
  it("runs end to end and leaves the sheet as it found it", async () => {
    expect(FEES_SHEET_ID).toBe(TEST_SHEET_ID);
    throttleSheets();
    cookie = await authCookie();

    try {
    // ---- 0. Snapshot ---------------------------------------------------------------------
    await cleanupOrphans(); // leftovers of an earlier failed run, if any
    const before = await snapshot();
    const counts = Object.fromEntries(TABS.map((t) => [t, dataRowCount(before[t], t === "Fee details" ? 0 : 0)]));
    log("row counts before", JSON.stringify(counts));
    log("headers before: DailyLog", JSON.stringify(before["Daily Fees Log"][0]), "OtherLog", JSON.stringify(before["Other Fees Log"][0]));

    // ---- 1. Pick a clean test student -----------------------------------------------------
    invalidateSheetCache();
    const fees = await getAllFees();
    const dailyAll = await getAllDailyEntries();
    const otherAll = await getAllOtherFeeEntries();
    const nameCount = new Map<string, number>();
    for (const f of fees) nameCount.set(f.studentName, (nameCount.get(f.studentName) ?? 0) + 1);
    const student = fees.find(
      (f) =>
        f.totalFee >= 8000 &&
        nameCount.get(f.studentName) === 1 &&
        f.totalPaid === 0 &&
        !dailyAll.some((e) => e.srNo === f.srNo) &&
        !otherAll.some((e) => e.srNo === f.srNo)
    );
    if (!student) throw new Error("no clean test student available");
    const srNo = student.srNo;
    const original = feeTotals(student);
    const feeRowBefore = student.sheetRow;
    log("test student srNo", srNo, "row", feeRowBefore, "class", student.className, "original totals", JSON.stringify(original));

    const createdDaily: string[] = [];
    const createdOther: string[] = [];

    // ---- 2. Split payment (equal amounts on purpose) via the real POST route ------------------
    const receipt = `VFY-${RUN}`;
    let r = await postPayment({
            srNo,
            studentName: student.studentName,
            date: TODAY,
            paymentMode: "split",
            cashAmount: 500,
            onlineAmount: 500,
            comment: "verify script",
            receiptNo: receipt,
          });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.rows).toBe(2);

    invalidateSheetCache();
    let entries = (await getAllDailyEntries()).filter((e) => e.srNo === srNo);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.paymentMode).sort()).toEqual(["cash", "online"]);
    expect(entries.every((e) => e.receiptNo === receipt && e.date === TODAY && e.amount === 500)).toBe(true);
    expect(entries.every((e) => e.comment === "verify script (split: ₹500 cash + ₹500 online)")).toBe(true);
    const fresh = (await getFeeBySrNo(srNo))!;
    const splitTotals = feeTotals(fresh);
    expect(fresh.totalPaid).toBe(1000);
    log("split saved: 2 rows, same receipt, totals paid =", fresh.totalPaid);

    // Same totals as two separate payments: compare to a second student-independent calc.
    // (Fee details are rebuilt from the whole log, so 500+500 as one split == two singles.)
    // Delete the split and record two SEPARATE payments, then compare the resulting totals.
    for (const e of entries) {
      r = await json(
        await dailyDelete(
          req("/api/daily-entry", {
            method: "DELETE",
            body: { entryId: e.id, studentName: student.studentName, srNo, date: e.date, amount: e.amount, feeMonth: e.feeMonth },
          })
        )
      );
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
    invalidateSheetCache();
    expect((await getAllDailyEntries()).filter((e) => e.srNo === srNo)).toHaveLength(0);
    expect(feeTotals((await getFeeBySrNo(srNo))!)).toEqual(original);
    log("delete of one-of-two identical-amount rows works; totals back to original");

    for (const mode of ["cash", "online"] as const) {
      r = await postPayment({ srNo, studentName: student.studentName, date: TODAY, paymentMode: mode, amount: 500, comment: "verify script" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
    invalidateSheetCache();
    const separateTotals = feeTotals((await getFeeBySrNo(srNo))!);
    expect(separateTotals).toEqual(splitTotals);
    log("split totals == two separate payments' totals: OK");
    for (const e of (await getAllDailyEntries()).filter((x) => x.srNo === srNo)) {
      await json(
        await dailyDelete(
          req("/api/daily-entry", {
            method: "DELETE",
            body: { entryId: e.id, studentName: student.studentName, srNo, date: e.date, amount: e.amount, feeMonth: e.feeMonth },
          })
        )
      );
    }
    invalidateSheetCache();
    expect(feeTotals((await getFeeBySrNo(srNo))!)).toEqual(original);

    // ---- 3. Split again (kept for the read/search/pending checks) + numeric receipt ----------
    r = await postPayment({ srNo, studentName: student.studentName, date: TODAY, paymentMode: "split", cashAmount: 700, onlineAmount: 300, receiptNo: receipt, comment: "verify script" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const numericReceipt = "000" + String(Date.now()).slice(-5); // leading zeros must survive
    r = await postPayment({ srNo, studentName: student.studentName, date: TODAY, paymentMode: "cash", amount: 100, receiptNo: numericReceipt, comment: "verify script" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    invalidateSheetCache();
    entries = (await getAllDailyEntries()).filter((e) => e.srNo === srNo);
    expect(entries).toHaveLength(3);
    expect(entries.find((e) => e.amount === 100)!.receiptNo).toBe(numericReceipt);
    expect((await getFeeBySrNo(srNo))!.totalPaid).toBe(1100);
    log("numeric receipt with leading zeros round-trips as text: OK");

    // Validation errors surface (no silent fallback)
    r = await postPayment({ srNo, studentName: student.studentName, date: TODAY, paymentMode: "split", cashAmount: 100, onlineAmount: 0 });
    expect(r.status).toBe(400);
    r = await postPayment({ srNo, studentName: student.studentName, date: TODAY, paymentMode: "cash", amount: 5, receiptNo: "=1+1" });
    expect(r.status).toBe(400);

    // ---- 4. Receipt search ---------------------------------------------------------------
    r = await json(await receiptSearch(req(`/api/receipts/search?q=${encodeURIComponent(receipt)}`)));
    expect(r.status).toBe(200);
    expect(r.body.hits).toHaveLength(2);
    expect(r.body.hits.map((h: any) => h.paymentMode).sort()).toEqual(["cash", "online"]);
    expect(r.body.hits.reduce((s: number, h: any) => s + h.amount, 0)).toBe(1000);
    expect(r.body.hits.every((h: any) => h.srNo === srNo && h.date === TODAY && h.kind === "school")).toBe(true);
    r = await json(await receiptSearch(req(`/api/receipts/search?q=${numericReceipt}`)));
    expect(r.body.hits).toHaveLength(1);
    r = await json(await receiptSearch(req(`/api/receipts/search?q=NOPE-${RUN}`)));
    expect(r.body.hits).toHaveLength(0);
    r = await json(await receiptSearch(req(`/api/receipts/search?q=`)));
    expect(r.status).toBe(400);
    log("receipt search: split -> 2 hits summing 1000; numeric receipt -> 1 hit; unknown -> 0; blank -> 400");

    // GET /api/daily-entry exposes receiptNo for the payment history
    const g = await dailyGet(req(`/api/daily-entry?srNo=${srNo}&reconcile=0`));
    const gBody = (await g.json()) as any[];
    expect(gBody.filter((e) => e.receiptNo === receipt)).toHaveLength(2);

    // ---- 5. Other Fees split (Other Fees Log: receipt in the far-right column, I-K untouched) --
    const otherBefore = before["Other Fees Log"];
    const otherReceipt = `VFYO-${RUN}`;
    r = await json(
      await otherPost(
        req("/api/other-fees", {
          method: "POST",
          body: { srNo, studentName: student.studentName, date: TODAY, feeType: "Books", paymentMode: "split", cashAmount: 150, onlineAmount: 50, notes: "verify script", receiptNo: otherReceipt },
        })
      )
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    invalidateSheetCache();
    const others = (await getAllOtherFeeEntries()).filter((e) => e.srNo === srNo);
    expect(others).toHaveLength(2);
    expect(others.every((e) => e.receiptNo === otherReceipt)).toBe(true);
    expect(others.map((e) => e.paymentMode).sort()).toEqual(["cash", "online"]);
    // Columns I..K of every pre-existing row are untouched
    const otherAfter = ((
      await getSheetsClient().spreadsheets.values.get({
        spreadsheetId: FEES_SHEET_ID,
        range: "'Other Fees Log'!A1:AZ",
        valueRenderOption: "FORMULA",
      })
    ).data.values ?? []).map((row) => row.map((c) => String(c ?? ""))) as Grid;
    for (let i = 0; i < otherBefore.length; i++) {
      for (const c of [8, 9, 10]) expect(otherAfter[i]?.[c] ?? "").toBe(otherBefore[i]?.[c] ?? "");
    }
    // receipt column position: header lives at the far right (after Total = K → L)
    const otherHeaders = otherAfter[0];
    const rc = otherHeaders.indexOf("Receipt No");
    log("Other Fees Log 'Receipt No' header at column", columnLetter(rc), "of", otherHeaders.length, "headers");
    expect(rc).toBe(otherHeaders.length - 1);
    r = await json(await receiptSearch(req(`/api/receipts/search?q=${otherReceipt}`)));
    expect(r.body.hits).toHaveLength(2);
    expect(r.body.hits.every((h: any) => h.kind === "other" && h.feeType === "Books")).toBe(true);

    // (compactOtherFeesLog is deliberately NOT run here: it would rewrite every existing row's
    // date cells on the TEST copy. It is covered by code review only - see the report.)

    // ---- 6. Atomic rollback: 2nd part fails -> 1st part removed ----------------------------
    const countBeforeRollback = (await getAllDailyEntries()).length;
    await expect(
      saveAllOrNothing(
        ["ok", "boom"],
        async (p) => {
          if (p === "boom") throw new Error("simulated failure of 2nd row");
          return appendDailyEntry({ date: TODAY, studentName: student.studentName, className: student.className, srNo, amount: 77, feeMonth: 1, paymentMode: "cash", comment: "rollback probe", receiptNo: `RB-${RUN}` });
        },
        (rowId) => deleteDailyEntry(rowId, { srNo, date: TODAY, amount: 77, feeMonth: 1 })
      )
    ).rejects.toThrow("simulated failure");
    invalidateSheetCache();
    const afterRollback = await getAllDailyEntries();
    expect(afterRollback.length).toBe(countBeforeRollback);
    expect(afterRollback.some((e) => e.receiptNo === `RB-${RUN}`)).toBe(false);
    log("rollback probe: Daily Fees Log row count unchanged after failed 2nd part");

    // ---- 7. Follow-up + parent contact --------------------------------------------------------
    const marker = `verify-${RUN}`;
    const yesterday = new Date(Date.parse(`${TODAY}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const followUpsTabExistedBefore = true; // recorded below from snapshot of titles
    void followUpsTabExistedBefore;
    r = await json(
      await followUpPost(
        req("/api/fee-followups", {
          method: "POST",
          body: { srNo, date: yesterday, parentSaid: marker, reason: "verify reason", nextFollowUp: yesterday },
        })
      )
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    r = await json(await followUpPost(req("/api/fee-followups", { method: "POST", body: { srNo, date: TODAY } })));
    expect(r.status).toBe(400); // empty entry rejected
    r = await json(await followUpPost(req("/api/fee-followups", { method: "POST", body: { srNo: "no-such", date: TODAY, parentSaid: "x" } })));
    expect(r.status).toBe(404);
    invalidateSheetCache();
    const fu = (await readFeeFollowUps()).filter((x) => x.parentSaid === marker);
    expect(fu).toHaveLength(1);
    expect(fu[0]).toMatchObject({ srNo, studentName: student.studentName, className: student.className, date: yesterday, reason: "verify reason", nextFollowUp: yesterday });
    expect(fu[0].addedBy.length).toBeGreaterThan(0);
    r = await json(await followUpGet(req(`/api/fee-followups?srNo=${srNo}`)));
    expect(r.body.followUps.some((x: any) => x.parentSaid === marker)).toBe(true);
    log("follow-up appended and read back (tab", FEE_FOLLOWUPS_SHEET, ")");

    // parent contact: remember the original row (if any) to restore it exactly
    const contactsBefore = (await readParentContacts()).find((c) => c["Sr No"] === srNo);
    state.contactsBefore = contactsBefore;
    state.srNo = srNo;
    state.contactTouched = true;
    r = await json(await contactPut(req("/api/parent-contact", { method: "PUT", body: { srNo, parentName: "Verify Parent", primaryPhone: "9000000001", alternatePhone: "+91 90000-00002" } })));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    r = await json(await contactPut(req("/api/parent-contact", { method: "PUT", body: { srNo, primaryPhone: "12345" } })));
    expect(r.status).toBe(400);
    invalidateSheetCache();
    r = await json(await contactGet(req(`/api/parent-contact?srNo=${srNo}`)));
    expect(r.body.contact.phones.slice(0, 2)).toEqual(["9000000001", "9000000002"]);
    expect(r.body.contact.source).toBe("portal");
    log("parent contact upsert + invalid-number rejection + read-back: OK");

    // pending report data + cron dry run
    r = await json(await pendingGet(req("/api/pending-report")));
    expect(r.status).toBe(200);
    expect(r.body.lastPayments[srNo]).toBe(TODAY);
    expect(r.body.latestFollowUps.some((x: any) => x.srNo === srNo && x.parentSaid === marker)).toBe(true);
    const { computePendingReport } = await import("@/lib/fees/pending-report");
    const rows = computePendingReport({ fees: r.body.fees, filter: "any" });
    const mine = rows.find((x) => x.srNo === srNo)!;
    expect(mine.totalPaid).toBe(1100);
    expect(mine.balance).toBe(original.fee - 1100);
    log("pending-report route + pure maths agree for the test student");

    const cronRes = await cronGet(
      new NextRequest("http://localhost:3000/api/cron/fee-followups?dryRun=1", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    );
    const cron = await json(cronRes);
    expect(cron.status, JSON.stringify(cron.body).slice(0, 200)).toBe(200);
    expect(cron.body.dryRun).toBe(true);
    expect(cron.body.count).toBeGreaterThanOrEqual(1);
    expect(cron.body.overdueCount).toBeGreaterThanOrEqual(1);
    expect(String(cron.body.subject)).toMatch(/^Fee follow-ups due: /);
    expect(String(cron.body.text)).toContain(`(Sr No ${srNo})`);
    const unauth = await cronGet(new NextRequest("http://localhost:3000/api/cron/fee-followups?dryRun=1"));
    expect(unauth.status).toBe(401);
    log("cron dry-run: count", cron.body.count, "subject ok, unauthorised -> 401, nothing sent");

    // ---- 8. Revert everything -----------------------------------------------------------------
    // payments via the real delete route (Fee details rebuilt from the log)
    invalidateSheetCache();
    for (const e of (await getAllDailyEntries()).filter((x) => x.srNo === srNo)) {
      r = await json(
        await dailyDelete(
          req("/api/daily-entry", {
            method: "DELETE",
            body: { entryId: e.id, studentName: student.studentName, srNo, date: e.date, amount: e.amount, feeMonth: e.feeMonth },
          })
        )
      );
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      createdDaily.push(e.id);
    }
    invalidateSheetCache();
    for (const e of (await getAllOtherFeeEntries()).filter((x) => x.srNo === srNo)) {
      r = await json(
        await otherDelete(
          req("/api/other-fees", {
            method: "DELETE",
            body: { entryId: e.id, srNo, date: e.date, amount: e.amount, feeType: e.feeType },
          })
        )
      );
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      createdOther.push(e.id);
    }
    // follow-up row(s) and contact row: portal-owned tabs
    const fuRows = (await readFeeFollowUps()).filter((x) => x.parentSaid === marker).map((x) => x.sheetRow);
    await cleanupOrphans();
    invalidateSheetCache();

    // ---- 9. Re-assert ---------------------------------------------------------------------------
    expect(feeTotals((await getFeeBySrNo(srNo))!)).toEqual(original);
    log("Fee details totals back to original:", JSON.stringify(original));

    const after = await snapshot();
    const report: string[] = [];
    for (const t of TABS) {
      const b = t === "Other Fees Log" ? trimFormulaTail(before[t]) : before[t];
      const a2 = t === "Other Fees Log" ? trimFormulaTail(after[t]) : after[t];
      if (t === "Other Fees Log") {
        log("Other Fees Log formula-only tail rows: before", before[t].length - b.length, "after", after[t].length - a2.length);
      }
      const d = diff(b, a2);
      const allowed = d.filter(({ row, col }) => {
        if (t === "Daily Fees Log") return row === 1 && before[t][0]?.[col] === undefined; // new Receipt No header
        if (t === "Other Fees Log") return row === 1 && before[t][0]?.[col] === undefined;
        if (t === "Fee details") return row === feeRowBefore && col <= 25; // the test student's A..Z only
        return false;
      });
      const unexpected = d.filter((x) => !allowed.includes(x));
      report.push(`${t}: rows ${dataRowCount(before[t])} -> ${dataRowCount(after[t])}, changed cells ${d.length}, allowed ${allowed.length}, unexpected ${unexpected.length}`);
      expect(unexpected.map((u) => `${columnLetter(u.col)}${u.row}`), `${t} unexpected diffs`).toEqual([]);
      expect(dataRowCount(after[t])).toBe(dataRowCount(before[t]));
    }
    // any header difference in the logs is exactly the one new "Receipt No" cell
    for (const t of ["Daily Fees Log", "Other Fees Log"] as const) {
      const hb = before[t][0] ?? [];
      const ha = after[t][0] ?? [];
      expect(ha.slice(0, hb.length)).toEqual(hb);
      expect(ha.slice(hb.length).filter(Boolean)).toEqual(hb.includes("Receipt No") ? [] : ["Receipt No"]);
    }
    // Fee details: columns beyond Z (school formulas AA-AF) untouched on every row
    const beyondZ = (g: Grid) => g.map((row) => row.slice(26).join("\u0001"));
    expect(beyondZ(after["Fee details"])).toEqual(beyondZ(before["Fee details"]));
    for (const line of report) log(line);
    log("created/removed: daily rows", createdDaily.length, "other rows", createdOther.length, "follow-up rows", fuRows.length);
    log("flake retries:", flakeRetries);
    log("ALL CHECKS PASSED");
    } finally {
      await cleanupOrphans().catch((e) => log("cleanup after run failed:", (e as Error).message));
    }
  });
});
