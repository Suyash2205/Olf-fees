import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { normalizeFeeTypeName } from "@/lib/other-fee-types";
import { normalizePaymentMode } from "@/lib/payment-mode";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { getFeeByName } from "@/lib/sheets/fees";
import {
  appendOtherFeeEntry,
  deleteOtherFeeEntry,
  getAllOtherFeeEntries,
  getOtherFeeEntriesForStudent,
  getOtherFeeTypes,
  updateOtherFeeEntry,
} from "@/lib/sheets/otherFeesLog";

export async function GET(req: NextRequest) {
  const srNo = req.nextUrl.searchParams.get("srNo");
  try {
    if (srNo) {
      const [entries, feeTypes] = await Promise.all([
        getOtherFeeEntriesForStudent(srNo),
        getOtherFeeTypes(),
      ]);
      return NextResponse.json({ entries, feeTypes });
    }
    const [entries, feeTypes] = await Promise.all([
      getAllOtherFeeEntries(),
      getOtherFeeTypes(),
    ]);
    return NextResponse.json({ entries, feeTypes });
  } catch (err) {
    console.error("GET other-fees:", err);
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
    const studentName = String(body.studentName ?? "").trim();
    const date = String(body.date ?? "").trim();
    const feeType = normalizeFeeTypeName(String(body.feeType ?? ""));
    const amount = Number(body.amount);
    const notes = String(body.notes ?? "").trim();
    const paymentMode = normalizePaymentMode(body.paymentMode);

    if (!studentName || !date || !feeType || !amount || amount <= 0) {
      return NextResponse.json(
        { error: "studentName, date, feeType, and amount > 0 are required" },
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

    if (feeType.toLowerCase() === "other" && !notes) {
      return NextResponse.json(
        { error: "Notes are required when fee type is Other" },
        { status: 400 }
      );
    }

    await appendOtherFeeEntry({
      date,
      studentName: feeRecord.studentName,
      className: feeRecord.className,
      srNo: feeRecord.srNo,
      feeType,
      amount,
      paymentMode,
      notes,
    });

    await recordAudit(req, {
      action: "create",
      resource: "other-fees",
      resourceId: feeRecord.srNo,
      summary: `Other fee ₹${amount} (${feeType}) — ${feeRecord.studentName}`,
      details: { date, feeType, amount, paymentMode, notes },
      actor,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST other-fees:", err);
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
    const entryId = String(body.entryId ?? "");
    if (!entryId) {
      return NextResponse.json({ error: "entryId is required" }, { status: 400 });
    }

    const update: Parameters<typeof updateOtherFeeEntry>[1] = {};
    if (body.amount !== undefined) update.amount = Number(body.amount);
    if (body.paymentMode !== undefined) {
      update.paymentMode = normalizePaymentMode(body.paymentMode);
    }
    if (body.feeType !== undefined) {
      update.feeType = normalizeFeeTypeName(String(body.feeType));
    }
    if (body.notes !== undefined) update.notes = String(body.notes).trim();

    if (update.amount !== undefined && (isNaN(update.amount) || update.amount <= 0)) {
      return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
    }

    await updateOtherFeeEntry(entryId, update);

    await recordAudit(req, {
      action: "update",
      resource: "other-fees",
      resourceId: entryId,
      summary: `Updated other fee row ${entryId}`,
      details: update,
      actor,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH other-fees:", err);
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
    const entryId = String(body.entryId ?? "");
    if (!entryId) {
      return NextResponse.json({ error: "entryId is required" }, { status: 400 });
    }

    await deleteOtherFeeEntry(entryId, {
      srNo: String(body.srNo ?? ""),
      date: String(body.date ?? ""),
      amount: Number(body.amount),
      feeType: String(body.feeType ?? ""),
    });

    await recordAudit(req, {
      action: "delete",
      resource: "other-fees",
      resourceId: entryId,
      summary: `Deleted other fee row ${entryId}`,
      actor,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE other-fees:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
