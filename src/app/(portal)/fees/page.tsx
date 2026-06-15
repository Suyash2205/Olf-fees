import { Suspense } from "react";
import FeesTable from "./FeesTable";

export default function FeesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">Fees</h1>
        <p className="text-sm text-slate-500 mt-1">Use Record Fees to log school and other payments</p>
      </div>
      <Suspense>
        <FeesTable />
      </Suspense>
    </div>
  );
}
