import { NextRequest, NextResponse } from "next/server";
import {
  computeFeeBreakdown,
  getBaseQuarterly,
  getBaseTuition,
  type DiscountType,
} from "@/lib/fees/structure";

export async function GET(req: NextRequest) {
  const className = req.nextUrl.searchParams.get("className")?.trim() ?? "";
  const discountType = (req.nextUrl.searchParams.get("discountType") ?? "none") as DiscountType;
  const discountValue = Number(req.nextUrl.searchParams.get("discountValue")) || 0;

  if (!className) {
    return NextResponse.json({ error: "className is required" }, { status: 400 });
  }

  const baseFee = getBaseTuition(className);
  if (baseFee == null) {
    return NextResponse.json({ error: `Unknown class: ${className}` }, { status: 400 });
  }

  const baseQuarterly = getBaseQuarterly(className);
  const breakdown = computeFeeBreakdown(className, discountType, discountValue)!;

  return NextResponse.json({
    className,
    baseQuarterly,
    ...breakdown,
  });
}
