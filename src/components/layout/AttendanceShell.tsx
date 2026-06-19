"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { BarChart3, CalendarCheck, ClipboardList, LogOut } from "lucide-react";
import SchoolLogo from "@/components/SchoolLogo";

const NAV = [
  { href: "/attendance", label: "Record", icon: CalendarCheck, exact: true },
  { href: "/attendance/history", label: "History", icon: ClipboardList, exact: false },
  { href: "/attendance/dashboard", label: "Dashboard", icon: BarChart3, exact: false },
] as const;

export default function AttendanceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <SchoolLogo size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800">Attendance</p>
            <p className="truncate text-xs text-slate-500">Our Lady of Fatima School</p>
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-24 sm:pb-6">
        {children}
      </main>

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
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
