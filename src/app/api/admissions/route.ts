import { NextRequest, NextResponse } from "next/server";
import { syncMissingAdmissionFees } from "@/lib/sheets/admission-sync";
import { getAllAdmissions } from "@/lib/sheets/admissions";
import { invalidatePortalCache } from "@/lib/sheets/invalidate-portal-cache";
import { createAdmissionFromForm } from "@/lib/sheets/save-admission";

export async function GET() {
  try {
    const synced = await syncMissingAdmissionFees();
    if (synced > 0) invalidatePortalCache();
    const admissions = await getAllAdmissions();
    return NextResponse.json(admissions);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admission = await createAdmissionFromForm(body);
    invalidatePortalCache();
    return NextResponse.json({ ok: true, grNo: admission.grNo, fullName: admission.fullName });
  } catch (err) {
    console.error("add admission error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
