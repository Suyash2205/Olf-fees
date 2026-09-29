import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { followUpHistory } from "@/lib/fees/follow-ups";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { addFeeFollowUp, readFeeFollowUps, validateFollowUpInput } from "@/lib/sheets/fee-followups";
import { getFeeBySrNo } from "@/lib/sheets/fees";
import { todayIsoInTimeZone } from "@/lib/attendance/daily-summary";

/** GET ?srNo=… → that student's call history, newest first. Admin only. */
export async function GET(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  const srNo = req.nextUrl.searchParams.get("srNo")?.trim();
  if (!srNo) return NextResponse.json({ error: "srNo is required" }, { status: 400 });
  try {
    const rows = await readFeeFollowUps();
    return NextResponse.json({ followUps: followUpHistory(rows, srNo) });
  } catch (err) {
    console.error("GET /api/fee-followups:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load follow-ups" },
      { status: 500 }
    );
  }
}

/** POST { srNo, date?, parentSaid, reason, nextFollowUp } → append one call-log row. */
export async function POST(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const srNo = String(body.srNo ?? "").trim();
    const fee = srNo ? await getFeeBySrNo(srNo) : null;
    if (!fee) {
      return NextResponse.json({ error: "Student not found (Sr No)." }, { status: 404 });
    }
    const input = {
      srNo: fee.srNo,
      studentName: fee.studentName,
      className: fee.className,
      date: String(body.date ?? "").trim() || todayIsoInTimeZone(),
      parentSaid: typeof body.parentSaid === "string" ? body.parentSaid : "",
      reason: typeof body.reason === "string" ? body.reason : "",
      nextFollowUp: typeof body.nextFollowUp === "string" ? body.nextFollowUp : "",
    };
    try {
      validateFollowUpInput(input);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    await addFeeFollowUp(input, actor.email);
    await recordAudit(req, {
      action: "create",
      resource: "fee-followups",
      resourceId: fee.srNo,
      summary: `Fee follow-up logged for Sr No ${fee.srNo} (${fee.className}), call date ${input.date}`,
      details: { date: input.date, nextFollowUp: input.nextFollowUp || null },
      actor,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/fee-followups:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save follow-up" },
      { status: 500 }
    );
  }
}
