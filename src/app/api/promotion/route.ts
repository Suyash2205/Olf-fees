import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
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
  try {
    const body = await req.json();
    const action = body.action as Action;
    const sheetRow = Number(body.sheetRow);

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
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
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("promotion error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
