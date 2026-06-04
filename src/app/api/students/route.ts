import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import {
  computeFeeBreakdown,
  type DiscountType,
} from "@/lib/fees/structure";
import { parseGrNoFromNotes } from "@/lib/admission-form";
import { normalizeStudentName } from "@/lib/admission-utils";
import { registerStudentFromAdmission } from "@/lib/sheets/admission-sync";
import { getAllAdmissions } from "@/lib/sheets/admissions";
import { getAllFees } from "@/lib/sheets/fees";
import { invalidatePortalCache } from "@/lib/sheets/invalidate-portal-cache";

// Derive student list from fee records — sync runs on GET /api/fees only (avoids parallel write races).
export async function GET() {
  try {
    const [fees, admissions] = await Promise.all([getAllFees(), getAllAdmissions()]);
    const grByName = new Map(
      admissions.map((a) => [normalizeStudentName(a.fullName), a.grNo])
    );

    const students = fees.map((f) => {
      const grNo =
        grByName.get(normalizeStudentName(f.studentName)) ??
        parseGrNoFromNotes(f.notes) ??
        null;
      return {
        name: f.studentName,
        className: f.className,
        fees: f.totalFee > 0 ? `₹${f.totalFee.toLocaleString("en-IN")}` : "",
        sheetRow: f.sheetRow,
        grNo,
        hasProfile: Boolean(grNo),
      };
    });
    return NextResponse.json(students);
  } catch (err) {
    console.error("GET /api/students:", err);
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
    const name = body.name?.trim();
    const className = body.className?.trim();
    const discountType = (body.discountType ?? "none") as DiscountType;
    const discountValue = Number(body.discountValue) || 0;

    if (!name || !className) {
      return NextResponse.json({ error: "Name and class are required" }, { status: 400 });
    }

    const breakdown = computeFeeBreakdown(className, discountType, discountValue);
    if (!breakdown) {
      return NextResponse.json({ error: `Unknown class: ${className}` }, { status: 400 });
    }

    const totalFee =
      body.totalFee !== undefined && body.totalFee !== ""
        ? Number(body.totalFee)
        : breakdown.finalFee;

    if (isNaN(totalFee) || totalFee < 0) {
      return NextResponse.json({ error: "Invalid total fee" }, { status: 400 });
    }

    const { srNo } = await registerStudentFromAdmission({
      fullName: name,
      standard: className,
      annualFee: totalFee,
      discountAmount: breakdown.discountAmount,
      grNo: "",
    });

    invalidatePortalCache();
    await recordAudit(req, {
      action: "create",
      resource: "students",
      resourceId: srNo,
      summary: `Added student ${name} (${className})`,
      details: { name, className, totalFee, discountType, discountValue },
      actor,
    });
    return NextResponse.json({ ok: true, srNo });
  } catch (err) {
    console.error("add student error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
