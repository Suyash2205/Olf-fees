import Link from "next/link";
import { UserPlus } from "lucide-react";
import AdmissionsList from "./AdmissionsList";

export default function AdmissionsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Admissions</h1>
          <p className="text-sm text-slate-500 mt-1">
            Full student records · synced to Admissions tab on the fees spreadsheet.
            Use <strong>New admission</strong> only for brand-new students; existing students
            were added via Admin setup.
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
      <AdmissionsList />
    </div>
  );
}
