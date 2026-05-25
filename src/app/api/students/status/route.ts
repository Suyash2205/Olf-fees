import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { setStudentStatus } from "@/lib/sheets/student-lifecycle";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isAdminAuthorized(req)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
    const status = body.status?.trim();
    const sheetRow = body.sheetRow != null ? Number(body.sheetRow) : undefined;
    const grNo = body.grNo?.trim();

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }
    if (!sheetRow && !grNo) {
      return NextResponse.json({ error: "sheetRow or grNo is required" }, { status: 400 });
    }

    const result = await setStudentStatus({ sheetRow, grNo, status });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("student status error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
