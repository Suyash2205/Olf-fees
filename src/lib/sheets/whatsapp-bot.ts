/**
 * Tabs the WhatsApp bot reports into, so the office sees parent status and replies in the portal.
 *
 * - `WhatsApp Parents`: one row per parent number, rewritten as a whole on each report
 *   (the bot owns this data; the tab is a view of it).
 * - `WhatsApp Replies`: append-only log of what parents sent, deduped by the bot's message id.
 *
 * Both are portal-owned tabs; the school's own tabs are never touched.
 */
import { getSheetsClient, FEES_SHEET_ID } from "./client";
import { ensureKeyedTab, readKeyedTab, type TabRow } from "./keyed-tab";
import { invalidateSheetCache } from "./read-cache";
import { withSheetRetry } from "./retry";
import { withSheetWriteLock } from "./sync-lock";

export const WA_PARENTS_SHEET = "WhatsApp Parents";
export const WA_REPLIES_SHEET = "WhatsApp Replies";

export const WA_PARENT_HEADERS = [
  "Phone",
  "Status",
  "Unanswered",
  "Students",
  "Sr Nos",
  "Flagged At",
  "Last Message Sent",
  "Last Reply At",
  "Last Reply",
  "Updated At",
] as const;

export const WA_REPLY_HEADERS = ["Received At", "Phone", "Students", "Message", "Bot Id"] as const;

export type WaParentRow = TabRow<(typeof WA_PARENT_HEADERS)[number]>;
export type WaReplyRow = TabRow<(typeof WA_REPLY_HEADERS)[number]>;

export interface BotReport {
  parents: {
    phone: string;
    srNos: string[];
    status: "ok" | "not_replying" | "stopped";
    unanswered: number;
    flaggedAt: string | null;
    lastSentAt: string | null;
    lastReplyAt: string | null;
    lastReplyText: string | null;
  }[];
  replies: { id: number; phone: string | null; text: string; receivedAt: string }[];
}

const STATUS_LABEL = { ok: "OK", not_replying: "Not replying", stopped: "Stopped messages" } as const;

function quoteTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** Validate the bot's report body; throws with a message on anything malformed. */
export function parseBotReport(body: unknown): BotReport {
  const b = body as BotReport;
  if (!b || !Array.isArray(b.parents) || !Array.isArray(b.replies)) throw new Error("Report must have parents[] and replies[]");
  for (const p of b.parents) {
    if (!/^[6-9]\d{9}$/.test(String(p.phone)) || !Array.isArray(p.srNos) || !(p.status in STATUS_LABEL)) {
      throw new Error(`Bad parent entry for ${String(p?.phone)}`);
    }
  }
  for (const r of b.replies) {
    if (!Number.isInteger(r.id) || typeof r.text !== "string") throw new Error("Bad reply entry");
  }
  return b;
}

/** Pure: the full `WhatsApp Parents` table, not-replying first. */
export function parentTableValues(report: BotReport, studentLabel: (srNo: string) => string, updatedAt: string): string[][] {
  const order = { not_replying: 0, stopped: 1, ok: 2 } as const;
  const rows = [...report.parents]
    .sort((a, b) => order[a.status] - order[b.status] || a.phone.localeCompare(b.phone))
    .map((p) => [
      p.phone,
      STATUS_LABEL[p.status],
      String(p.unanswered),
      p.srNos.map(studentLabel).join("; "),
      p.srNos.join(", "),
      p.flaggedAt ?? "",
      p.lastSentAt ?? "",
      p.lastReplyAt ?? "",
      (p.lastReplyText ?? "").slice(0, 500),
      updatedAt,
    ]);
  return [[...WA_PARENT_HEADERS], ...rows];
}

export async function writeParentTable(values: string[][]): Promise<void> {
  await withSheetWriteLock(async () => {
    await ensureKeyedTab(WA_PARENTS_SHEET, WA_PARENT_HEADERS);
    const sheets = getSheetsClient();
    // Starts at A1 (inside the grid), so Sheets grows the grid as needed.
    await withSheetRetry(() =>
      sheets.spreadsheets.values.clear({ spreadsheetId: FEES_SHEET_ID, range: `${quoteTitle(WA_PARENTS_SHEET)}!A2:J` })
    );
    await withSheetRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: FEES_SHEET_ID,
        range: `${quoteTitle(WA_PARENTS_SHEET)}!A1`,
        valueInputOption: "RAW",
        requestBody: { values },
      })
    );
  });
  invalidateSheetCache(`keyed-tab:${WA_PARENTS_SHEET}`);
}

export async function readWaParents(): Promise<WaParentRow[]> {
  return readKeyedTab(WA_PARENTS_SHEET, WA_PARENT_HEADERS, 60_000);
}

export async function readWaReplies(): Promise<WaReplyRow[]> {
  return readKeyedTab(WA_REPLIES_SHEET, WA_REPLY_HEADERS, 60_000);
}

/** Append replies not already logged (a retried report must not duplicate them). Returns how many were added. */
export async function appendReplies(report: BotReport, studentsForPhone: (phone: string | null) => string): Promise<number> {
  if (report.replies.length === 0) return 0;
  const existing = new Set((await readWaReplies()).map((r) => r["Bot Id"]));
  const fresh = report.replies.filter((r) => !existing.has(String(r.id)));
  if (fresh.length === 0) return 0;
  await withSheetWriteLock(async () => {
    await ensureKeyedTab(WA_REPLIES_SHEET, WA_REPLY_HEADERS);
    const sheets = getSheetsClient();
    const header = await withSheetRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId: FEES_SHEET_ID, range: `${quoteTitle(WA_REPLIES_SHEET)}!1:1` })
    );
    const cols = (header.data.values?.[0] ?? []).map((v) => String(v ?? "").trim());
    const rows = fresh.map((r) => {
      const rec: Record<string, string> = {
        "Received At": r.receivedAt,
        Phone: r.phone ?? "(hidden number)",
        Students: studentsForPhone(r.phone),
        Message: r.text.slice(0, 2000),
        "Bot Id": String(r.id),
      };
      return cols.map((c) => rec[c] ?? "");
    });
    // values.append always grows the grid, so it can't hit the grid limit.
    await withSheetRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: FEES_SHEET_ID,
        range: `${quoteTitle(WA_REPLIES_SHEET)}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rows },
      })
    );
  });
  invalidateSheetCache(`keyed-tab:${WA_REPLIES_SHEET}`);
  return fresh.length;
}
