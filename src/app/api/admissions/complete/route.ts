import { NextRequest, NextResponse } from "next/server";
import { invalidatePortalCache } from "@/lib/sheets/invalidate-portal-cache";
import { completeAdmissionForStudent } from "@/lib/sheets/save-admission";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admission = await completeAdmissionForStudent(body);
    invalidatePortalCache();
    return NextResponse.json({ ok: true, grNo: admission.grNo, fullName: admission.fullName });
  } catch (err) {
    console.error("admission complete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
