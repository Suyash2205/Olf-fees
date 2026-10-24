import { NextRequest, NextResponse } from "next/server";
import { InputError } from "@/lib/input-error";
import { recordAudit } from "@/lib/audit";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { getStudentDetailViews, saveStudentDetails } from "@/lib/sheets/student-details";
import type { DetailUpdate } from "@/lib/student-records/details";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    return NextResponse.json({ students: await getStudentDetailViews() });
  } catch (err) {
    console.error("GET /api/student-records/details:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load details" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const list = Array.isArray(body?.updates) ? body.updates : null;
    if (!list) return NextResponse.json({ error: "updates[] is required." }, { status: 400 });
    const updates: DetailUpdate[] = list.map((u: { srNo?: unknown; fields?: Record<string, unknown> }) => ({
      srNo: String(u.srNo ?? ""),
      fields: Object.fromEntries(Object.entries(u.fields ?? {}).map(([k, v]) => [k, String(v ?? "")])),
    }));
    const result = await saveStudentDetails(updates, actor.email);
    // Which fields changed, never the values (phones and Aadhaar are sensitive).
    await recordAudit(req, {
      action: "update",
      resource: "student-details",
      summary: `Student details filled — ${result.students} student${result.students === 1 ? "" : "s"}`,
      details: { ...result, changes: updates.map((u) => ({ srNo: u.srNo, fields: Object.keys(u.fields) })) },
      actor,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("POST /api/student-records/details:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 500 });
  }
}
