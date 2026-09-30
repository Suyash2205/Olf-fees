import SchoolCalendarClient from "./SchoolCalendarClient";

export default function SchoolCalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">School calendar</h1>
        <p className="text-sm text-slate-500 mt-1">
          Monday to Friday are school days; Saturday and Sunday are off unless you add a working day. Teachers
          cannot record attendance on a holiday.
        </p>
      </div>
      <SchoolCalendarClient />
    </div>
  );
}
