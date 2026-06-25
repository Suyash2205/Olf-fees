import { google } from "googleapis";
import { sheets_v4 } from "googleapis";

let sheetsInstance: sheets_v4.Sheets | null = null;

function getAuth() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var is missing");
  }
  const credentials = JSON.parse(credentialsJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
  });
}

export function getGoogleAuth() {
  return getAuth();
}

export function getSheetsClient(): sheets_v4.Sheets {
  if (!sheetsInstance) {
    sheetsInstance = google.sheets({ version: "v4", auth: getAuth() });
  }
  return sheetsInstance;
}

export const FEES_SHEET_ID = process.env.FEES_SHEET_ID!;
export const STUDENTS_SHEET_ID = process.env.STUDENTS_SHEET_ID!;
