import { Suspense } from "react";
import FeesTable from "./FeesTable";

export default function FeesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Fees</h1>
        <p className="text-sm text-slate-500 mt-1">Use Daily Entry to record payments</p>
      </div>
      <Suspense>
        <FeesTable />
      </Suspense>
    </div>
  );
}
