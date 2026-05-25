import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE = "olf_admin_session";

function adminSecret(): string {
  return process.env.ADMIN_PASSWORD ?? process.env.NEXTAUTH_SECRET ?? "olf-admin-fallback";
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "Olf@123";
}

function signToken(): string {
  return createHmac("sha256", adminSecret()).update("olf-admin-ok").digest("hex");
}

export function verifyAdminPassword(password: string): boolean {
  const expected = getAdminPassword();
  if (password.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(password), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function createAdminCookieValue(): string {
  return signToken();
}

export function isValidAdminCookie(value: string | undefined): boolean {
  if (!value) return false;
  const expected = signToken();
  if (value.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function isAdminRequest(req: NextRequest): boolean {
  return isValidAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value);
}

/** Valid admin cookie session or password sent with the request. */
export function isAdminAuthorized(
  req: NextRequest,
  password?: string | null
): boolean {
  if (isAdminRequest(req)) return true;
  if (password && verifyAdminPassword(password)) return true;
  return false;
}
