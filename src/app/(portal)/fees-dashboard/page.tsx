import { Suspense } from "react";
import FeesDashboardClient from "./FeesDashboardClient";

export default function FeesDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">Fees Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          School fees, other fees (bag, bus, books), and combined income analytics
        </p>
      </div>
      <Suspense>
        <FeesDashboardClient />
      </Suspense>
    </div>
  );
}
