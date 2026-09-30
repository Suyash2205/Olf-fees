/**
 * Small helper for portal-owned tabs (Parent Contacts, Fee Follow-ups, Holidays, …).
 *
 * Rules that keep the school's hand-built sheets safe:
 * - Only ever creates a *new* tab; never inserts or deletes rows/columns in any tab.
 * - Row 1 is the header. Columns are located by header name, so a column the office
 *   adds or reorders later is tolerated.
 * - Writes use RAW input so phone numbers and dates stay text (no "+91" formulas,
 *   no 9876543210 → 9.87E+09).
 * - Every call is wrapped in withSheetRetry; reads go through cachedSheetRead.
 */
import { getSheetsClient, FEES_SHEET_ID } from "./client";
import { cachedSheetRead, invalidateSheetCache } from "./read-cache";
import { withSheetRetry } from "./retry";
import { withSheetWriteLock } from "./sync-lock";
import { InputError } from "@/lib/input-error";

export type TabRow<H extends string> = Record<H, string> & { sheetRow: number };

export function columnLetter(idx: number): string {
  let n = idx + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function quoteTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

const ensured = new Set<string>();

/** Create the tab and its header row if missing. Adds any missing header at the far right. */
export async function ensureKeyedTab(title: string, headers: readonly string[]): Promise<void> {
  const memoKey = `${FEES_SHEET_ID}:${title}`;
  if (ensured.has(memoKey)) return;
  const sheets = getSheetsClient();
  const meta = await withSheetRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID, fields: "sheets.properties.title" })
  );
  const exists = meta.data.sheets?.some((s) => s.properties?.title === title);
  if (!exists) {
    await withSheetRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId: FEES_SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] },
      })
    );
  }
  const headerRes = await withSheetRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId: FEES_SHEET_ID, range: `${quoteTitle(title)}!1:1` })
  );
  const current = (headerRes.data.values?.[0] ?? []).map((v) => String(v ?? "").trim());
  const missing = headers.filter((h) => !current.includes(h));
  if (missing.length > 0) {
    const start = current.length;
    const end = start + missing.length - 1;
    await withSheetRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: FEES_SHEET_ID,
        range: `${quoteTitle(title)}!${columnLetter(start)}1:${columnLetter(end)}1`,
        valueInputOption: "RAW",
        requestBody: { values: [missing] },
      })
    );
  }
  ensured.add(memoKey);
}

/** Pure: turn raw sheet values (header row first) into keyed rows. Skips blank rows. */
export function parseKeyedRows<H extends string>(
  values: unknown[][],
  headers: readonly H[]
): TabRow<H>[] {
  const headerRow = (values[0] ?? []).map((v) => String(v ?? "").trim());
  const idx = new Map(headers.map((h) => [h, headerRow.indexOf(h)]));
  const rows: TabRow<H>[] = [];
  for (let i = 1; i < values.length; i++) {
    const raw = values[i] ?? [];
    if (!raw.some((c) => String(c ?? "").trim() !== "")) continue;
    const row = { sheetRow: i + 1 } as TabRow<H>;
    for (const h of headers) {
      const col = idx.get(h) ?? -1;
      (row as Record<string, unknown>)[h] = col >= 0 ? String(raw[col] ?? "").trim() : "";
    }
    rows.push(row);
  }
  return rows;
}

function cacheKey(title: string) {
  return `keyed-tab:${title}`;
}

export async function readKeyedTab<H extends string>(
  title: string,
  headers: readonly H[],
  ttlMs = 20_000
): Promise<TabRow<H>[]> {
  return cachedSheetRead(
    cacheKey(title),
    async () => {
      await ensureKeyedTab(title, headers);
      const sheets = getSheetsClient();
      const res = await withSheetRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId: FEES_SHEET_ID,
          range: quoteTitle(title),
          valueRenderOption: "FORMATTED_VALUE",
        })
      );
      return parseKeyedRows((res.data.values ?? []) as unknown[][], headers);
    },
    ttlMs
  );
}

async function readHeaderRow(title: string): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await withSheetRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId: FEES_SHEET_ID, range: `${quoteTitle(title)}!1:1` })
  );
  return (res.data.values?.[0] ?? []).map((v) => String(v ?? "").trim());
}

function toRowValues(headerRow: string[], record: Record<string, string>): string[] {
  return headerRow.map((h) => (h in record ? record[h] ?? "" : ""));
}

/**
 * Append one row (fields matched by header name). Uses values.append so it lands
 * after the last non-empty row and never overwrites.
 */
export async function appendKeyedRow(
  title: string,
  headers: readonly string[],
  record: Record<string, string>
): Promise<void> {
  await withSheetWriteLock(async () => {
    await ensureKeyedTab(title, headers);
    const headerRow = await readHeaderRow(title);
    const sheets = getSheetsClient();
    await withSheetRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: FEES_SHEET_ID,
        range: `${quoteTitle(title)}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [toRowValues(headerRow, record)] },
      })
    );
  });
  invalidateSheetCache(cacheKey(title));
}

/**
 * Update only the given fields of an existing row (other cells untouched).
 * `expectKey` guards against the row having moved: the named column must still hold that value.
 */
export async function updateKeyedRow(
  title: string,
  headers: readonly string[],
  sheetRow: number,
  fields: Record<string, string>,
  expectKey?: { header: string; value: string }
): Promise<void> {
  await withSheetWriteLock(async () => {
    await ensureKeyedTab(title, headers);
    const headerRow = await readHeaderRow(title);
    const sheets = getSheetsClient();
    if (expectKey) {
      const col = headerRow.indexOf(expectKey.header);
      const cur = await withSheetRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId: FEES_SHEET_ID,
          range: `${quoteTitle(title)}!${columnLetter(col)}${sheetRow}`,
        })
      );
      const actual = String(cur.data.values?.[0]?.[0] ?? "").trim();
      if (actual !== expectKey.value) {
        throw new InputError(
          `${title} row ${sheetRow} changed (expected ${expectKey.header}=${expectKey.value}, found "${actual}"). Reload and try again.`,
          409
        );
      }
    }
    const data = Object.entries(fields).map(([h, value]) => {
      const col = headerRow.indexOf(h);
      if (col < 0) throw new Error(`${title} has no "${h}" column`);
      return { range: `${quoteTitle(title)}!${columnLetter(col)}${sheetRow}`, values: [[value]] };
    });
    await withSheetRetry(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: FEES_SHEET_ID,
        requestBody: { valueInputOption: "RAW", data },
      })
    );
  });
  invalidateSheetCache(cacheKey(title));
}
