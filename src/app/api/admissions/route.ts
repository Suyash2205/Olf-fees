import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { computeFeeBreakdown, type DiscountType } from "@/lib/fees/structure";
import { addAdmission, buildFullName, getAllAdmissions } from "@/lib/sheets/admissions";
import { getAllFees, addFeeRecord } from "@/lib/sheets/fees";
import { addStudent } from "@/lib/sheets/students";

function invalidateAll() {
  const rt = revalidateTag as (tag: string, profile: string) => void;
  rt("admissions", "default");
  rt("fees", "default");
  rt("students", "default");
}

export async function GET() {
  try {
    const admissions = await getAllAdmissions();
    return NextResponse.json(admissions);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const surname = body.surname?.trim() ?? "";
    const firstName = body.firstName?.trim() ?? "";
    const fatherName = body.fatherName?.trim() ?? "";
    const standard = body.standard?.trim() ?? "";

    if (!surname || !firstName || !standard) {
      return NextResponse.json(
        { error: "Surname, first name, and standard are required" },
        { status: 400 }
      );
    }

    const fullName = buildFullName({ surname, firstName, fatherName });
    const discountType = (body.discountType ?? "none") as DiscountType;
    const discountValue = Number(body.discountValue) || 0;
    const breakdown = computeFeeBreakdown(standard, discountType, discountValue);
    if (!breakdown) {
      return NextResponse.json({ error: `Unknown standard: ${standard}` }, { status: 400 });
    }

    const annualFee =
      body.annualFee !== undefined && body.annualFee !== ""
        ? Number(body.annualFee)
        : breakdown.finalFee;

    const admission = await addAdmission({
      formNo: body.formNo?.trim() ?? "",
      admissionDate: body.admissionDate?.trim() ?? new Date().toISOString().slice(0, 10),
      medium: body.medium?.trim() ?? "English",
      photoUrl: body.photoUrl?.trim() ?? "",
      surname,
      firstName,
      fatherName,
      motherName: body.motherName?.trim() ?? "",
      standard,
      dob: body.dob?.trim() ?? "",
      placeOfBirth: body.placeOfBirth?.trim() ?? "",
      sex: body.sex?.trim() ?? "",
      state: body.state?.trim() ?? "",
      studentContact: body.studentContact?.trim() ?? "",
      ageYears: body.ageYears?.trim() ?? "",
      ageMonths: body.ageMonths?.trim() ?? "",
      aadhar: body.aadhar?.trim() ?? "",
      religion: body.religion?.trim() ?? "",
      caste: body.caste?.trim() ?? "",
      subCaste: body.subCaste?.trim() ?? "",
      nationality: body.nationality?.trim() ?? "Indian",
      bloodGroup: body.bloodGroup?.trim() ?? "",
      motherTongue: body.motherTongue?.trim() ?? "",
      residentialAddress: body.residentialAddress?.trim() ?? "",
      lastSchool: body.lastSchool?.trim() ?? "",
      reasonLeaving: body.reasonLeaving?.trim() ?? "",
      residesWith: body.residesWith?.trim() ?? "",
      fatherSurname: body.fatherSurname?.trim() ?? "",
      fatherFirstName: body.fatherFirstName?.trim() ?? "",
      fatherMiddleName: body.fatherMiddleName?.trim() ?? "",
      fatherEducation: body.fatherEducation?.trim() ?? "",
      fatherOccupation: body.fatherOccupation?.trim() ?? "",
      fatherContact: body.fatherContact?.trim() ?? "",
      motherSurname: body.motherSurname?.trim() ?? "",
      motherFirstName: body.motherFirstName?.trim() ?? "",
      motherMiddleName: body.motherMiddleName?.trim() ?? "",
      motherEducation: body.motherEducation?.trim() ?? "",
      motherOccupation: body.motherOccupation?.trim() ?? "",
      motherContact: body.motherContact?.trim() ?? "",
      email: body.email?.trim() ?? "",
      annualFee,
      discount: breakdown.discountAmount,
    });

    const fees = await getAllFees();
    const maxSr = fees.reduce((max, f) => Math.max(max, Number(f.srNo) || 0), 0);
    const srNo = String(maxSr + 1);

    await Promise.all([
      addFeeRecord({
        srNo,
        studentName: fullName,
        className: standard,
        totalFee: annualFee,
        discountAmount: breakdown.discountAmount,
      }),
      addStudent(fullName, standard),
    ]);

    invalidateAll();
    return NextResponse.json({ ok: true, grNo: admission.grNo, fullName });
  } catch (err) {
    console.error("add admission error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
