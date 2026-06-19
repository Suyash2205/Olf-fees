import { NextRequest, NextResponse } from "next/server";
import { canAccessFees } from "@/lib/access-control";
import { getPortalActor } from "@/lib/portal-auth";

export async function POST(req: NextRequest) {
  const actor = await getPortalActor(req);
  if (!actor) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canAccessFees(actor.email)) {
    return NextResponse.json({ error: "Invalid passcode." }, { status: 403 });
  }

  const expected = process.env.FEES_PASSTHROUGH_PASSWORD?.trim();
  if (!expected) {
    return NextResponse.json({ error: "Passcode is not configured." }, { status: 500 });
  }

  let passcode = "";
  try {
    const body = await req.json();
    passcode = String(body.passcode ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (passcode !== expected) {
    return NextResponse.json({ error: "Invalid passcode." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
