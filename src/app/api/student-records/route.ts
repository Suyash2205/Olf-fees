import { NextRequest, NextResponse } from "next/server";
import { InputError } from "@/lib/input-error";
import { recordAudit } from "@/lib/audit";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { getStudentRecordViews, saveStudentRecords } from "@/lib/sheets/student-records";
import type { StudentRecordFields } from "@/lib/student-records/records";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    return NextResponse.json({ students: await getStudentRecordViews() });
  } catch (err) {
    console.error("GET /api/student-records:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load student records" },
      { status: 500 }
    );
  }
}

const ALLOWED_KEYS: (keyof StudentRecordFields)[] = [
  "height",
  "weight",
  "measuredOn",
  "udiseStatus",
  "udiseReason",
  "udiseNote",
];

export async function POST(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const list = Array.isArray(body?.updates) ? body.updates : null;
    if (!list) return NextResponse.json({ error: "updates[] is required." }, { status: 400 });

    const updates = list.map((u: { srNo?: unknown; fields?: Record<string, unknown> }) => {
      const fields: StudentRecordFields = {};
      for (const k of ALLOWED_KEYS) {
        if (u.fields && k in u.fields) fields[k] = String(u.fields[k] ?? "");
      }
      return { srNo: String(u.srNo ?? ""), fields };
    });

    const result = await saveStudentRecords(updates, actor.email);

    await recordAudit(req, {
      action: "update",
      resource: "student-records",
      summary: `Student records saved — ${result.saved} row${result.saved === 1 ? "" : "s"}`,
      details: { ...result, srNos: updates.map((u: { srNo: string }) => u.srNo) },
      actor,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("POST /api/student-records:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 }
    );
  }
}
