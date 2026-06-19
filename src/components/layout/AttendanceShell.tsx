"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, CalendarCheck, ClipboardList, LogOut } from "lucide-react";
import SchoolLogo from "@/components/SchoolLogo";
import FeesPortalUnlockDialog from "@/components/attendance/FeesPortalUnlockDialog";
import {
  canShowFeesPortalBackLink,
  markAttendanceFromFees,
  setFeesPortalUnlocked,
} from "@/lib/attendance/portal-bridge";
import { portalFetch } from "@/lib/portal-fetch";

const NAV = [
  { href: "/attendance", label: "Record", icon: CalendarCheck, exact: true },
  { href: "/attendance/history", label: "History", icon: ClipboardList, exact: false },
  { href: "/attendance/dashboard", label: "Dashboard", icon: BarChart3, exact: false },
] as const;

function AttendanceShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [showFeesBack, setShowFeesBack] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const tapRef = useRef({ count: 0, last: 0 });

  const refreshFeesBack = useCallback(async () => {
    if (!canShowFeesPortalBackLink()) {
      setShowFeesBack(false);
      return;
    }
    try {
      const res = await portalFetch("/api/portal/access");
      const data = await res.json();
      setShowFeesBack(Boolean(res.ok && data.canAccessFees));
    } catch {
      setShowFeesBack(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("from") === "fees") {
      markAttendanceFromFees();
    }
    void refreshFeesBack();
  }, [searchParams, refreshFeesBack]);

  function handleSchoolNameTap() {
    const now = Date.now();
    if (now - tapRef.current.last > 2000) {
      tapRef.current.count = 0;
    }
    tapRef.current.last = now;
    tapRef.current.count += 1;
    if (tapRef.current.count >= 5) {
      tapRef.current.count = 0;
      setUnlockOpen(true);
    }
  }

  function handleUnlockSuccess() {
    setFeesPortalUnlocked();
    void refreshFeesBack();
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {showFeesBack && (
        <div className="border-b border-blue-100 bg-blue-50 px-4 py-2">
          <div className="mx-auto max-w-3xl">
            <Link
              href="/dashboard"
              className="text-sm font-semibold text-blue-700 hover:text-blue-800"
            >
              ← Fees portal
            </Link>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <SchoolLogo size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800">Attendance</p>
            <button
              type="button"
              onClick={handleSchoolNameTap}
              className="truncate text-left text-xs text-slate-500"
            >
              Our Lady of Fatima School
            </button>
          </div>
          {session?.user && (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-500"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-24 sm:pb-6">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white sm:hidden">
        <div className="grid grid-cols-3">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-1 py-3 text-xs font-medium ${
                  active ? "text-blue-600" : "text-slate-500"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "text-blue-600" : "text-slate-400"}`} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="hidden sm:block border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl gap-1 px-4 py-2">
          {NAV.map(({ href, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      <FeesPortalUnlockDialog
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        onSuccess={handleUnlockSuccess}
      />
    </div>
  );
}

export default function AttendanceShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">
          Loading…
        </div>
      }
    >
      <AttendanceShellInner>{children}</AttendanceShellInner>
    </Suspense>
  );
}
