import { NextRequest, NextResponse } from "next/server";
import { todayIsoInTimeZone } from "@/lib/attendance/daily-summary";
import { isValidIsoDate } from "@/lib/attendance/school-calendar";
import { isAuthorizedBot } from "@/lib/bot/auth";
import { buildBotSnapshot } from "@/lib/bot/snapshot";
import { readAllAttendanceRows } from "@/lib/sheets/attendance";
import { getAllFees } from "@/lib/sheets/fees";
import { getInactiveStudentKeys } from "@/lib/sheets/fees-inactive";
import { getResolvedParentContacts } from "@/lib/sheets/parent-contacts";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Roster, parent phones and attendance for the WhatsApp bot. Read-only. */
export async function GET(req: NextRequest) {
  if (!isAuthorizedBot(req.headers.get("x-olf-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const from = req.nextUrl.searchParams.get("from")?.trim() ?? "";
  if (!isValidIsoDate(from)) {
    return NextResponse.json({ error: "from must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    const [fees, inactiveKeys, contacts, attendance] = await Promise.all([
      getAllFees(),
      getInactiveStudentKeys(),
      getResolvedParentContacts(),
      readAllAttendanceRows(),
    ]);
    const snapshot = buildBotSnapshot({ today: todayIsoInTimeZone(), from, fees, inactiveKeys, contacts, attendance });
    return NextResponse.json(snapshot, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[bot/snapshot]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Snapshot failed" }, { status: 500 });
  }
}
