import { NextRequest, NextResponse } from "next/server";
import { todayIsoInTimeZone } from "@/lib/attendance/daily-summary";
import { latestFollowUpBySrNo, type FollowUp } from "@/lib/fees/follow-ups";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { getAllDailyEntries } from "@/lib/sheets/dailyLog";
import { readFeeFollowUps } from "@/lib/sheets/fee-followups";
import { getAllFees } from "@/lib/sheets/fees";
import { cachedSheetRead } from "@/lib/sheets/read-cache";

export const runtime = "nodejs";

/** Last school-fee payment date per Sr No (cached; the log is read whole). */
async function lastPaymentDates(): Promise<Record<string, string>> {
  return cachedSheetRead(
    "pending-report:last-payments",
    async () => {
      const out: Record<string, string> = {};
      for (const e of await getAllDailyEntries()) {
        if (!e.srNo || !e.date) continue;
        if (!out[e.srNo] || e.date > out[e.srNo]) out[e.srNo] = e.date;
      }
      return out;
    },
    20_000
  );
}

/**
 * Inputs for the pending report: active students (getAllFees already drops inactive ones),
 * last payment dates, and the latest follow-up per student. The maths runs in the client
 * from the pure module so filter switches are instant. Admin only.
 */
export async function GET(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const [fees, lastPayments, followUps] = await Promise.all([
      getAllFees(),
      lastPaymentDates(),
      readFeeFollowUps(),
    ]);
    const latest: FollowUp[] = [...latestFollowUpBySrNo(followUps).values()];
    return NextResponse.json({
      today: todayIsoInTimeZone(),
      fees: fees.map((f) => ({
        srNo: f.srNo,
        studentName: f.studentName,
        className: f.className,
        totalFee: f.totalFee,
        totalPaid: f.totalPaid,
      })),
      lastPayments,
      latestFollowUps: latest,
    });
  } catch (err) {
    console.error("GET /api/pending-report:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the pending report" },
      { status: 500 }
    );
  }
}
