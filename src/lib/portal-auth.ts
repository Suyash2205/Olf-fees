import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { canAccessFees } from "@/lib/access-control";

export type PortalActor = {
  email: string;
  name: string;
};

export async function getPortalActor(req: NextRequest): Promise<PortalActor | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) return null;
  return {
    email: String(token.email),
    name: String(token.name ?? token.email),
  };
}

/** Fees & expense portal APIs — requires admin allowlist. */
export async function requirePortalActor(
  req: NextRequest
): Promise<PortalActor | NextResponse> {
  const actor = await getPortalActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canAccessFees(actor.email)) {
    return NextResponse.json(
      { error: "You do not have access to the fees portal." },
      { status: 403 }
    );
  }
  return actor;
}

export function isPortalActor(
  value: PortalActor | NextResponse
): value is PortalActor {
  return !(value instanceof NextResponse);
}
