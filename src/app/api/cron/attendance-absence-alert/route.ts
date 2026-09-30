import { NextRequest, NextResponse } from "next/server";
import { buildChronicAbsenceReport } from "@/lib/attendance/absence-report";
import { todayIsoInTimeZone } from "@/lib/attendance/daily-summary";
import { isSchoolDayForAnyClass, isValidIsoDate } from "@/lib/attendance/school-calendar";
import { getAttendanceClassSummaries } from "@/lib/attendance/students";
import {
  buildAbsenceEmailHtml,
  buildAbsenceEmailSubject,
  buildAbsenceEmailText,
  type AbsenceContactLookup,
} from "@/lib/email/attendance-absence-template";
import { parseRecipientList, sendGmailMessage } from "@/lib/email/send-gmail";
import { getResolvedParentContacts } from "@/lib/sheets/parent-contacts";
import { readCalendarEntries } from "@/lib/sheets/school-calendar";

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

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  // `date` is honoured on dry runs only, so a real send can never be pointed at another day.
  const dateParam = req.nextUrl.searchParams.get("date")?.trim() ?? "";
  if (dateParam && !dryRun) {
    return NextResponse.json({ error: "date is only allowed with dryRun=1" }, { status: 400 });
  }
  if (dateParam && !isValidIsoDate(dateParam)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const dateIso = dateParam || todayIsoInTimeZone();
    const [classes, entries] = await Promise.all([getAttendanceClassSummaries(), readCalendarEntries()]);
    if (!isSchoolDayForAnyClass(dateIso, classes.map((c) => c.className), entries)) {
      return NextResponse.json({ ok: true, skipped: true, reason: "not a school day", date: dateIso });
    }

    const report = await buildChronicAbsenceReport(dateIso);
    if (report.flagged.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "nobody flagged", date: dateIso });
    }

    const contacts = await getResolvedParentContacts();
    const contactFor: AbsenceContactLookup = (srNo) => {
      const c = contacts.get(srNo);
      return c ? { parentName: c.parentName, phones: c.phones } : undefined;
    };
    const subject = buildAbsenceEmailSubject(report);
    const text = buildAbsenceEmailText(report, contactFor);
    const html = buildAbsenceEmailHtml(report, contactFor);
    const recipients = parseRecipientList(process.env.ATTENDANCE_SUMMARY_EMAILS);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        date: dateIso,
        flagged: report.flagged.length,
        countsByClass: report.countsByClass,
        recipientCount: recipients.length,
        subject,
        text,
        html,
      });
    }

    if (recipients.length === 0) {
      return NextResponse.json({ error: "ATTENDANCE_SUMMARY_EMAILS is not configured" }, { status: 500 });
    }
    await sendGmailMessage({ to: recipients, subject, html, text });
    return NextResponse.json({
      ok: true,
      date: dateIso,
      recipients,
      flagged: report.flagged.length,
      absentEveryDay: report.absentEveryDay.length,
    });
  } catch (err) {
    console.error("GET /api/cron/attendance-absence-alert:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send absence alert" },
      { status: 500 }
    );
  }
}
