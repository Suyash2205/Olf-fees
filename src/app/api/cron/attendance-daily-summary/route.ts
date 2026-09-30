import { NextRequest, NextResponse } from "next/server";
import { buildDailyAttendanceSummary, todayIsoInTimeZone } from "@/lib/attendance/daily-summary";
import { isSchoolDay, isSchoolDayForAnyClass } from "@/lib/attendance/school-calendar";
import { getAttendanceClassSummaries } from "@/lib/attendance/students";
import { readCalendarEntries } from "@/lib/sheets/school-calendar";
import {
  buildAttendanceDailyEmailHtml,
  buildAttendanceDailyEmailSubject,
  buildAttendanceDailyEmailText,
} from "@/lib/email/attendance-daily-template";
import { parseRecipientList, sendGmailMessage } from "@/lib/email/send-gmail";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dateIso = todayIsoInTimeZone();

    // School calendar replaces the old weekday gate: skip when no class has school today.
    const [classes, entries] = await Promise.all([getAttendanceClassSummaries(), readCalendarEntries()]);
    const classNames = classes.map((c) => c.className);
    if (!isSchoolDayForAnyClass(dateIso, classNames, entries)) {
      return NextResponse.json({ ok: true, skipped: true, reason: "not a school day" });
    }

    const summary = await buildDailyAttendanceSummary(dateIso);
    // A class on holiday today is not "unmarked".
    summary.unmarkedClasses = summary.unmarkedClasses.filter((c) => isSchoolDay(dateIso, c, entries));
    const recipients = parseRecipientList(process.env.ATTENDANCE_SUMMARY_EMAILS);

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "ATTENDANCE_SUMMARY_EMAILS is not configured" },
        { status: 500 }
      );
    }

    const subject = buildAttendanceDailyEmailSubject(summary);
    const html = buildAttendanceDailyEmailHtml(summary);
    const text = buildAttendanceDailyEmailText(summary);

    await sendGmailMessage({ to: recipients, subject, html, text });

    return NextResponse.json({
      ok: true,
      date: dateIso,
      recipients,
      noneMarked: summary.noneMarked,
      classesMarked: summary.byClass.length,
      unmarkedClasses: summary.unmarkedClasses.length,
    });
  } catch (err) {
    console.error("GET /api/cron/attendance-daily-summary:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send daily summary" },
      { status: 500 }
    );
  }
}
