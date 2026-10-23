import { NextRequest, NextResponse } from "next/server";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { readWaParents, readWaReplies } from "@/lib/sheets/whatsapp-bot";

export const runtime = "nodejs";

/** Admin view of what the WhatsApp bot reported: parent status and recent replies. */
export async function GET(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const [parents, replies] = await Promise.all([readWaParents(), readWaReplies()]);
    return NextResponse.json({
      parents,
      replies: [...replies].sort((a, b) => (a["Received At"] < b["Received At"] ? 1 : -1)).slice(0, 300),
    });
  } catch (err) {
    console.error("GET /api/whatsapp:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load" }, { status: 500 });
  }
}
