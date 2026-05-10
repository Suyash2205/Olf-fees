import { NextRequest, NextResponse } from "next/server";
import { getAllDailyEntries, getDailyEntriesForStudent, appendDailyEntry } from "@/lib/sheets/dailyLog";
import { getFeeByName, recordPaymentToSheet } from "@/lib/sheets/fees";

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

    // Update monthly column in Fee details sheet
    await recordPaymentToSheet(feeRecord.sheetRow, date, amount, feeRecord);

    // Log the individual entry in Daily Log tab
    await appendDailyEntry({
      date,
      studentName,
      className: feeRecord.className,
      srNo: feeRecord.srNo,
      amount,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("daily entry error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
