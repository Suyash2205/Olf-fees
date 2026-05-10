import { NextRequest, NextResponse } from "next/server";
import { updateFeePayment } from "@/lib/sheets/fees";

const VALID_FIELDS = ["q1Paid", "q2Paid", "q3Paid", "q4Paid", "notes"] as const;
type Field = (typeof VALID_FIELDS)[number];

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    if (typeof body.sheetRow !== "number") {
      return NextResponse.json({ error: "sheetRow is required" }, { status: 400 });
    }
    if (!VALID_FIELDS.includes(body.field)) {
      return NextResponse.json({ error: "invalid field" }, { status: 400 });
    }

    await updateFeePayment(body.sheetRow, body.field as Field, String(body.value));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("fees PATCH error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
