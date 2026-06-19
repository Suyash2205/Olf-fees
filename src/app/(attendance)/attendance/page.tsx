import Link from "next/link";
import { BarChart3, CalendarCheck, ClipboardList, ChevronRight } from "lucide-react";
import { todayISO } from "@/lib/attendance/types";

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

export default function AttendanceHomePage() {
  const today = todayISO();

  const links = [
    {
      href: "/attendance/record",
      title: "Record today",
      desc: `Mark attendance for ${formatDate(today)}`,
      icon: CalendarCheck,
      color: "bg-blue-50 text-blue-700 border-blue-100",
    },
    {
      href: "/attendance/history",
      title: "Recorded attendance",
      desc: "View or edit past attendance",
      icon: ClipboardList,
      color: "bg-amber-50 text-amber-800 border-amber-100",
    },
    {
      href: "/attendance/dashboard",
      title: "Dashboard",
      desc: "Class, student & day summaries",
      icon: BarChart3,
      color: "bg-violet-50 text-violet-800 border-violet-100",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Teacher attendance</h1>
        <p className="text-sm text-slate-500 mt-1">Today is {formatDate(today)}</p>
      </div>

      <div className="space-y-3">
        {links.map(({ href, title, desc, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-4 rounded-2xl border p-4 transition-colors hover:opacity-90 ${color}`}
          >
            <div className="rounded-xl bg-white/80 p-3">
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{title}</p>
              <p className="text-sm opacity-80 mt-0.5">{desc}</p>
            </div>
            <ChevronRight className="h-5 w-5 opacity-50 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
