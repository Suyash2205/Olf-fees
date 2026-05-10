import { NextRequest, NextResponse } from "next/server";
import { getAllFees, getFeeByName } from "@/lib/sheets/fees";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  try {
    if (name) {
      const fee = await getFeeByName(decodeURIComponent(name));
      return NextResponse.json(fee ?? null);
    }
    const fees = await getAllFees();
    return NextResponse.json(fees);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
