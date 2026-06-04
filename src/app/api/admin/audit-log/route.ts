import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { readAuditLogs } from "@/lib/sheets/audit-log";

export async function GET(req: NextRequest) {
  const adminPassword =
    typeof req.nextUrl.searchParams.get("adminPassword") === "string"
      ? req.nextUrl.searchParams.get("adminPassword")!
      : undefined;

  if (!isAdminAuthorized(req, adminPassword || undefined)) {
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
  }

  try {
    const limit = Math.min(
      2000,
      Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 500)
    );
    const logs = await readAuditLogs(limit);
    return NextResponse.json(logs);
  } catch (err) {
    console.error("audit log read error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
