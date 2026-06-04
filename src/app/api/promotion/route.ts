import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { revalidateTag } from "next/cache";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import {
  demoteAll,
  demoteOne,
  promoteAll,
  promoteOne,
} from "@/lib/sheets/promotion";

function invalidateAll() {
  const rt = revalidateTag as (tag: string, profile: string) => void;
  rt("fees", "default");
  rt("students", "default");
}

type Action = "promote-all" | "demote-all" | "promote" | "demote";

export async function POST(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const action = body.action as Action;
    const sheetRow = Number(body.sheetRow);

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const adminPassword =
      typeof body.adminPassword === "string" ? body.adminPassword : undefined;

    if (!isAdminAuthorized(req, adminPassword)) {
      return NextResponse.json(
        { error: "Incorrect admin password." },
        { status: 401 }
      );
    }

    let result;
    switch (action) {
      case "promote-all":
        result = await promoteAll();
        break;
      case "demote-all":
        result = await demoteAll();
        break;
      case "promote":
        if (!sheetRow) {
          return NextResponse.json({ error: "sheetRow is required" }, { status: 400 });
        }
        result = await promoteOne(sheetRow);
        break;
      case "demote":
        if (!sheetRow) {
          return NextResponse.json({ error: "sheetRow is required" }, { status: 400 });
        }
        result = await demoteOne(sheetRow);
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    invalidateAll();
    await recordAudit(req, {
      action: action,
      resource: "promotion",
      resourceId: sheetRow ? String(sheetRow) : "all",
      summary: `Promotion: ${action}`,
      details: { action, sheetRow: sheetRow || null, result },
      actor,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("promotion error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
