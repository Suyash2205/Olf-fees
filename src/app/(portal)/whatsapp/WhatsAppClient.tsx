"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { WaParentRow, WaReplyRow } from "@/lib/sheets/whatsapp-bot";
import { portalFetch } from "@/lib/portal-fetch";

type Filter = "Not replying" | "Stopped messages" | "All";

function when(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUS_STYLE: Record<string, string> = {
  "Not replying": "bg-orange-100 text-orange-800",
  "Stopped messages": "bg-slate-200 text-slate-700",
  OK: "bg-green-100 text-green-800",
};

export default function WhatsAppClient() {
  const [parents, setParents] = useState<WaParentRow[]>([]);
  const [replies, setReplies] = useState<WaReplyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("Not replying");

  const load = useCallback(async () => {
    try {
      const res = await portalFetch("/api/whatsapp");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setParents(data.parents ?? []);
      setReplies(data.replies ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { "Not replying": 0, "Stopped messages": 0, All: parents.length };
    for (const p of parents) if (p.Status in c) c[p.Status as "Not replying" | "Stopped messages"]++;
    return c;
  }, [parents]);

  const shown = filter === "All" ? parents : parents.filter((p) => p.Status === filter);
  const updatedAt = parents[0]?.["Updated At"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["Not replying", "Stopped messages", "All"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              filter === f ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {f} ({counts[f]})
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {updatedAt && <p className="text-xs text-slate-400">Last update from the bot: {when(updatedAt)}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Students</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last message sent</th>
              <th className="px-4 py-3">Last reply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {shown.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  {filter === "Not replying" ? "No parents are flagged as not replying." : "Nothing to show yet."}
                </td>
              </tr>
            )}
            {shown.map((p) => (
              <tr key={p.Phone} className="text-slate-700 align-top">
                <td className="px-4 py-3 whitespace-nowrap font-mono">{p.Phone}</td>
                <td className="px-4 py-3">{p.Students || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.Status] ?? "bg-slate-100 text-slate-700"}`}>
                    {p.Status}
                  </span>
                  {p.Status === "Not replying" && <span className="ml-2 text-xs text-slate-400">{p.Unanswered} unanswered</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{when(p["Last Message Sent"])}</td>
                <td className="px-4 py-3">
                  {p["Last Reply"] ? (
                    <>
                      <span className="text-slate-400 text-xs">{when(p["Last Reply At"])}</span>
                      <p className="mt-0.5">{p["Last Reply"]}</p>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Recent replies from parents</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Students</th>
                <th className="px-4 py-3">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {replies.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    No replies yet.
                  </td>
                </tr>
              )}
              {replies.map((r) => (
                <tr key={r["Bot Id"]} className="text-slate-700 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{when(r["Received At"])}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono">{r.Phone}</td>
                  <td className="px-4 py-3">{r.Students || "—"}</td>
                  <td className="px-4 py-3">{r.Message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
