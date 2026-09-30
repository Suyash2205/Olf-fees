import { NextRequest, NextResponse } from "next/server";
import { InputError } from "@/lib/input-error";
import { recordAudit } from "@/lib/audit";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { addCalendarEntry, cancelCalendarEntry, readCalendarRows } from "@/lib/sheets/school-calendar";

export const runtime = "nodejs";

/** Admin view: every row, including cancelled and invalid ones, with sheet row numbers. */
export async function GET(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    return NextResponse.json({ rows: await readCalendarRows() });
  } catch (err) {
    console.error("GET /api/school-calendar:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load calendar" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const entry = await addCalendarEntry(
      {
        startDate: String(body.startDate ?? ""),
        endDate: body.endDate ? String(body.endDate) : undefined,
        type: String(body.type ?? ""),
        classes: body.classes === "All" ? "All" : Array.isArray(body.classes) ? body.classes.map(String) : [],
        title: String(body.title ?? ""),
      },
      actor.email
    );
    await recordAudit(req, {
      action: "create",
      resource: "school-calendar",
      resourceId: entry.startDate,
      summary: `${entry.type} added — ${entry.title} (${entry.startDate}${entry.endDate !== entry.startDate ? ` to ${entry.endDate}` : ""})`,
      details: { classes: entry.classes },
      actor,
    });
    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("POST /api/school-calendar:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add entry" },
      { status: 500 }
    );
  }
}

/** Marks an entry Cancelled (no row is deleted). Body: { sheetRow, date }. */
export async function DELETE(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const sheetRow = Number(body.sheetRow);
    const date = String(body.date ?? "");
    if (!Number.isInteger(sheetRow) || sheetRow < 2 || !date) {
      return NextResponse.json({ error: "sheetRow and date are required." }, { status: 400 });
    }
    await cancelCalendarEntry(sheetRow, date);
    await recordAudit(req, {
      action: "delete",
      resource: "school-calendar",
      resourceId: date,
      summary: `Calendar entry cancelled — ${date}`,
      details: { sheetRow },
      actor,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("DELETE /api/school-calendar:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to cancel entry" },
      { status: 500 }
    );
  }
}
