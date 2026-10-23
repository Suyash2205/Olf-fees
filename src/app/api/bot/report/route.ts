import { NextRequest, NextResponse } from "next/server";
import { canonicalClassLabel } from "@/lib/fees/structure";
import { isAuthorizedBot } from "@/lib/bot/auth";
import { getAllFees } from "@/lib/sheets/fees";
import { appendReplies, parentTableValues, parseBotReport, writeParentTable } from "@/lib/sheets/whatsapp-bot";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The bot reports parent status and new replies; stored in portal-owned tabs for the dashboard. */
export async function POST(req: NextRequest) {
  if (!isAuthorizedBot(req.headers.get("x-olf-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let report;
  try {
    report = parseBotReport(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bad report" }, { status: 400 });
  }
  try {
    const fees = await getAllFees();
    const bySr = new Map(fees.map((f) => [String(f.srNo).trim(), f]));
    const label = (sr: string) => {
      const f = bySr.get(sr);
      return f ? `${f.studentName.trim()} (${canonicalClassLabel(f.className)})` : `Sr ${sr}`;
    };
    const srByPhone = new Map(report.parents.map((p) => [p.phone, p.srNos]));
    await writeParentTable(parentTableValues(report, label, new Date().toISOString()));
    const added = await appendReplies(report, (phone) => (phone ? (srByPhone.get(phone) ?? []).map(label).join("; ") : ""));
    return NextResponse.json({ ok: true, parents: report.parents.length, repliesAdded: added });
  } catch (err) {
    console.error("[bot/report]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Report failed" }, { status: 500 });
  }
}
