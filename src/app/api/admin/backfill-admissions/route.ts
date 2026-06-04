import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { backfillAdmissionsFromFees } from "@/lib/sheets/admission-backfill";
import { invalidatePortalCache } from "@/lib/sheets/invalidate-portal-cache";

/** Bulk sheet writes can take a few minutes for large schools. */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;

  const body = await req.json().catch(() => ({}));
  const adminPassword =
    typeof body.adminPassword === "string" ? body.adminPassword : undefined;

  if (!isAdminAuthorized(req, adminPassword)) {
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
  }

  try {
    const result = await backfillAdmissionsFromFees();
    invalidatePortalCache();
    await recordAudit(req, {
      action: "backfill",
      resource: "admissions",
      resourceId: "bulk",
      summary: `Bulk admission backfill: ${result.created} created, ${result.skipped} skipped`,
      details: result,
      actor,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("backfill admissions error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
