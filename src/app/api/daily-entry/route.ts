import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  getAllDailyEntries,
  getDailyEntriesForStudent,
  appendDailyEntry,
  updateDailyEntry,
  deleteDailyEntry,
} from "@/lib/sheets/dailyLog";
import { getFeeByName, recordPaymentToSheet, recalculateStudentFees } from "@/lib/sheets/fees";

// revalidateTag requires 2 args in Next.js 16; pass "default" to avoid the deprecation warning.
function invalidateFees() {
  (revalidateTag as (tag: string, profile: string) => void)("fees", "default");
}

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

    invalidateFees();
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
    const payments = remaining
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ date: e.date, amount: e.amount }));

    await recalculateStudentFees(feeRecord.sheetRow, feeRecord.totalFee, payments);

    invalidateFees();
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

    await updateDailyEntry(entryId, newAmount);

    const feeRecord = await getFeeByName(studentName);
    if (!feeRecord) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const allEntries = await getDailyEntriesForStudent(srNo);
    const payments = allEntries
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ date: e.date, amount: e.amount }));

    await recalculateStudentFees(feeRecord.sheetRow, feeRecord.totalFee, payments);

    invalidateFees();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("edit entry error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
