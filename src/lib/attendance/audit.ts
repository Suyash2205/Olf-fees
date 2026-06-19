import type { NextRequest } from "next/server";
import { appendAttendanceAuditLog } from "@/lib/sheets/attendance-audit-log";
import { getPortalActor, type PortalActor } from "@/lib/portal-auth";

export type AttendanceAuditParams = {
  action: string;
  className: string;
  date: string;
  summary: string;
  details?: Record<string, unknown>;
  actor?: PortalActor | null;
};

/** Append one row to Attendance Audit Log (never throws). */
export async function recordAttendanceAudit(
  req: NextRequest,
  params: AttendanceAuditParams
): Promise<void> {
  try {
    const actor = params.actor ?? (await getPortalActor(req));
    await appendAttendanceAuditLog({
      timestamp: new Date().toISOString(),
      userEmail: actor?.email ?? "unknown",
      accountName: actor?.name ?? "",
      action: params.action,
      className: params.className,
      date: params.date,
      summary: params.summary,
      details: params.details ? JSON.stringify(params.details) : "",
    });
  } catch (err) {
    console.error("attendance audit failed:", err);
  }
}
