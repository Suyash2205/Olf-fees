import { getSheetsClient, FEES_SHEET_ID } from "./client";
import { withSheetRetry } from "./retry";

/** Blank rows added beyond the one needed, so a full tab isn't regrown on every write. */
const GROW_PADDING = 500;

/**
 * Make sure `title` has at least `row` rows before writing to that row.
 *
 * Google rejects a values.update/batchUpdate whose range *starts* below the last grid row
 * ("exceeds grid limits"); only writes that start inside the grid auto-expand. The log tabs
 * append by writing to a computed next row, and deleting an entry removes a grid row, so a
 * busy log eventually fills its grid and every new entry fails (Daily Fees Log, 2026-10).
 * Only appends rows at the bottom; never moves existing data.
 */
export async function ensureRowCapacity(title: string, row: number): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await withSheetRetry(() =>
    sheets.spreadsheets.get({
      spreadsheetId: FEES_SHEET_ID,
      fields: "sheets.properties(title,sheetId,gridProperties.rowCount)",
    })
  );
  const props = meta.data.sheets?.find((s) => s.properties?.title === title)?.properties;
  if (props?.sheetId == null) throw new Error(`Sheet "${title}" not found`);
  const rowCount = props.gridProperties?.rowCount ?? 0;
  if (row <= rowCount) return;
  await withSheetRetry(() =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId: FEES_SHEET_ID,
      requestBody: {
        requests: [
          {
            appendDimension: {
              sheetId: props.sheetId!,
              dimension: "ROWS",
              length: row - rowCount + GROW_PADDING,
            },
          },
        ],
      },
    })
  );
}
