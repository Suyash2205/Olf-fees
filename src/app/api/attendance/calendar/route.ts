import { NextRequest, NextResponse } from "next/server";
import { requireAttendanceApiAuth } from "@/lib/attendance/api-auth";
import { readCalendarEntries } from "@/lib/sheets/school-calendar";

export const runtime = "nodejs";

/** Read-only, teacher-visible: active holiday / working-day entries (no names or emails). */
export async function GET(req: NextRequest) {
  const authErr = await requireAttendanceApiAuth(req);
  if (authErr) return authErr;
  try {
    return NextResponse.json({ entries: await readCalendarEntries() });
  } catch (err) {
    console.error("GET /api/attendance/calendar:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load the school calendar" },
      { status: 500 }
    );
  }
}
