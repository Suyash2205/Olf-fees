import ClassesClient from "./ClassesClient";

export default function ClassesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Classes</h1>
        <p className="text-sm text-slate-500 mt-1">Fee summary by class</p>
      </div>
      <ClassesClient />
    </div>
  );
}
