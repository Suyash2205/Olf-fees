import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { backfillAdmissionsFromFees } from "@/lib/sheets/admission-backfill";
import { invalidatePortalCache } from "@/lib/sheets/invalidate-portal-cache";

/** Bulk sheet writes can take a few minutes for large schools. */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const adminPassword =
    typeof body.adminPassword === "string" ? body.adminPassword : undefined;

  if (!isAdminAuthorized(req, adminPassword)) {
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
  }

  try {
    const result = await backfillAdmissionsFromFees();
    invalidatePortalCache();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("backfill admissions error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
