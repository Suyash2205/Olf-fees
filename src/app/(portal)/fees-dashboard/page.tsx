import { Suspense } from "react";
import FeesDashboardClient from "./FeesDashboardClient";

export default function FeesDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Fees Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Interactive fee collection analytics — payments, classes, and quarters
        </p>
      </div>
      <Suspense>
        <FeesDashboardClient />
      </Suspense>
    </div>
  );
}
