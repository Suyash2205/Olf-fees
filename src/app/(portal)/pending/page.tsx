import PendingClient from "./PendingClient";

export default function PendingFeesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Pending Fees</h1>
        <p className="text-sm text-slate-500 mt-1">Students with outstanding balance</p>
      </div>
      <PendingClient />
    </div>
  );
}
