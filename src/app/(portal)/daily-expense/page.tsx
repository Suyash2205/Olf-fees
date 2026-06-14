import { Suspense } from "react";
import DailyExpenseForm from "./DailyExpenseForm";

export default function DailyExpensePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">Daily Expense Entry</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record school expenses by category — synced to the Daily expense tab on Google Sheets
        </p>
      </div>
      <Suspense>
        <DailyExpenseForm />
      </Suspense>
    </div>
  );
}
