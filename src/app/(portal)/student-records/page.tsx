import StudentRecordsClient from "./StudentRecordsClient";

export default function StudentRecordsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">Student records</h1>
        <p className="text-sm text-slate-500 mt-1">
          Fill in missing admission details and parent numbers, height and weight, UDISE status (1st Std and above)
          and Aadhaar. Details save to the student&apos;s admission record; height, weight and UDISE to the{" "}
          <strong>Student Records</strong> tab. The UDISE import tab is never changed.
        </p>
      </div>
      <StudentRecordsClient />
    </div>
  );
}
