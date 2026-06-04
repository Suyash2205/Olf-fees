import { getSheetsClient, FEES_SHEET_ID } from "./client";

const SHEET_NAME = "Daily Log";

export interface DailyEntry {
  id: string;
  date: string;        // YYYY-MM-DD
  studentName: string;
  className: string;
  srNo: string;
  amount: number;
  /** Fee month column (1–12). Jun=6. From sheet sync or payment date. */
  feeMonth?: number;
}

export type DailyEntryInput = Omit<DailyEntry, "id">;

async function ensureSheet(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${SHEET_NAME}!A1:F1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["Date", "Student Name", "Class", "Sr No", "Amount", "Fee Month"]],
      },
    });
    return;
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A1:F1`,
  });
  const headers = headerRes.data.values?.[0] ?? [];
  if (headers[5] !== "Fee Month") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: FEES_SHEET_ID,
      range: `${SHEET_NAME}!F1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Fee Month"]] },
    });
  }
}

export async function appendDailyEntry(entry: DailyEntryInput): Promise<void> {
  await ensureSheet();
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:F`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          entry.date,
          entry.studentName,
          entry.className,
          entry.srNo,
          entry.amount,
          entry.feeMonth ?? "",
        ],
      ],
    },
  });
}

export async function getAllDailyEntries(): Promise<DailyEntry[]> {
  await ensureSheet();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!A:F`,
  });
  const rows = (res.data.values ?? []).slice(1);
  return rows
    .map((row, i) => ({
      id: String(i + 2),
      date: row[0] ?? "",
      studentName: row[1] ?? "",
      className: row[2] ?? "",
      srNo: row[3] ?? "",
      amount: Number(row[4]) || 0,
      feeMonth: row[5] ? Number(row[5]) : undefined,
    }))
    .filter((e) => e.date && e.studentName);
}

export async function getDailyEntriesForStudent(srNo: string): Promise<DailyEntry[]> {
  const all = await getAllDailyEntries();
  return all.filter((e) => e.srNo === srNo);
}

export async function updateDailyEntry(rowId: string, newAmount: number): Promise<void> {
  await ensureSheet();
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: FEES_SHEET_ID,
    range: `${SHEET_NAME}!E${rowId}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[newAmount]] },
  });
}

export async function deleteDailyEntry(rowId: string): Promise<void> {
  await ensureSheet();
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: FEES_SHEET_ID });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined) throw new Error("Daily Log sheet not found");

  const rowIndex = Number(rowId) - 1; // 0-based
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: FEES_SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
          },
        },
      ],
    },
  });
}
