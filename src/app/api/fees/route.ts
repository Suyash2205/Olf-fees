import { NextRequest, NextResponse } from "next/server";
import { syncMissingAdmissionFees } from "@/lib/sheets/admission-sync";
import { getAllFees, getFeeByName } from "@/lib/sheets/fees";
import { invalidatePortalCache } from "@/lib/sheets/invalidate-portal-cache";
import { sortPortalStudentSheets } from "@/lib/sheets/sort-sheets";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  const reorder = req.nextUrl.searchParams.get("reorder") === "1";
  try {
    if (name) {
      const fee = await getFeeByName(decodeURIComponent(name));
      return NextResponse.json(fee ?? null);
    }
    const synced = await syncMissingAdmissionFees();
    if (synced > 0) invalidatePortalCache();
    if (reorder) await sortPortalStudentSheets();
    const fees = await getAllFees();
    return NextResponse.json(fees);
  } catch (err) {
    console.error("GET /api/fees:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
