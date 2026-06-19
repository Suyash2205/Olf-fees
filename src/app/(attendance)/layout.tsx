import AttendanceShell from "@/components/layout/AttendanceShell";

export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  return <AttendanceShell>{children}</AttendanceShell>;
}
