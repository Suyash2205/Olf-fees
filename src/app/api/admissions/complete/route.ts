import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { invalidatePortalCache } from "@/lib/sheets/invalidate-portal-cache";
import { completeAdmissionForStudent } from "@/lib/sheets/save-admission";

export async function POST(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const admission = await completeAdmissionForStudent(body);
    invalidatePortalCache();
    await recordAudit(req, {
      action: "create",
      resource: "admissions",
      resourceId: admission.grNo,
      summary: `Completed admission profile: ${admission.fullName}`,
      details: { linkStudentName: body.linkStudentName },
      actor,
    });
    return NextResponse.json({ ok: true, grNo: admission.grNo, fullName: admission.fullName });
  } catch (err) {
    console.error("admission complete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
