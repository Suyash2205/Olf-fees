import { NextRequest, NextResponse } from "next/server";
import { todayIsoInTimeZone } from "@/lib/attendance/daily-summary";
import { buildFeeFollowUpsEmail, toEmailItems } from "@/lib/email/fee-followups-template";
import { parseRecipientList, sendGmailMessage } from "@/lib/email/send-gmail";
import { latestFollowUpBySrNo, selectDueFollowUps } from "@/lib/fees/follow-ups";
import { readFeeFollowUps } from "@/lib/sheets/fee-followups";
import { getAllFees } from "@/lib/sheets/fees";
import { getResolvedParentContacts } from "@/lib/sheets/parent-contacts";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Morning email: students whose latest follow-up date is today or earlier (and who still owe fees).
 * `?dryRun=1` returns the rendered subject/text as JSON and sends nothing.
 * Skipped (no email) when nothing is due.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const dateIso = todayIsoInTimeZone();
    const [fees, followUps, contacts] = await Promise.all([
      getAllFees(),
      readFeeFollowUps(),
      getResolvedParentContacts(),
    ]);

    const balanceBySrNo = new Map<string, number>();
    for (const f of fees) balanceBySrNo.set(f.srNo, f.totalFee - f.totalPaid);
    const owing = new Set([...balanceBySrNo].filter(([, b]) => b > 0.001).map(([sr]) => sr));

    const due = selectDueFollowUps(latestFollowUpBySrNo(followUps), owing, dateIso);
    if (due.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "nothing due", date: dateIso, dryRun });
    }

    const email = buildFeeFollowUpsEmail({
      dateIso,
      items: toEmailItems(due, balanceBySrNo, contacts),
    });

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        date: dateIso,
        count: email.count,
        overdueCount: email.overdueCount,
        subject: email.subject,
        text: email.text,
      });
    }

    const recipients = parseRecipientList(process.env.ATTENDANCE_SUMMARY_EMAILS);
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "ATTENDANCE_SUMMARY_EMAILS is not configured" },
        { status: 500 }
      );
    }
    await sendGmailMessage({ to: recipients, subject: email.subject, html: email.html, text: email.text });
    return NextResponse.json({
      ok: true,
      date: dateIso,
      recipients: recipients.length,
      count: email.count,
      overdueCount: email.overdueCount,
    });
  } catch (err) {
    console.error("GET /api/cron/fee-followups:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send fee follow-ups email" },
      { status: 500 }
    );
  }
}
