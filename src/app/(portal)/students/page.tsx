import { getAllStudents } from "@/lib/sheets/students";
import StudentsTable from "./StudentsTable";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  let students: Awaited<ReturnType<typeof getAllStudents>> = [];
  let error: string | null = null;

  try {
    students = await getAllStudents();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load students";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Students</h1>
        <p className="text-sm text-slate-500 mt-1">{students.length} students · click arrow to view fees</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <StudentsTable students={students} />
    </div>
  );
}
