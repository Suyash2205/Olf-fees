import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { todayISO } from "@/lib/attendance/types";
import { getAttendanceClassSummaries } from "@/lib/attendance/students";
import { requireAttendanceApiAuth } from "@/lib/attendance/api-auth";
import { getClassesMarkedForDate } from "@/lib/sheets/attendance";
import { normalizeSheetDate } from "@/lib/sheets/verify-write";

export async function GET(req: NextRequest) {
  const authErr = await requireAttendanceApiAuth(req);
  if (authErr) return authErr;
  try {
    const date = normalizeSheetDate(req.nextUrl.searchParams.get("date") ?? todayISO());
    const [classes, marked] = await Promise.all([
      getAttendanceClassSummaries(),
      getClassesMarkedForDate(date),
    ]);
    const markedSet = new Set(marked);
    return NextResponse.json({
      date,
      classes: classes.map((c) => ({
        ...c,
        markedToday: markedSet.has(c.className),
      })),
    });
  } catch (err) {
    console.error("GET /api/attendance/classes:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
