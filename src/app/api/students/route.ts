import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  computeFeeBreakdown,
  type DiscountType,
} from "@/lib/fees/structure";
import { addStudent } from "@/lib/sheets/students";
import { addFeeRecord, getAllFees } from "@/lib/sheets/fees";

function invalidateAll() {
  const rt = revalidateTag as (tag: string, profile: string) => void;
  rt("fees", "default");
  rt("students", "default");
}

// Derive student list from fee records — avoids a separate slow Sheets API call.
export async function GET() {
  try {
    const fees = await getAllFees();
    const students = fees.map((f) => ({
      name: f.studentName,
      className: f.className,
      fees: f.totalFee > 0 ? `₹${f.totalFee.toLocaleString("en-IN")}` : "",
      sheetRow: f.sheetRow,
    }));
    return NextResponse.json(students);
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
    const name = body.name?.trim();
    const className = body.className?.trim();
    const discountType = (body.discountType ?? "none") as DiscountType;
    const discountValue = Number(body.discountValue) || 0;

    if (!name || !className) {
      return NextResponse.json({ error: "Name and class are required" }, { status: 400 });
    }

    const breakdown = computeFeeBreakdown(className, discountType, discountValue);
    if (!breakdown) {
      return NextResponse.json({ error: `Unknown class: ${className}` }, { status: 400 });
    }

    const totalFee =
      body.totalFee !== undefined && body.totalFee !== ""
        ? Number(body.totalFee)
        : breakdown.finalFee;

    if (isNaN(totalFee) || totalFee < 0) {
      return NextResponse.json({ error: "Invalid total fee" }, { status: 400 });
    }

    const fees = await getAllFees();
    const maxSr = fees.reduce((max, f) => Math.max(max, Number(f.srNo) || 0), 0);
    const srNo = String(maxSr + 1);

    await Promise.all([
      addStudent(name, className),
      addFeeRecord({
        srNo,
        studentName: name,
        className,
        totalFee,
        discountAmount: breakdown.discountAmount,
      }),
    ]);

    invalidateAll();
    return NextResponse.json({ ok: true, srNo });
  } catch (err) {
    console.error("add student error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
