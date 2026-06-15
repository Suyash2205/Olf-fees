"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  IndianRupee,
  AlertCircle,
  GraduationCap,
  School,
  RefreshCw,
  LogOut,
  BarChart3,
  ClipboardList,
  LineChart,
  Receipt,
  UserPlus,
  Database,
  Shield,
  X,
  Wallet,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };

const GENERAL_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admissions", label: "Admissions", icon: UserPlus },
  { href: "/udise", label: "UDISE", icon: Database },
  { href: "/students", label: "Students", icon: Users },
];

const SCHOOL_FEE_ITEMS: NavItem[] = [
  { href: "/fees", label: "Fees", icon: IndianRupee },
  { href: "/daily-entry", label: "Daily Fees Entry", icon: ClipboardList },
  { href: "/fees-dashboard", label: "Fees Dashboard", icon: LineChart },
  { href: "/pending", label: "Pending Fees", icon: AlertCircle },
  { href: "/classes", label: "Classes", icon: GraduationCap },
];

const OTHER_FEE_ITEMS: NavItem[] = [
  { href: "/other-fees", label: "Other Fees Entry", icon: Wallet },
];

const EXPENSE_ITEMS: NavItem[] = [
  { href: "/daily-expense", label: "Daily Expense", icon: Receipt },
  { href: "/expense-dashboard", label: "Expense Dashboard", icon: BarChart3 },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin", label: "Admin", icon: Shield },
];

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

function NavSection({
  title,
  items,
  pathname,
  onClose,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onClose?: () => void;
}) {
  return (
    <div className="pt-2">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <div className="space-y-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`} />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] min-h-screen flex-col border-r border-slate-200 bg-white",
        "transition-transform duration-200 ease-out",
        "lg:static lg:z-auto lg:w-64 lg:shrink-0 lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}
    >
      <div className="relative border-b border-slate-200 px-5 py-4 lg:px-6 lg:py-5">
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 pr-8 lg:pr-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <School className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold leading-tight text-slate-800">OLF High School</p>
            <p className="text-xs text-slate-400">Admin Portal</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        <NavSection title="Overview" items={GENERAL_ITEMS} pathname={pathname} onClose={onClose} />
        <NavSection title="School fees" items={SCHOOL_FEE_ITEMS} pathname={pathname} onClose={onClose} />
        <NavSection title="Other fees" items={OTHER_FEE_ITEMS} pathname={pathname} onClose={onClose} />
        <NavSection title="Expense" items={EXPENSE_ITEMS} pathname={pathname} onClose={onClose} />
        <NavSection title="Admin" items={ADMIN_ITEMS} pathname={pathname} onClose={onClose} />
      </nav>

      <div className="space-y-2 px-3 pb-4">
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400">
          <RefreshCw className="h-3 w-3 shrink-0" />
          <span>Synced with Google Sheets</span>
        </div>

        {session?.user && (
          <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name ?? ""}
                width={28}
                height={28}
                className="rounded-full shrink-0"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
                {session.user.name?.[0] ?? "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-700">{session.user.name}</p>
              <p className="truncate text-xs text-slate-400">{session.user.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="shrink-0 text-slate-400 transition-colors hover:text-red-500"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
