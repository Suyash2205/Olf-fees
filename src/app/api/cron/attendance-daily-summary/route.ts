import { NextRequest, NextResponse } from "next/server";
import {
  buildDailyAttendanceSummary,
  isWeekdayInTimeZone,
  todayIsoInTimeZone,
} from "@/lib/attendance/daily-summary";
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

  if (!isWeekdayInTimeZone()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "weekend" });
  }

  try {
    const dateIso = todayIsoInTimeZone();
    const summary = await buildDailyAttendanceSummary(dateIso);
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
