import { NextResponse } from "next/server";
import { getAllDailyEntries } from "@/lib/sheets/dailyLog";
import { getAllExpenseEntries } from "@/lib/sheets/dailyExpense";
import { getAllFees } from "@/lib/sheets/fees";
import { getAllOtherFeeEntries, getOtherFeeTypes } from "@/lib/sheets/otherFeesLog";
import { cachedSheetRead } from "@/lib/sheets/read-cache";

const CACHE_KEY = "portal-summary";

async function loadPortalSummary() {
  // Sequential reads to avoid Google Sheets 429 bursts.
  const fees = await getAllFees();
  const schoolPayments = await getAllDailyEntries();
  const otherFees = await getAllOtherFeeEntries();
  const feeTypes = await getOtherFeeTypes();
  const expenses = await getAllExpenseEntries();
  return { fees, schoolPayments, otherFees, feeTypes, expenses };
}

export async function GET() {
  try {
    const data = await cachedSheetRead(CACHE_KEY, loadPortalSummary);
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/portal-summary:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const isQuota = message.includes("Quota exceeded") || message.includes("429");
    return NextResponse.json(
      {
        error: isQuota
          ? "Google Sheets rate limit — please wait a few seconds and retry."
          : message,
      },
      { status: isQuota ? 503 : 500 }
    );
  }
}
