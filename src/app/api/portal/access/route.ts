import { NextRequest, NextResponse } from "next/server";
import { canAccessAttendance, canAccessFees } from "@/lib/access-control";
import { getPortalActor } from "@/lib/portal-auth";

export async function GET(req: NextRequest) {
  const actor = await getPortalActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return NextResponse.json({
    canAccessFees: canAccessFees(actor.email),
    canAccessAttendance: canAccessAttendance(actor.email),
  });
}
