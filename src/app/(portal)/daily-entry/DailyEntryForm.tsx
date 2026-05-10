"use client";

import { useState, useEffect, useMemo } from "react";
import { CalendarDays, IndianRupee, Loader2, CheckCircle2, AlertCircle, History } from "lucide-react";
import type { FeeRecord } from "@/lib/sheets/fees";
import type { DailyEntry } from "@/lib/sheets/dailyLog";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export default function DailyEntryForm({ fees }: { fees: FeeRecord[] }) {
  const [selectedSrNo, setSelectedSrNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedFee = useMemo(
    () => fees.find((f) => f.srNo === selectedSrNo) ?? null,
    [fees, selectedSrNo]
  );

  const quarterSize = selectedFee && selectedFee.totalFee > 0 ? selectedFee.totalFee / 4 : 0;

  const filteredFees = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return fees;
    return fees.filter(
      (f) =>
        f.studentName.toLowerCase().includes(q) ||
        f.className.toLowerCase().includes(q) ||
        f.srNo.includes(q)
    );
  }, [fees, searchQuery]);

  useEffect(() => {
    if (!selectedSrNo) {
      setEntries([]);
      return;
    }
    setLoadingEntries(true);
    fetch(`/api/daily-entry?srNo=${encodeURIComponent(selectedSrNo)}`)
      .then((r) => r.json())
      .then((data) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]))
      .finally(() => setLoadingEntries(false));
  }, [selectedSrNo, success]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFee || !date || !amount || Number(amount) <= 0) {
      setError("Please select a student and enter a valid amount.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/daily-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: selectedFee.studentName, date, amount: Number(amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      setSuccess(true);
      setAmount("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Entry form */}
      <div className="space-y-5">
        {/* Student selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">Record Payment</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search Student</label>
            <input
              type="text"
              placeholder="Type name or class..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Student</label>
            <select
              value={selectedSrNo}
              onChange={(e) => { setSelectedSrNo(e.target.value); setError(null); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— choose a student —</option>
              {filteredFees.map((f) => (
                <option key={f.sheetRow} value={f.srNo}>
                  {f.studentName} ({f.className})
                </option>
              ))}
            </select>
          </div>

          {/* Student summary */}
          {selectedFee && (
            <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Fee</span>
                <span className="font-medium">{fmt(selectedFee.totalFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Per Quarter</span>
                <span className="font-medium">{quarterSize > 0 ? fmt(quarterSize) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paid so far</span>
                <span className="font-medium text-green-700">{fmt(selectedFee.totalPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Balance</span>
                <span className={`font-medium ${selectedFee.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                  {fmt(selectedFee.balance)}
                </span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <CalendarDays className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Payment Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <IndianRupee className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Amount (₹)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 7950"
              min={1}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Payment recorded and synced to Google Sheets!
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !selectedSrNo}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Record Payment"
            )}
          </button>
        </form>
      </div>

      {/* Right: Payment log */}
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-800">
            {selectedFee ? `${selectedFee.studentName}'s Payments` : "Payment History"}
          </h2>
        </div>

        {!selectedSrNo ? (
          <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-sm">
            Select a student to view their payment history
          </div>
        ) : loadingEntries ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-sm">
            No payments recorded yet
          </div>
        ) : (
          <div className="divide-y divide-slate-50 overflow-y-auto max-h-[600px]">
            {[...entries].reverse().map((entry) => (
              <div key={entry.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">{formatDate(entry.date)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{entry.className}</p>
                </div>
                <span className="text-sm font-semibold text-green-700">{fmt(entry.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {entries.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex justify-between text-sm">
            <span className="text-slate-500">{entries.length} payment{entries.length !== 1 ? "s" : ""}</span>
            <span className="font-semibold text-green-700">
              {fmt(entries.reduce((s, e) => s + e.amount, 0))} total
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
