import Link from "next/link";
import { UserPlus } from "lucide-react";
import StudentsTable from "./StudentsTable";

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="portal-title">Students</h1>
          <p className="text-sm text-slate-500 mt-1">
            Use <strong>Add info</strong> for full admission profile · promote, demote, left, failed, and remove are in <strong>Admin</strong>
          </p>
        </div>
        <Link
          href="/admissions/new"
          className="inline-flex w-full sm:w-auto shrink-0 items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <UserPlus className="w-4 h-4" />
          New admission
        </Link>
      </div>
      <StudentsTable />
    </div>
  );
}
