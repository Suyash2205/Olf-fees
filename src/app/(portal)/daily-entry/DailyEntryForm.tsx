"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  IndianRupee,
  Loader2,
  CheckCircle2,
  AlertCircle,
  History,
  Pencil,
  Trash2,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import type { FeeRecord } from "@/lib/sheets/fees";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { feesListUrl, portalFetch } from "@/lib/portal-fetch";
import { sortByGradeThenName } from "@/lib/sort-by-grade";
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
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export default function DailyEntryForm() {
  const searchParams = useSearchParams();
  const initialStudentName = searchParams.get("student") ?? undefined;

  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [feesLoading, setFeesLoading] = useState(true);
  const [feesError, setFeesError] = useState<string | null>(null);

  const loadFees = useCallback(async () => {
    setFeesLoading(true);
    setFeesError(null);
    try {
      const res = await portalFetch(feesListUrl(true));
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: FeeRecord[] = await res.json();
      setFees(data);
    } catch (e) {
      setFeesError(e instanceof Error ? e.message : "Failed to load students");
    } finally {
      setFeesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFees();
  }, [loadFees]);
  usePortalRefresh(loadFees);

  // Pre-select student once fees load
  const initialSelected = useMemo(() => {
    if (!initialStudentName || fees.length === 0) return null;
    return fees.find((f) => f.studentName === initialStudentName) ?? null;
  }, [initialStudentName, fees]);

  const [inputValue, setInputValue] = useState("");
  const [selectedFee, setSelectedFee] = useState<FeeRecord | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const didPreselect = useRef(false);

  // Apply pre-selection once
  useEffect(() => {
    if (!didPreselect.current && initialSelected) {
      didPreselect.current = true;
      setSelectedFee(initialSelected);
      setInputValue(`${initialSelected.studentName} (${initialSelected.className})`);
    }
  }, [initialSelected]);

  // Form state
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const suggestions = useMemo(() => {
    if (!inputValue || selectedFee) return [];
    const q = inputValue.toLowerCase();
    return sortByGradeThenName(
      fees.filter(
        (f) =>
          f.studentName.toLowerCase().includes(q) ||
          f.className.toLowerCase().includes(q) ||
          f.srNo.includes(q)
      ),
      (f) => f.className,
      (f) => f.studentName
    ).slice(0, 10);
  }, [inputValue, selectedFee, fees]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!selectedFee) {
      setEntries([]);
      return;
    }
    setLoadingEntries(true);
    portalFetch(
      `/api/daily-entry?srNo=${encodeURIComponent(selectedFee.srNo)}&reconcile=1`
    )
      .then((r) => r.json())
      .then(async (data) => {
        setEntries(Array.isArray(data) ? data : []);
        await refreshStudentFee(selectedFee.studentName);
      })
      .catch(() => setEntries([]))
      .finally(() => setLoadingEntries(false));
  }, [selectedFee?.srNo]);

  function selectStudent(fee: FeeRecord) {
    setSelectedFee(fee);
    setInputValue(`${fee.studentName} (${fee.className})`);
    setShowDropdown(false);
    setError(null);
  }

  function clearSelection() {
    setSelectedFee(null);
    setInputValue("");
    setEntries([]);
  }

  async function refreshStudentFee(studentName: string) {
    try {
      const res = await portalFetch(`/api/fees?name=${encodeURIComponent(studentName)}`);
      if (!res.ok) return;
      const fresh: FeeRecord = await res.json();
      if (!fresh?.srNo) return;
      setSelectedFee(fresh);
      setFees((prev) => prev.map((f) => (f.srNo === fresh.srNo ? fresh : f)));
    } catch { /* silent */ }
  }

  async function refreshEntries(srNo: string) {
    try {
      const res = await portalFetch(`/api/daily-entry?srNo=${encodeURIComponent(srNo)}`);
      const data = await res.json();
      if (Array.isArray(data)) setEntries(data);
    } catch { /* silent */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFee || !date || !amount || Number(amount) <= 0) {
      setError("Select a student and enter a valid amount.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await portalFetch("/api/daily-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: selectedFee.studentName, date, amount: Number(amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSuccess(true);
      setAmount("");
      setTimeout(() => setSuccess(false), 3000);
      await Promise.all([
        refreshStudentFee(selectedFee.studentName),
        refreshEntries(selectedFee.srNo),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: DailyEntry) {
    setDeleting(true);
    try {
      const res = await portalFetch("/api/daily-entry", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id, studentName: entry.studentName, srNo: entry.srNo }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setConfirmDeleteId(null);
      await Promise.all([
        refreshStudentFee(entry.studentName),
        refreshEntries(entry.srNo),
      ]);
    } catch {
      setConfirmDeleteId(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleEditSave(entry: DailyEntry) {
    const newAmt = Number(editAmount);
    if (!newAmt || newAmt <= 0) return;
    setEditSaving(true);
    try {
      const res = await portalFetch("/api/daily-entry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id, newAmount: newAmt, studentName: entry.studentName, srNo: entry.srNo }),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingId(null);
      await Promise.all([
        refreshStudentFee(entry.studentName),
        refreshEntries(entry.srNo),
      ]);
    } catch {
      // stay in edit mode on error
    } finally {
      setEditSaving(false);
    }
  }

  if (feesLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading student list…</p>
      </div>
    );
  }

  if (feesError) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-sm text-red-600">{feesError}</p>
        <button onClick={loadFees} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: form */}
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">Record Payment</h2>

          <div ref={comboRef} className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Student</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Type name or class to search..."
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (selectedFee) { setSelectedFee(null); setEntries([]); }
                  setShowDropdown(true);
                }}
                onFocus={() => { if (!selectedFee && inputValue) setShowDropdown(true); }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
              />
              {(inputValue || selectedFee) && (
                <button type="button" onClick={clearSelection} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {showDropdown && suggestions.length > 0 && (
              <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
                {suggestions.map((fee) => (
                  <button
                    key={fee.sheetRow}
                    type="button"
                    onMouseDown={() => selectStudent(fee)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center justify-between gap-3"
                  >
                    <span className="font-medium text-slate-800">{fee.studentName}</span>
                    <span className="text-xs text-slate-400 shrink-0">{fee.className}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedFee && (
            <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Fee</span>
                <span className="font-medium">{fmt(selectedFee.totalFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Per Quarter</span>
                <span className="font-medium">{selectedFee.totalFee > 0 ? fmt(selectedFee.totalFee / 4) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paid so far</span>
                <span className="font-medium text-green-700">{fmt(selectedFee.totalPaid)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1">
                <span className="text-slate-600 font-medium">Balance</span>
                <span className={`font-semibold ${selectedFee.balance > 0 ? "text-red-600" : "text-green-600"}`}>
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
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Payment recorded and synced to Google Sheets!
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !selectedFee}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : "Record Payment"}
          </button>
        </form>
      </div>

      {/* Right: payment history */}
      <div className="bg-white rounded-xl border border-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-800">
            {selectedFee ? `${selectedFee.studentName}'s Payments` : "Payment History"}
          </h2>
        </div>

        {!selectedFee ? (
          <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-sm">
            Select a student to view payment history
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
              <div key={entry.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{formatDate(entry.date)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{entry.className}</p>
                </div>
                {editingId === entry.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm text-slate-500">₹</span>
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEditSave(entry);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-24 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none"
                      autoFocus
                      min={1}
                    />
                    {editSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    ) : (
                      <>
                        <button onClick={() => handleEditSave(entry)} className="text-green-600 hover:text-green-700" title="Save"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600" title="Cancel"><X className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                ) : confirmDeleteId === entry.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">Delete?</span>
                    {deleting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    ) : (
                      <>
                        <button onClick={() => handleDelete(entry)} className="text-xs font-medium text-red-600 hover:text-red-700 px-2 py-0.5 rounded border border-red-200 hover:bg-red-50 transition-colors">Yes, delete</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-slate-400 hover:text-slate-600" title="Cancel"><X className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-green-700">{fmt(entry.amount)}</span>
                    <button
                      onClick={() => { setEditingId(entry.id); setEditAmount(String(entry.amount)); setConfirmDeleteId(null); }}
                      className="text-slate-300 hover:text-blue-500 transition-colors" title="Edit amount"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setConfirmDeleteId(entry.id); setEditingId(null); }}
                      className="text-slate-300 hover:text-red-500 transition-colors" title="Delete entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {entries.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex justify-between text-sm">
            <span className="text-slate-500">{entries.length} payment{entries.length !== 1 ? "s" : ""}</span>
            <span className="font-semibold text-green-700">{fmt(entries.reduce((s, e) => s + e.amount, 0))} total</span>
          </div>
        )}
      </div>
    </div>
  );
}
