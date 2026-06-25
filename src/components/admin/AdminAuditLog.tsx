"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, RefreshCw, Search } from "lucide-react";
import { portalFetch } from "@/lib/portal-fetch";
import type { AuditLogEntry } from "@/lib/sheets/audit-log";

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type ParsedAuditDetails = {
  source?: string;
  note?: string;
  sheetEditAttribution?: string;
  recentSheetEditors?: { email: string; displayName: string; modifiedTime: string }[];
  entries?: { amount: number; feeMonth?: number; feeMonthLabel?: string | null; comment?: string }[];
};

function parseAuditDetails(raw: string): ParsedAuditDetails | null {
  try {
    return JSON.parse(raw) as ParsedAuditDetails;
  } catch {
    return null;
  }
}

function AuditDetailsBlock({ row }: { row: AuditLogEntry }) {
  if (!row.details) return null;
  const parsed = parseAuditDetails(row.details);
  const isManualSheetSync =
    row.action === "sync" &&
    row.resource === "payments" &&
    parsed?.source === "manual_sheet_entry";

  if (isManualSheetSync && parsed) {
    return (
      <div className="mt-2 space-y-2 text-xs text-slate-600 max-w-lg">
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
          <strong>Manual sheet entry.</strong>{" "}
          {parsed.note ?? "This payment existed on Fee details before the portal logged it."}
        </p>
        {parsed.entries?.map((e, i) => (
          <p key={i}>
            ₹{e.amount.toLocaleString("en-IN")}
            {e.feeMonthLabel ? ` · ${e.feeMonthLabel} column` : ""}
            {e.comment ? ` — ${e.comment}` : ""}
          </p>
        ))}
        {parsed.sheetEditAttribution && (
          <p className="text-slate-500">{parsed.sheetEditAttribution}</p>
        )}
        {parsed.recentSheetEditors && parsed.recentSheetEditors.length > 0 && (
          <div>
            <p className="font-medium text-slate-700">Recent spreadsheet editors</p>
            <ul className="mt-1 space-y-1">
              {parsed.recentSheetEditors.map((u) => (
                <li key={u.email}>
                  {u.displayName} ({u.email})
                  {u.modifiedTime ? ` · ${formatWhen(u.modifiedTime)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-slate-400 hover:text-slate-600">Raw JSON</summary>
          <pre className="mt-1 p-2 bg-slate-50 rounded text-[10px] overflow-x-auto">{row.details}</pre>
        </details>
      </div>
    );
  }

  return (
    <details className="mt-1 text-xs text-slate-500">
      <summary className="cursor-pointer hover:text-slate-700">Details</summary>
      <pre className="mt-1 p-2 bg-slate-50 rounded text-[10px] overflow-x-auto max-w-lg">
        {row.details}
      </pre>
    </details>
  );
}

export default function AdminAuditLog() {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch("/api/admin/audit-log?limit=500");
      if (res.status === 401) {
        throw new Error("Admin session expired — lock and unlock admin again.");
      }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setRows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.userEmail.toLowerCase().includes(q) ||
        r.accountName.toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        r.resource.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.resourceId.toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Activity log</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              Every create, update, delete, payment, promotion, and admin action is recorded on
              the <strong>Audit Log</strong> tab in Google Sheets with the signed-in Google
              account email.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="px-5 py-3 border-b border-slate-50">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email, action, summary…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Showing {filtered.length} of {rows.length} entries (newest first)
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : error ? (
        <p className="px-5 py-8 text-sm text-red-600">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-400 text-center">No log entries yet.</p>
      ) : (
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase">
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Who</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((r) => (
                <tr key={r.rowId} className="hover:bg-slate-50/80 align-top">
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">
                    {formatWhen(r.timestamp)}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800">{r.accountName || "—"}</p>
                    <p className="text-xs text-slate-500">{r.userEmail}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                      {r.action}
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5">{r.resource}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    <p>{r.summary}</p>
                    {r.resourceId && (
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{r.resourceId}</p>
                    )}
                    {r.details && <AuditDetailsBlock row={r} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
