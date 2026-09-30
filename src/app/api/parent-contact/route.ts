import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { getFeeBySrNo } from "@/lib/sheets/fees";
import {
  getResolvedParentContacts,
  normalizeIndianMobile,
  upsertParentContact,
} from "@/lib/sheets/parent-contacts";

/** GET ?srNo=… → parent name, phones and where they came from. Admin only (phones are sensitive). */
export async function GET(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  const srNo = req.nextUrl.searchParams.get("srNo")?.trim();
  if (!srNo) return NextResponse.json({ error: "srNo is required" }, { status: 400 });
  try {
    const contact = (await getResolvedParentContacts()).get(srNo);
    if (!contact) return NextResponse.json({ error: "Student not found (Sr No)." }, { status: 404 });
    return NextResponse.json({ contact });
  } catch (err) {
    console.error("GET /api/parent-contact:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load contact" },
      { status: 500 }
    );
  }
}

/** PUT { srNo, parentName, primaryPhone, alternatePhone } → upsert into the Parent Contacts tab. */
export async function PUT(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  try {
    const body = await req.json();
    const srNo = String(body.srNo ?? "").trim();
    const fee = srNo ? await getFeeBySrNo(srNo) : null;
    if (!fee) return NextResponse.json({ error: "Student not found (Sr No)." }, { status: 404 });

    const primaryPhone = String(body.primaryPhone ?? "");
    const alternatePhone = String(body.alternatePhone ?? "");
    for (const [label, v] of [
      ["Primary phone", primaryPhone],
      ["Alternate phone", alternatePhone],
    ] as const) {
      if (v.trim() && !normalizeIndianMobile(v)) {
        return NextResponse.json(
          { error: `${label} "${v.trim()}" is not a valid 10-digit mobile number.` },
          { status: 400 }
        );
      }
    }
    const parentName = String(body.parentName ?? "").trim();
    if (parentName.length > 120) {
      return NextResponse.json({ error: "Parent name is too long." }, { status: 400 });
    }

    await upsertParentContact(
      {
        srNo: fee.srNo,
        studentName: fee.studentName,
        className: fee.className,
        parentName,
        primaryPhone,
        alternatePhone,
      },
      actor.email
    );
    // No phone numbers or names in the audit trail — only that the contact changed.
    await recordAudit(req, {
      action: "update",
      resource: "parent-contacts",
      resourceId: fee.srNo,
      summary: `Parent contact updated for Sr No ${fee.srNo} (${fee.className})`,
      details: {
        primaryPhoneSet: Boolean(primaryPhone.trim()),
        alternatePhoneSet: Boolean(alternatePhone.trim()),
        parentNameSet: Boolean(parentName),
      },
      actor,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/parent-contact:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save contact" },
      { status: 500 }
    );
  }
}
