import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isValidCategoryName, normalizeCategoryName } from "@/lib/expense-categories";
import { normalizePaymentMode } from "@/lib/payment-mode";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import {
  addExpenseCategory,
  appendExpenseEntry,
  deleteExpenseEntry,
  getAllExpenseEntries,
  getExpenseCategories,
  updateExpenseEntry,
} from "@/lib/sheets/dailyExpense";

export async function GET() {
  try {
    const [entries, categories] = await Promise.all([
      getAllExpenseEntries(),
      getExpenseCategories(),
    ]);
    return NextResponse.json({ entries, categories });
  } catch (err) {
    console.error("GET daily-expense:", err);
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
    const date = String(body.date ?? "").trim();
    const category = normalizeCategoryName(String(body.category ?? ""));
    const amount = Number(body.amount);
    const comment = String(body.comment ?? "").trim();
    const paymentMode = normalizePaymentMode(body.paymentMode);

    if (!date || !category || !amount || amount <= 0) {
      return NextResponse.json(
        { error: "date, category, and amount > 0 are required" },
        { status: 400 }
      );
    }
    if (!comment) {
      return NextResponse.json({ error: "comment is required" }, { status: 400 });
    }

    await appendExpenseEntry({ date, category, amount, paymentMode, comment });

    await recordAudit(req, {
      action: "create",
      resource: "expenses",
      resourceId: category,
      summary: `Expense ₹${amount} (${paymentMode}) — ${category}`,
      details: { date, category, amount, paymentMode, comment },
      actor,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST daily-expense:", err);
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
    const comment = body.comment !== undefined ? String(body.comment).trim() : undefined;

    if (!entryId) {
      return NextResponse.json({ error: "entryId is required" }, { status: 400 });
    }
    if (comment !== undefined && !comment) {
      return NextResponse.json({ error: "comment cannot be empty" }, { status: 400 });
    }

    const update: Parameters<typeof updateExpenseEntry>[1] = {};
    if (body.date !== undefined) update.date = String(body.date).trim();
    if (body.category !== undefined) {
      update.category = normalizeCategoryName(String(body.category));
    }
    if (body.amount !== undefined) update.amount = Number(body.amount);
    if (body.paymentMode !== undefined) {
      update.paymentMode = normalizePaymentMode(body.paymentMode);
    }
    if (comment !== undefined) update.comment = comment;

    if (update.amount !== undefined && (isNaN(update.amount) || update.amount <= 0)) {
      return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
    }

    await updateExpenseEntry(entryId, update);

    await recordAudit(req, {
      action: "update",
      resource: "expenses",
      resourceId: entryId,
      summary: `Updated expense row ${entryId}`,
      details: update,
      actor,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH daily-expense:", err);
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

    await deleteExpenseEntry(entryId);

    await recordAudit(req, {
      action: "delete",
      resource: "expenses",
      resourceId: entryId,
      summary: `Deleted expense row ${entryId}`,
      actor,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE daily-expense:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
