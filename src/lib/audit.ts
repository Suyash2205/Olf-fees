import type { NextRequest } from "next/server";
import { appendAuditLog } from "@/lib/sheets/audit-log";
import { getPortalActor, type PortalActor } from "@/lib/portal-auth";

export type AuditParams = {
  action: string;
  resource: string;
  resourceId?: string;
  summary: string;
  details?: Record<string, unknown>;
  actor?: PortalActor | null;
};

/** Append one row to the Audit Log sheet (never throws — failures are console-only). */
export async function recordAudit(
  req: NextRequest,
  params: AuditParams
): Promise<void> {
  try {
    const actor = params.actor ?? (await getPortalActor(req));
    const details = params.details
      ? JSON.stringify(params.details)
      : "";

    await appendAuditLog({
      timestamp: new Date().toISOString(),
      userEmail: actor?.email ?? "unknown",
      accountName: actor?.name ?? "",
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId ?? "",
      summary: params.summary,
      details,
    });
  } catch (err) {
    console.error("audit log failed:", err);
  }
}
