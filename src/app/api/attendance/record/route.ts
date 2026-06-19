import { NextRequest, NextResponse } from "next/server";
import { requireAttendanceActor, requireAttendanceApiAuth } from "@/lib/attendance/api-auth";
import { recordAttendanceAudit } from "@/lib/attendance/audit";
import type { AttendanceEntry, AttendanceStatus } from "@/lib/attendance/types";
import { todayISO } from "@/lib/attendance/types";
import { isKnownAttendanceClass } from "@/lib/attendance/students";
import { isPortalActor } from "@/lib/portal-auth";
import { canonicalClassLabel } from "@/lib/fees/structure";
import {
  listAttendanceDaySummaries,
  readAttendanceForDate,
  saveAttendanceForDate,
} from "@/lib/sheets/attendance";
import { getLatestAttendanceAuditByClass } from "@/lib/sheets/attendance-audit-log";
import { normalizeSheetDate } from "@/lib/sheets/verify-write";

export async function GET(req: NextRequest) {
  const authErr = await requireAttendanceApiAuth(req);
  if (authErr) return authErr;

  const className = req.nextUrl.searchParams.get("class")?.trim() ?? "";
  const date = req.nextUrl.searchParams.get("date")?.trim() ?? "";

  if (!className || !isKnownAttendanceClass(className)) {
    return NextResponse.json({ error: "Valid class is required" }, { status: 400 });
  }

  try {
    const label = canonicalClassLabel(className);
    if (date) {
      const records = await readAttendanceForDate(label, date);
      const audit = (await getLatestAttendanceAuditByClass(label)).get(normalizeSheetDate(date));
      return NextResponse.json({
        className: label,
        date: normalizeSheetDate(date),
        records: records.map((r) => ({
          studentName: r.studentName,
          srNo: r.srNo,
          status: r.status,
        })),
        submittedAt: audit?.submittedAt ?? null,
        teacherName: audit?.teacherName ?? null,
      });
    }

    const history = await listAttendanceDaySummaries(label);
    return NextResponse.json({ className: label, history });
  } catch (err) {
    console.error("GET /api/attendance/record:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const actor = await requireAttendanceActor(req);
  if (!isPortalActor(actor)) return actor;

  try {
    const body = await req.json();
    const className = String(body.className ?? "").trim();
    const date = normalizeSheetDate(String(body.date ?? ""));
    const source = String(body.source ?? "today") as "today" | "history";
    const records: AttendanceEntry[] = Array.isArray(body.records) ? body.records : [];

    if (!className || !isKnownAttendanceClass(className)) {
      return NextResponse.json({ error: "Valid class is required" }, { status: 400 });
    }
    if (!date) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }
    if (source === "today" && date !== todayISO()) {
      return NextResponse.json(
        { error: "Only today's attendance can be recorded from the daily screen" },
        { status: 400 }
      );
    }
    if (source === "history" && date > todayISO()) {
      return NextResponse.json({ error: "Cannot edit future attendance" }, { status: 400 });
    }
    if (records.length === 0) {
      return NextResponse.json({ error: "At least one student record is required" }, { status: 400 });
    }

    const normalizedRecords = records.map((r) => ({
      studentName: String(r.studentName ?? "").trim(),
      srNo: String(r.srNo ?? "").trim(),
      status: (r.status === "absent" ? "absent" : "present") as AttendanceStatus,
    }));

    if (normalizedRecords.some((r) => !r.studentName || !r.srNo)) {
      return NextResponse.json({ error: "Each record needs student name and sr no" }, { status: 400 });
    }

    const label = canonicalClassLabel(className);
    const result = await saveAttendanceForDate(label, date, normalizedRecords, {
      email: actor.email,
      name: actor.name,
    });

    await recordAttendanceAudit(req, {
      action: source === "today" ? "submit" : "update",
      className: label,
      date,
      summary: `Attendance ${source === "today" ? "submitted" : "updated"} — ${label} on ${date}`,
      details: {
        present: result.present,
        absent: result.absent,
        total: result.total,
        source,
      },
      actor,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("POST /api/attendance/record:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
