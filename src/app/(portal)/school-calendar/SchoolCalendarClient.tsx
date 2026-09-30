"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { CLASS_OPTIONS } from "@/lib/fees/structure";
import { formatClassesCell, type CalendarEntryType } from "@/lib/attendance/school-calendar";
import type { CalendarSheetRow } from "@/lib/sheets/school-calendar";
import { todayISO } from "@/lib/attendance/types";
import { portalFetch } from "@/lib/portal-fetch";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const inputCls = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800";

export default function SchoolCalendarClient() {
  const [rows, setRows] = useState<CalendarSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<CalendarEntryType>("Holiday");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [allClasses, setAllClasses] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [toCancel, setToCancel] = useState<CalendarSheetRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await portalFetch("/api/school-calendar");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load the calendar");
      setRows(data.rows ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = () => {
    setLoading(true);
    void load();
  };

  const active = useMemo(
    () =>
      rows
        .filter((r) => r.status === "active" && r.entry)
        .sort((a, b) => (b.entry!.startDate < a.entry!.startDate ? -1 : 1)),
    [rows]
  );
  const inactive = useMemo(() => rows.filter((r) => r.status !== "active"), [rows]);
  const today = todayISO();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await portalFetch("/api/school-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          startDate,
          endDate: endDate || undefined,
          classes: allClasses ? "All" : picked,
          title,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add the entry");
      setNotice(`${type} added.`);
      setTitle("");
      setStartDate("");
      setEndDate("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add the entry");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    if (!toCancel) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await portalFetch("/api/school-calendar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetRow: toCancel.sheetRow, date: toCancel.date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not remove the entry");
      setToCancel(null);
      await load();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Could not remove the entry");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">Add a holiday or working day</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs text-slate-500">
            Type
            <select
              className={`${inputCls} mt-1 w-full`}
              value={type}
              onChange={(e) => setType(e.target.value as CalendarEntryType)}
            >
              <option value="Holiday">Holiday</option>
              <option value="Working day">Working day (e.g. a working Sunday)</option>
            </select>
          </label>
          <label className="text-xs text-slate-500">
            From
            <input
              type="date"
              required
              className={`${inputCls} mt-1 w-full`}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-500">
            To (optional, for a range)
            <input
              type="date"
              className={`${inputCls} mt-1 w-full`}
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-500">
            Title
            <input
              type="text"
              required
              maxLength={120}
              placeholder="e.g. Diwali break"
              className={`${inputCls} mt-1 w-full`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs text-slate-500">Classes</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={allClasses} onChange={(e) => setAllClasses(e.target.checked)} />
            All classes
          </label>
          {!allClasses && (
            <div className="flex flex-wrap gap-2">
              {CLASS_OPTIONS.map((c) => {
                const on = picked.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c) : [...p, c]))}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      on ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-400">
            A class-specific entry wins over an All-classes entry on the same day.
          </p>
        </fieldset>

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
        )}
        {notice && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Add to calendar"}
        </button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Entries</h2>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Classes</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {active.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    No calendar entries yet. Monday to Saturday are school days and Sunday is off.
                  </td>
                </tr>
              )}
              {active.map((r) => {
                const e = r.entry!;
                const past = e.endDate < today;
                return (
                  <tr key={r.sheetRow} className={past ? "text-slate-400" : "text-slate-700"}>
                    <td className="px-4 py-3 whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.type === "Holiday" ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800"
                        }`}
                      >
                        {e.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatClassesCell(e.classes)}</td>
                    <td className="px-4 py-3">{e.title}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCancelError(null);
                          setToCancel(r);
                        }}
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${e.title}`}
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {inactive.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className="text-xs font-medium text-blue-600"
            >
              {showInactive ? "Hide" : "Show"} {inactive.length} removed or unreadable row
              {inactive.length === 1 ? "" : "s"}
            </button>
            {showInactive && (
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {inactive.map((r) => (
                  <li key={r.sheetRow}>
                    Row {r.sheetRow}: {r.date || "(no date)"} · {r.type || "(no type)"} · {r.title} ·{" "}
                    <span className={r.status === "invalid" ? "font-medium text-red-600" : ""}>
                      {r.status === "invalid" ? "not understood, ignored: fix it in the sheet" : "removed"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!toCancel}
        title="Remove calendar entry"
        description={
          toCancel
            ? `${toCancel.date} · ${toCancel.type} · ${toCancel.title}\n\nThe day goes back to the normal weekday rule. The row stays in the sheet marked Cancelled.`
            : ""
        }
        confirmLabel="Remove"
        variant="danger"
        busy={cancelling}
        error={cancelling ? null : cancelError}
        onClose={() => !cancelling && setToCancel(null)}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
