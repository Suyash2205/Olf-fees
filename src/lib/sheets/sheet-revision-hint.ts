import { google } from "googleapis";
import { getGoogleAuth } from "./client";

export type SpreadsheetEditorHint = {
  email: string;
  displayName: string;
  modifiedTime: string;
};

/** Recent Google accounts that edited the spreadsheet (file-level, not per cell). */
export async function getRecentSpreadsheetEditors(
  fileId: string,
  limit = 5
): Promise<SpreadsheetEditorHint[]> {
  const drive = google.drive({ version: "v3", auth: getGoogleAuth() });
  const res = await drive.revisions.list({
    fileId,
    pageSize: Math.min(limit * 3, 25),
    fields: "revisions(modifiedTime,lastModifyingUser)",
  });

  const seen = new Set<string>();
  const out: SpreadsheetEditorHint[] = [];

  for (const rev of res.data.revisions ?? []) {
    const user = rev.lastModifyingUser;
    const email = user?.emailAddress ?? "";
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push({
      email,
      displayName: user?.displayName ?? email,
      modifiedTime: rev.modifiedTime ?? "",
    });
    if (out.length >= limit) break;
  }

  return out;
}
