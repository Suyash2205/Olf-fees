import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { addStudent, getAllStudents } from "@/lib/sheets/students";
import { addFeeRecord, getAllFees } from "@/lib/sheets/fees";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = body.name?.trim();
    const className = body.className?.trim();
    const totalFee = Number(body.totalFee) || 0;

    if (!name || !className) {
      return NextResponse.json({ error: "Name and class are required" }, { status: 400 });
    }

    // Derive the next Sr. No. from existing fee records
    const fees = await getAllFees();
    const maxSr = fees.reduce((max, f) => Math.max(max, Number(f.srNo) || 0), 0);
    const srNo = String(maxSr + 1);

    await Promise.all([
      addStudent(name, className),
      addFeeRecord(srNo, name, className, totalFee),
    ]);

    revalidatePath("/students");
    revalidatePath("/fees");
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true, srNo });
  } catch (err) {
    console.error("add student error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
