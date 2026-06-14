import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isValidCategoryName, normalizeCategoryName } from "@/lib/expense-categories";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { addExpenseCategory, getExpenseCategories } from "@/lib/sheets/dailyExpense";

export async function GET() {
  try {
    const categories = await getExpenseCategories();
    return NextResponse.json(categories);
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
    const name = normalizeCategoryName(String(body.name ?? ""));
    if (!isValidCategoryName(name)) {
      return NextResponse.json(
        { error: "Category name must be at least 2 characters" },
        { status: 400 }
      );
    }

    const category = await addExpenseCategory(name);

    await recordAudit(req, {
      action: "create",
      resource: "expense-categories",
      resourceId: category,
      summary: `Added expense category: ${category}`,
      actor,
    });

    const categories = await getExpenseCategories();
    return NextResponse.json({ ok: true, category, categories });
  } catch (err) {
    console.error("POST expense category:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
