import { NextRequest, NextResponse } from "next/server";
import {
  admissionToFormValues,
  feeToFormDefaults,
  findAdmissionByStudentName,
  parseGrNoFromNotes,
} from "@/lib/admission-form";
import { getAdmissionByGrNo, readAllAdmissionsFromSheet } from "@/lib/sheets/admissions";
import { getFeeByName, readAllFeesFromSheet } from "@/lib/sheets/fees";

export async function GET(req: NextRequest) {
  try {
    const student = req.nextUrl.searchParams.get("student")?.trim();
    const grNoParam = req.nextUrl.searchParams.get("grNo")?.trim();

    if (!student && !grNoParam) {
      return NextResponse.json({ error: "student or grNo required" }, { status: 400 });
    }

    let admission = grNoParam ? await getAdmissionByGrNo(grNoParam) : null;
    let fee = student ? await getFeeByName(student) : null;

    if (!fee && student) {
      const all = await readAllFeesFromSheet();
      const q = student.toLowerCase();
      fee =
        all.find((f) => f.studentName.toLowerCase() === q) ??
        all.find((f) => f.studentName.toLowerCase().includes(q.split(" ")[0])) ??
        null;
    }

    if (!admission && fee?.notes) {
      const fromNotes = parseGrNoFromNotes(fee.notes);
      if (fromNotes) admission = await getAdmissionByGrNo(fromNotes);
    }

    if (!admission && student) {
      const all = await readAllAdmissionsFromSheet();
      admission = findAdmissionByStudentName(all, student);
    }

    if (!admission && !fee) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const grNo = admission?.grNo ?? (fee ? parseGrNoFromNotes(fee.notes) : null);
    const hasAdmission = Boolean(admission);

    return NextResponse.json({
      admission,
      fee,
      grNo,
      hasAdmission,
      formDefaults: admission
        ? admissionToFormValues(admission)
        : fee
          ? feeToFormDefaults(fee)
          : null,
      linkStudentName: fee?.studentName ?? student ?? "",
    });
  } catch (err) {
    console.error("admission lookup error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
