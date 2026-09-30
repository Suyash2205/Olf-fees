import { NextRequest, NextResponse } from "next/server";
import { InputError } from "@/lib/input-error";
import { recordAudit } from "@/lib/audit";
import { normalizeReceiptNo } from "@/lib/fees/receipt";
import { buildSplitParts, saveAllOrNothing } from "@/lib/fees/split-payment";
import { normalizePaymentMode } from "@/lib/payment-mode";
import { getPortalActor, isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { revalidateTag } from "next/cache";
import { invalidateSheetCache } from "@/lib/sheets/read-cache";
import {
  getAllDailyEntries,
  getDailyEntriesForStudent,
  appendDailyEntry,
  updateDailyEntry,
  deleteDailyEntry,
} from "@/lib/sheets/dailyLog";
import { getFeeByName, getFeeBySrNo, recalculateStudentFees, syncFeeRowAmounts } from "@/lib/sheets/fees";
import type { FeeRecord } from "@/lib/sheets/fees";
import { feeMonthForEntry, reconcileStudentPayments } from "@/lib/sheets/payment-sync";

function invalidateFees() {
  invalidateSheetCache();
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
        try {
          const all = await getAllDailyEntries();
          await reconcileStudentPayments(fee, all, { req, actor });
        } catch (reconcileErr) {
          console.error("daily-entry reconcile:", reconcileErr);
        }
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
    const srNoInput: string = String(body.srNo ?? "").trim();
    const date: string = body.date?.trim();
    const isSplit = body.paymentMode === "split";
    const amount = isSplit
      ? Number(body.cashAmount) + Number(body.onlineAmount)
      : Number(body.amount);

    if ((!studentName && !srNoInput) || !date || !amount || amount <= 0) {
      return NextResponse.json(
        { error: "studentName, date, and amount > 0 are required" },
        { status: 400 }
      );
    }

    let receiptNo: string | undefined;
    try {
      receiptNo = normalizeReceiptNo(body.receiptNo);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    // Prefer Sr No (unique) over name (duplicates exist).
    const feeRecord: FeeRecord | null = srNoInput
      ? await getFeeBySrNo(srNoInput)
      : await getFeeByName(studentName);
    if (!feeRecord) {
      return NextResponse.json(
        { error: `Student "${studentName || srNoInput}" not found in fee records` },
        { status: 404 }
      );
    }

    const feeMonth = new Date(date + "T00:00:00").getMonth() + 1;
    const comment =
      typeof body.comment === "string" ? body.comment.trim() : undefined;

    let parts: { paymentMode: "cash" | "online"; amount: number; comment?: string }[];
    if (isSplit) {
      try {
        parts = buildSplitParts(
          Number(body.cashAmount),
          Number(body.onlineAmount),
          comment
        ).map((p) => ({ paymentMode: p.paymentMode, amount: p.amount, comment: p.note }));
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
      }
    } else {
      parts = [
        {
          paymentMode: normalizePaymentMode(body.paymentMode),
          amount,
          ...(comment ? { comment } : {}),
        },
      ];
    }

    const toInput = (p: (typeof parts)[number]) => ({
      date,
      studentName: feeRecord.studentName,
      className: feeRecord.className,
      srNo: feeRecord.srNo,
      amount: p.amount,
      feeMonth,
      paymentMode: p.paymentMode,
      ...(p.comment ? { comment: p.comment } : {}),
      ...(receiptNo ? { receiptNo } : {}),
    });

    try {
      // All-or-nothing: if the 2nd row of a split fails, the 1st is deleted again.
      await saveAllOrNothing(
        parts,
        (p) => appendDailyEntry(toInput(p)),
        (rowId, p) =>
          deleteDailyEntry(rowId, {
            srNo: feeRecord.srNo,
            date,
            amount: p.amount,
            feeMonth,
          })
      );
    } catch (e) {
      invalidateFees();
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json(
        {
          error: isSplit
            ? `${msg} No part of the split payment was kept — check the payment history before retrying.`
            : msg,
        },
        { status: 500 }
      );
    }

    try {
      await rebuildFeeRowFromLog(feeRecord);
    } catch (e) {
      invalidateFees();
      console.error("daily entry rebuild error:", e);
      return NextResponse.json(
        {
          error:
            "The payment was saved to the log, but Fee details could not be updated. Do not enter it again — open the student to re-sync.",
        },
        { status: 500 }
      );
    }

    invalidateFees();
    await recordAudit(req, {
      action: "create",
      resource: "payments",
      resourceId: feeRecord.srNo,
      summary: isSplit
        ? `Split payment ₹${amount} (cash ₹${parts[0].amount} + online ₹${parts[1].amount}) for ${feeRecord.studentName} on ${date}`
        : `Payment ₹${amount} (${parts[0].paymentMode}) for ${feeRecord.studentName} on ${date}`,
      details: {
        date,
        amount,
        feeMonth,
        paymentMode: isSplit ? "split" : parts[0].paymentMode,
        parts: parts.map((p) => ({ paymentMode: p.paymentMode, amount: p.amount })),
        className: feeRecord.className,
        comment,
        receiptNo,
      },
      actor,
    });
    return NextResponse.json({ ok: true, receiptNo: receiptNo ?? null, rows: parts.length });
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
    const date: string = String(body.date ?? "").trim();
    const amount = Number(body.amount);
    const feeMonth =
      body.feeMonth !== undefined && body.feeMonth !== ""
        ? Number(body.feeMonth)
        : undefined;

    if (!entryId || !studentName || !srNo) {
      return NextResponse.json(
        { error: "entryId, studentName, and srNo are required" },
        { status: 400 }
      );
    }

    await deleteDailyEntry(
      entryId,
      date && amount > 0
        ? { srNo, date, amount, ...(feeMonth ? { feeMonth } : {}) }
        : undefined
    );

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
    const comment =
      body.comment !== undefined
        ? typeof body.comment === "string"
          ? body.comment.trim()
          : ""
        : undefined;

    let receiptNo: string | undefined;
    if (body.receiptNo !== undefined) {
      try {
        receiptNo = normalizeReceiptNo(body.receiptNo) ?? "";
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
      }
    }

    await updateDailyEntry(entryId, {
      amount: newAmount,
      ...(receiptNo !== undefined ? { receiptNo } : {}),
      ...(newPaymentMode !== undefined ? { paymentMode: newPaymentMode } : {}),
      ...(comment !== undefined ? { comment } : {}),
    }, srNo);

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
    if (err instanceof InputError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("edit entry error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
