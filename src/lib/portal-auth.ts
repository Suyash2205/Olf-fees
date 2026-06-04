import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

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

export async function requirePortalActor(
  req: NextRequest
): Promise<PortalActor | NextResponse> {
  const actor = await getPortalActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return actor;
}

export function isPortalActor(
  value: PortalActor | NextResponse
): value is PortalActor {
  return !(value instanceof NextResponse);
}
