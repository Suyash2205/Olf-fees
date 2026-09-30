import { NextRequest, NextResponse } from "next/server";
import { requireAttendanceApiAuth } from "@/lib/attendance/api-auth";
import {
  computeAttendanceDashboard,
  type AttendancePeriod,
} from "@/lib/attendance/analytics";
import { filterToSchoolDays } from "@/lib/attendance/school-calendar";
import { readAllAttendanceRows } from "@/lib/sheets/attendance";
import { readCalendarEntries } from "@/lib/sheets/school-calendar";

const PERIODS = new Set<AttendancePeriod>(["7d", "30d", "90d", "all"]);

export async function GET(req: NextRequest) {
  const authErr = await requireAttendanceApiAuth(req);
  if (authErr) return authErr;

  const period = (req.nextUrl.searchParams.get("period") ?? "30d") as AttendancePeriod;

  if (!PERIODS.has(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  try {
    const [allRows, entries] = await Promise.all([readAllAttendanceRows(), readCalendarEntries()]);
    // Marks made on holidays / non-school days stay in the sheet but are ignored here.
    const rows = filterToSchoolDays(allRows, entries);
    const data = computeAttendanceDashboard(rows, period);
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/attendance/dashboard:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
