"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { portalFetch } from "@/lib/portal-fetch";
import { paymentModeLabel } from "@/lib/payment-mode";

interface Hit {
  kind: "school" | "other";
  id: string;
  date: string;
  studentName: string;
  className: string;
  srNo: string;
  feeType: string;
  amount: number;
  paymentMode: string;
  receiptNo: string;
}

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

/** Find a fee entry by its receipt number. */
export default function ReceiptSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) {
      setError("Enter a receipt number.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch(`/api/receipts/search?q=${encodeURIComponent(query)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Search failed (${res.status})`);
      setHits(data.hits as Hit[]);
      setSearched(query);
    } catch (err) {
      setHits(null);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const total = hits?.reduce((s, h) => s + h.amount, 0) ?? 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor="receipt-search" className="block text-sm font-medium text-slate-700 mb-1">
            Find by receipt number
          </label>
          <input
            id="receipt-search"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. 1042"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </form>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {hits && hits.length === 0 && (
        <p className="text-sm text-slate-500">No entry found with receipt number &quot;{searched}&quot;.</p>
      )}

      {hits && hits.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Student</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Mode</th>
                <th className="py-2">Receipt No</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {hits.map((h) => (
                <tr key={`${h.kind}:${h.id}`}>
                  <td className="py-2 pr-3 whitespace-nowrap">{h.date}</td>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/daily-entry?student=${encodeURIComponent(h.studentName)}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {h.studentName}
                    </Link>
                    <span className="text-xs text-slate-400 ml-1.5">{h.className}</span>
                  </td>
                  <td className="py-2 pr-3">{h.feeType}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{fmt(h.amount)}</td>
                  <td className="py-2 pr-3">{paymentModeLabel(h.paymentMode) || "—"}</td>
                  <td className="py-2 font-mono text-xs">{h.receiptNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hits.length > 1 && (
            <p className="text-xs text-slate-500 mt-2">
              {hits.length} entries, total {fmt(total)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
