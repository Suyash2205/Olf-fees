import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  getAllDailyEntries,
  getDailyEntriesForStudent,
  appendDailyEntry,
  updateDailyEntry,
  deleteDailyEntry,
} from "@/lib/sheets/dailyLog";
import { getFeeByName, recordPaymentToSheet, recalculateStudentFees } from "@/lib/sheets/fees";

export async function GET(req: NextRequest) {
  const srNo = req.nextUrl.searchParams.get("srNo");
  try {
    const entries = srNo
      ? await getDailyEntriesForStudent(srNo)
      : await getAllDailyEntries();
    return NextResponse.json(entries);
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
    const studentName: string = body.studentName?.trim();
    const date: string = body.date?.trim();
    const amount = Number(body.amount);

    if (!studentName || !date || !amount || amount <= 0) {
      return NextResponse.json({ error: "studentName, date, and amount > 0 are required" }, { status: 400 });
    }

    const feeRecord = await getFeeByName(studentName);
    if (!feeRecord) {
      return NextResponse.json({ error: `Student "${studentName}" not found in fee records` }, { status: 404 });
    }

    await recordPaymentToSheet(feeRecord.sheetRow, date, amount, feeRecord);

    await appendDailyEntry({
      date,
      studentName,
      className: feeRecord.className,
      srNo: feeRecord.srNo,
      amount,
    });

    revalidatePath("/fees"); revalidatePath("/dashboard"); revalidatePath("/pending");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("daily entry error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const entryId: string = String(body.entryId);
    const studentName: string = body.studentName?.trim();
    const srNo: string = body.srNo?.trim();

    if (!entryId || !studentName || !srNo) {
      return NextResponse.json({ error: "entryId, studentName, and srNo are required" }, { status: 400 });
    }

    await deleteDailyEntry(entryId);

    const feeRecord = await getFeeByName(studentName);
    if (!feeRecord) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const remaining = await getDailyEntriesForStudent(srNo);
    const amounts = remaining
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => e.amount);

    await recalculateStudentFees(feeRecord.sheetRow, feeRecord.totalFee, amounts);

    revalidatePath("/fees"); revalidatePath("/dashboard"); revalidatePath("/pending");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete entry error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const entryId: string = String(body.entryId);
    const newAmount = Number(body.newAmount);
    const studentName: string = body.studentName?.trim();
    const srNo: string = body.srNo?.trim();

    if (!entryId || !newAmount || newAmount <= 0 || !studentName || !srNo) {
      return NextResponse.json({ error: "entryId, newAmount > 0, studentName, and srNo are required" }, { status: 400 });
    }

    // Update the Daily Log row first
    await updateDailyEntry(entryId, newAmount);

    // Fetch fresh fee record and all entries, then recalculate from scratch
    const feeRecord = await getFeeByName(studentName);
    if (!feeRecord) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const allEntries = await getDailyEntriesForStudent(srNo);
    const amounts = allEntries
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => e.amount);

    await recalculateStudentFees(feeRecord.sheetRow, feeRecord.totalFee, amounts);

    revalidatePath("/fees"); revalidatePath("/dashboard"); revalidatePath("/pending");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("edit entry error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
