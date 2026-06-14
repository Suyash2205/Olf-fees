import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { normalizePaymentMode } from "@/lib/payment-mode";
import { getPortalActor, isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { revalidateTag } from "next/cache";
import {
  getAllDailyEntries,
  getDailyEntriesForStudent,
  appendDailyEntry,
  updateDailyEntry,
  deleteDailyEntry,
} from "@/lib/sheets/dailyLog";
import { getFeeByName, getFeeBySrNo, recalculateStudentFees, syncFeeRowAmounts } from "@/lib/sheets/fees";
import { feeMonthForEntry, reconcileStudentPayments } from "@/lib/sheets/payment-sync";

function invalidateFees() {
  (revalidateTag as (tag: string, profile: string) => void)("fees", "default");
}

function paymentsFromEntries(
  entries: Awaited<ReturnType<typeof getDailyEntriesForStudent>>
) {
  return entries
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      date: e.date,
      amount: e.amount,
      feeMonth: feeMonthForEntry(e),
    }));
}

async function rebuildFeeRowFromLog(
  feeRecord: NonNullable<Awaited<ReturnType<typeof getFeeByName>>>
) {
  const entries = await getDailyEntriesForStudent(feeRecord.srNo);
  await recalculateStudentFees(
    feeRecord.sheetRow,
    feeRecord.totalFee,
    paymentsFromEntries(entries)
  );
  await syncFeeRowAmounts(feeRecord.sheetRow, feeRecord.totalFee, feeRecord.discount);
}

export async function GET(req: NextRequest) {
  const srNo = req.nextUrl.searchParams.get("srNo");
  const reconcile = req.nextUrl.searchParams.get("reconcile") !== "0";

  try {
    if (srNo && reconcile) {
      const actor = await getPortalActor(req);
      const fee = await getFeeBySrNo(srNo);
      if (fee && actor) {
        const all = await getAllDailyEntries();
        await reconcileStudentPayments(fee, all, { req, actor });
      }
    }

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
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const studentName: string = body.studentName?.trim();
    const date: string = body.date?.trim();
    const amount = Number(body.amount);

    if (!studentName || !date || !amount || amount <= 0) {
      return NextResponse.json(
        { error: "studentName, date, and amount > 0 are required" },
        { status: 400 }
      );
    }

    const feeRecord = await getFeeByName(studentName);
    if (!feeRecord) {
      return NextResponse.json(
        { error: `Student "${studentName}" not found in fee records` },
        { status: 404 }
      );
    }

    const feeMonth = new Date(date + "T00:00:00").getMonth() + 1;
    const paymentMode = normalizePaymentMode(body.paymentMode);

    await appendDailyEntry({
      date,
      studentName,
      className: feeRecord.className,
      srNo: feeRecord.srNo,
      amount,
      feeMonth,
      paymentMode,
    });

    await rebuildFeeRowFromLog(feeRecord);

    invalidateFees();
    await recordAudit(req, {
      action: "create",
      resource: "payments",
      resourceId: feeRecord.srNo,
      summary: `Payment ₹${amount} (${paymentMode}) for ${studentName} on ${date}`,
      details: { date, amount, feeMonth, paymentMode, className: feeRecord.className },
      actor,
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

export async function DELETE(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const entryId: string = String(body.entryId);
    const studentName: string = body.studentName?.trim();
    const srNo: string = body.srNo?.trim();

    if (!entryId || !studentName || !srNo) {
      return NextResponse.json(
        { error: "entryId, studentName, and srNo are required" },
        { status: 400 }
      );
    }

    await deleteDailyEntry(entryId);

    const feeRecord = await getFeeByName(studentName);
    if (!feeRecord) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    await rebuildFeeRowFromLog(feeRecord);

    invalidateFees();
    await recordAudit(req, {
      action: "delete",
      resource: "payments",
      resourceId: srNo,
      summary: `Deleted payment log row ${entryId} for ${studentName}`,
      details: { entryId, studentName },
      actor,
    });
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
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const entryId: string = String(body.entryId);
    const newAmount = Number(body.newAmount);
    const studentName: string = body.studentName?.trim();
    const srNo: string = body.srNo?.trim();

    if (!entryId || !newAmount || newAmount <= 0 || !studentName || !srNo) {
      return NextResponse.json(
        { error: "entryId, newAmount > 0, studentName, and srNo are required" },
        { status: 400 }
      );
    }

    const newPaymentMode =
      body.paymentMode !== undefined
        ? normalizePaymentMode(body.paymentMode)
        : undefined;

    await updateDailyEntry(entryId, {
      amount: newAmount,
      ...(newPaymentMode !== undefined ? { paymentMode: newPaymentMode } : {}),
    });

    const feeRecord = await getFeeByName(studentName);
    if (!feeRecord) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    await rebuildFeeRowFromLog(feeRecord);

    invalidateFees();
    await recordAudit(req, {
      action: "update",
      resource: "payments",
      resourceId: srNo,
      summary: `Updated payment log row ${entryId} to ₹${newAmount} (${studentName})`,
      details: { entryId, newAmount, studentName },
      actor,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("edit entry error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
