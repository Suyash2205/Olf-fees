import Link from "next/link";
import { UserPlus } from "lucide-react";
import StudentsTable from "./StudentsTable";
import PromotionPanel from "./PromotionPanel";

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Students</h1>
          <p className="text-sm text-slate-500 mt-1">
            Promote or demote classes · use <strong>Add info</strong> on a row to fill the full admission profile for existing students
          </p>
        </div>
        <Link
          href="/admissions/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <UserPlus className="w-4 h-4" />
          New admission
        </Link>
      </div>
      <PromotionPanel />
      <StudentsTable />
    </div>
  );
}
