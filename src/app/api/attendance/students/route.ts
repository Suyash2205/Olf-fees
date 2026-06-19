import { NextRequest, NextResponse } from "next/server";
import { requireAttendanceApiAuth } from "@/lib/attendance/api-auth";
import {
  getAttendanceStudentsForClass,
  isKnownAttendanceClass,
} from "@/lib/attendance/students";
import { canonicalClassLabel } from "@/lib/fees/structure";

export async function GET(req: NextRequest) {
  const authErr = await requireAttendanceApiAuth(req);
  if (authErr) return authErr;

  const className = req.nextUrl.searchParams.get("class")?.trim() ?? "";
  if (!className || !isKnownAttendanceClass(className)) {
    return NextResponse.json({ error: "Valid class is required" }, { status: 400 });
  }

  try {
    const students = await getAttendanceStudentsForClass(className);
    return NextResponse.json({
      className: canonicalClassLabel(className),
      students,
    });
  } catch (err) {
    console.error("GET /api/attendance/students:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
