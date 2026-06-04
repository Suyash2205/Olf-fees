import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { revalidateTag } from "next/cache";
import type { DiscountType } from "@/lib/fees/structure";
import { applyFeeDiscount, getAllFees } from "@/lib/sheets/fees";

export async function POST(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const sheetRow = Number(body.sheetRow);
    const discountType = (body.discountType ?? "none") as DiscountType;
    const discountValue = Number(body.discountValue) || 0;

    if (!sheetRow) {
      return NextResponse.json({ error: "sheetRow is required" }, { status: 400 });
    }

    const fees = await getAllFees();
    const record = fees.find((f) => f.sheetRow === sheetRow);
    if (!record) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const result = await applyFeeDiscount(record, discountType, discountValue);

    const rt = revalidateTag as (tag: string, profile: string) => void;
    rt("fees", "default");
    rt("students", "default");
    rt("admissions", "default");

    await recordAudit(req, {
      action: "discount",
      resource: "fees",
      resourceId: record.srNo,
      summary: `Discount on ${record.studentName}: ${discountType} ${discountValue}`,
      details: { sheetRow, discountType, discountValue, ...result },
      actor,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("fees discount error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
