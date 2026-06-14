import DashboardClient from "./DashboardClient";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="portal-title">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Academic Year {process.env.ACADEMIC_YEAR?.replace("-", "–") ?? "2026–27"} overview
        </p>
      </div>
      <DashboardClient />
    </div>
  );
}
