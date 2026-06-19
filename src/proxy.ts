import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { canAccessAttendance, canAccessFees } from "@/lib/access-control";

const FEES_PATH_PREFIXES = [
  "/dashboard",
  "/admissions",
  "/students",
  "/fees",
  "/fees-dashboard",
  "/daily-entry",
  "/other-fees",
  "/daily-expense",
  "/expense-dashboard",
  "/pending",
  "/classes",
  "/udise",
  "/admin",
];

function isFeesPath(pathname: string): boolean {
  return FEES_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token?.email) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const email = String(token.email);
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/attendance")) {
    if (!canAccessAttendance(email)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "no_attendance_access");
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  if (isFeesPath(pathname) && !canAccessFees(email)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "no_fees_access");
    if (canAccessAttendance(email)) {
      loginUrl.searchParams.set("hint", "attendance");
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admissions/:path*",
    "/students/:path*",
    "/fees/:path*",
    "/fees-dashboard/:path*",
    "/daily-entry/:path*",
    "/other-fees/:path*",
    "/daily-expense/:path*",
    "/expense-dashboard/:path*",
    "/pending/:path*",
    "/classes/:path*",
    "/udise/:path*",
    "/admin/:path*",
    "/attendance/:path*",
  ],
};
