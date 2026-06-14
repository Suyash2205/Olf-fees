import { Suspense } from "react";
import ExpenseDashboardClient from "./ExpenseDashboardClient";

export default function ExpenseDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Expense Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Interactive analytics for school expenses — filter by day, week, or month
        </p>
      </div>
      <Suspense>
        <ExpenseDashboardClient />
      </Suspense>
    </div>
  );
}
