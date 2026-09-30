import { NextRequest, NextResponse } from "next/server";
import { buildChronicAbsenceReport } from "@/lib/attendance/absence-report";
import { requireAttendanceApiAuth } from "@/lib/attendance/api-auth";
import { todayIsoInTimeZone } from "@/lib/attendance/daily-summary";

export const runtime = "nodejs";

/**
 * Teacher-visible chronic-absence list. Deliberately carries NO parent name or phone
 * (parent contact details are admin-only).
 */
export async function GET(req: NextRequest) {
  const authErr = await requireAttendanceApiAuth(req);
  if (authErr) return authErr;
  try {
    const dateIso = todayIsoInTimeZone();
    const report = await buildChronicAbsenceReport(dateIso);
    return NextResponse.json({
      dateIso,
      total: report.flagged.length,
      absentEveryDay: report.absentEveryDay,
      byClass: report.byClass,
      countsByClass: report.countsByClass,
    });
  } catch (err) {
    console.error("GET /api/attendance/absence:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compute absence list" },
      { status: 500 }
    );
  }
}
