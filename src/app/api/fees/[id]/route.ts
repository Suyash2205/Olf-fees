import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { getAllFees, updateFeePayment } from "@/lib/sheets/fees";
import { invalidateSheetCache } from "@/lib/sheets/read-cache";

const VALID_FIELDS = ["q1Paid", "q2Paid", "q3Paid", "q4Paid", "notes"] as const;
type Field = (typeof VALID_FIELDS)[number];

export async function PATCH(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();

    if (typeof body.sheetRow !== "number") {
      return NextResponse.json({ error: "sheetRow is required" }, { status: 400 });
    }
    if (!VALID_FIELDS.includes(body.field)) {
      return NextResponse.json({ error: "invalid field" }, { status: 400 });
    }

    await updateFeePayment(body.sheetRow, body.field as Field, String(body.value));
    invalidateSheetCache();
    const fees = await getAllFees();
    const record = fees.find((f) => f.sheetRow === body.sheetRow);
    await recordAudit(req, {
      action: "update",
      resource: "fees",
      resourceId: record?.srNo ?? String(body.sheetRow),
      summary: `Updated fee field ${body.field} for ${record?.studentName ?? `row ${body.sheetRow}`}`,
      details: { sheetRow: body.sheetRow, field: body.field, value: body.value },
      actor,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("fees PATCH error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
