import SchoolCalendarClient from "./SchoolCalendarClient";

export default function SchoolCalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">School calendar</h1>
        <p className="text-sm text-slate-500 mt-1">
          Mon–Sat are school days; add a Holiday for a Saturday off. Sunday is off unless you add a Working day.
          Teachers cannot record attendance on a holiday.
        </p>
      </div>
      <SchoolCalendarClient />
    </div>
  );
}
