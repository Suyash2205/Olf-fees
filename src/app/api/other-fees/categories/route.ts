import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isValidFeeTypeName, normalizeFeeTypeName } from "@/lib/other-fee-types";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { addOtherFeeType, getOtherFeeTypes } from "@/lib/sheets/otherFeesLog";

export async function GET() {
  try {
    const feeTypes = await getOtherFeeTypes();
    return NextResponse.json(feeTypes);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;

  try {
    const body = await req.json();
    const name = normalizeFeeTypeName(String(body.name ?? ""));
    if (!isValidFeeTypeName(name)) {
      return NextResponse.json(
        { error: "Fee type name must be at least 2 characters" },
        { status: 400 }
      );
    }

    const feeType = await addOtherFeeType(name);

    await recordAudit(req, {
      action: "create",
      resource: "other-fee-types",
      resourceId: feeType,
      summary: `Added other fee type: ${feeType}`,
      actor,
    });

    const feeTypes = await getOtherFeeTypes();
    return NextResponse.json({ ok: true, feeType, feeTypes });
  } catch (err) {
    console.error("POST other-fee type:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
