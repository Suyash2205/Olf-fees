import StudentRecordsClient from "./StudentRecordsClient";

export default function StudentRecordsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">Student records</h1>
        <p className="text-sm text-slate-500 mt-1">
          Height and weight, UDISE status (1st Std and above) and the Aadhaar pending list. Saved to the{" "}
          <strong>Student Records</strong> tab; the UDISE import tab is never changed.
        </p>
      </div>
      <StudentRecordsClient />
    </div>
  );
}
