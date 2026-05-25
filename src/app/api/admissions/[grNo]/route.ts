import { NextRequest, NextResponse } from "next/server";
import { getAdmissionByGrNo } from "@/lib/sheets/admissions";
import { invalidatePortalCache } from "@/lib/sheets/invalidate-portal-cache";
import { updateAdmissionFromForm } from "@/lib/sheets/save-admission";
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
