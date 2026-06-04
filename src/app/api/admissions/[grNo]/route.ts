import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { getAdmissionByGrNo } from "@/lib/sheets/admissions";
import { invalidatePortalCache } from "@/lib/sheets/invalidate-portal-cache";
import { updateAdmissionFromForm } from "@/lib/sheets/save-admission";
import { deleteAdmissionByGrNo } from "@/lib/sheets/student-lifecycle";
import { getFeeByName, getAllFees } from "@/lib/sheets/fees";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ grNo: string }> }
) {
  try {
    const { grNo } = await params;
    const decoded = decodeURIComponent(grNo);
    const admission = await getAdmissionByGrNo(decoded);
    if (!admission) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    let fee = await getFeeByName(admission.fullName);
    if (!fee && admission.fullName) {
      const all = await getAllFees();
      const q = admission.fullName.toLowerCase();
      fee =
        all.find((f) => f.studentName.toLowerCase() === q) ??
        all.find((f) => f.studentName.toLowerCase().includes(q.split(" ")[0])) ??
        null;
    }

    return NextResponse.json({ admission, fee });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ grNo: string }> }
) {
  try {
    const { grNo } = await params;
    const body = await req.json();
    const updated = await updateAdmissionFromForm(decodeURIComponent(grNo), body);
    invalidatePortalCache();
    return NextResponse.json({ ok: true, grNo: updated.grNo, fullName: updated.fullName });
  } catch (err) {
    console.error("admission PUT error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ grNo: string }> }
) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    if (!isAdminAuthorized(req)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
    const { grNo } = await params;
    const decoded = decodeURIComponent(grNo);
    const result = await deleteAdmissionByGrNo(decoded);
    invalidatePortalCache();
    await recordAudit(req, {
      action: "delete",
      resource: "admissions",
      resourceId: decoded,
      summary: `Deleted admission ${decoded}`,
      details: result,
      actor,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("admission DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
