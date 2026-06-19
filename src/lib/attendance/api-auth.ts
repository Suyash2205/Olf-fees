import { NextRequest, NextResponse } from "next/server";
import { canAccessAttendance } from "@/lib/access-control";
import { getPortalActor, type PortalActor } from "@/lib/portal-auth";

export async function requireAttendanceApiAuth(
  req: NextRequest
): Promise<NextResponse | null> {
  const actor = await getPortalActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canAccessAttendance(actor.email)) {
    return NextResponse.json(
      { error: "You do not have access to the attendance system." },
      { status: 403 }
    );
  }
  return null;
}

/** Attendance write APIs that need actor details for audit log. */
export async function requireAttendanceActor(
  req: NextRequest
): Promise<PortalActor | NextResponse> {
  const actor = await getPortalActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canAccessAttendance(actor.email)) {
    return NextResponse.json(
      { error: "You do not have access to the attendance system." },
      { status: 403 }
    );
  }
  return actor;
}
