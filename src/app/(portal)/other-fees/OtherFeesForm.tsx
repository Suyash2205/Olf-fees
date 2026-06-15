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
  Tag,
  Plus,
  MessageSquare,
} from "lucide-react";
import type { FeeRecord } from "@/lib/sheets/fees";
import type { OtherFeeEntry } from "@/lib/sheets/otherFeesLog";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { feesListUrl, portalFetch } from "@/lib/portal-fetch";
import { sortByGradeThenName } from "@/lib/sort-by-grade";
import {
  PAYMENT_MODES,
  paymentModeLabel,
  type PaymentMode,
} from "@/lib/payment-mode";

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

type LoadResponse = { entries: OtherFeeEntry[]; feeTypes: string[] };

export default function OtherFeesForm() {
  const searchParams = useSearchParams();
  const initialStudentName = searchParams.get("student") ?? undefined;

  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [feesLoading, setFeesLoading] = useState(true);
  const [feesError, setFeesError] = useState<string | null>(null);

  const [feeTypes, setFeeTypes] = useState<string[]>([]);
  const [feeType, setFeeType] = useState("");
  const [newFeeType, setNewFeeType] = useState("");
  const [showNewFeeType, setShowNewFeeType] = useState(false);
  const [addingFeeType, setAddingFeeType] = useState(false);

  const loadFees = useCallback(async () => {
    setFeesLoading(true);
    setFeesError(null);
    try {
      const res = await portalFetch(feesListUrl());
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setFees(await res.json());
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

  const initialSelected = useMemo(() => {
    if (!initialStudentName || fees.length === 0) return null;
    return fees.find((f) => f.studentName === initialStudentName) ?? null;
  }, [initialStudentName, fees]);

  const [inputValue, setInputValue] = useState("");
  const [selectedFee, setSelectedFee] = useState<FeeRecord | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const didPreselect = useRef(false);

  useEffect(() => {
    if (!didPreselect.current && initialSelected) {
      didPreselect.current = true;
      setSelectedFee(initialSelected);
      setInputValue(`${initialSelected.studentName} (${initialSelected.className})`);
    }
  }, [initialSelected]);

  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entries, setEntries] = useState<OtherFeeEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editPaymentMode, setEditPaymentMode] = useState<PaymentMode>("cash");
  const [editFeeType, setEditFeeType] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

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

  const loadFeeTypes = useCallback(async () => {
    try {
      const res = await portalFetch("/api/other-fees/categories");
      if (!res.ok) return;
      const types: string[] = await res.json();
      setFeeTypes(types);
      setFeeType((prev) => prev || types[0] || "");
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadFeeTypes();
  }, [loadFeeTypes]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const refreshEntries = useCallback(async (srNo: string) => {
    setLoadingEntries(true);
    try {
      const res = await portalFetch(`/api/other-fees?srNo=${encodeURIComponent(srNo)}`);
      if (!res.ok) throw new Error("Failed");
      const data: LoadResponse = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      if (data.feeTypes?.length) {
        setFeeTypes(data.feeTypes);
        setFeeType((prev) => prev || data.feeTypes[0] || "");
      }
    } catch {
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedFee) {
      setEntries([]);
      return;
    }
    refreshEntries(selectedFee.srNo);
  }, [selectedFee?.srNo, refreshEntries]);

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

  async function handleAddFeeType() {
    const name = newFeeType.trim();
    if (!name) return;
    setAddingFeeType(true);
    setError(null);
    try {
      const res = await portalFetch("/api/other-fees/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setFeeTypes(data.feeTypes ?? []);
      setFeeType(data.feeType ?? name);
      setNewFeeType("");
      setShowNewFeeType(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add fee type");
    } finally {
      setAddingFeeType(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFee || !date || !feeType || !amount || Number(amount) <= 0) {
      setError("Select a student, fee type, and enter a valid amount.");
      return;
    }
    if (feeType.toLowerCase() === "other" && !notes.trim()) {
      setError('Notes are required when fee type is "Other".');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await portalFetch("/api/other-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: selectedFee.studentName,
          date,
          feeType,
          amount: Number(amount),
          paymentMode,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSuccess(true);
      setAmount("");
      setNotes("");
      setTimeout(() => setSuccess(false), 3000);
      await refreshEntries(selectedFee.srNo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: OtherFeeEntry) {
    setDeleting(true);
    setError(null);
    try {
      const res = await portalFetch("/api/other-fees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: entry.id,
          srNo: entry.srNo,
          date: entry.date,
          amount: entry.amount,
          feeType: entry.feeType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setConfirmDeleteId(null);
      if (selectedFee) await refreshEntries(selectedFee.srNo);
    } catch (err) {
      setConfirmDeleteId(null);
      setError(err instanceof Error ? err.message : "Could not delete entry");
    } finally {
      setDeleting(false);
    }
  }

  async function handleEditSave(entry: OtherFeeEntry) {
    const newAmt = Number(editAmount);
    if (!newAmt || newAmt <= 0) return;
    if (editFeeType.toLowerCase() === "other" && !editNotes.trim()) {
      setError('Notes are required when fee type is "Other".');
      return;
    }
    setEditSaving(true);
    try {
      const res = await portalFetch("/api/other-fees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: entry.id,
          amount: newAmt,
          paymentMode: editPaymentMode,
          feeType: editFeeType,
          notes: editNotes.trim(),
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingId(null);
      if (selectedFee) await refreshEntries(selectedFee.srNo);
    } catch {
      /* stay in edit */
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
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">Record Other Fee</h2>
          <p className="text-xs text-slate-500 -mt-2">
            One-time fees (bag, bus, books, etc.) — not quarterly school fees.
          </p>

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
            <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Class</span>
                <span className="font-medium">{selectedFee.className}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-500">Sr No</span>
                <span className="font-medium">{selectedFee.srNo}</span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <Tag className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Fee type
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={feeType}
                onChange={(e) => setFeeType(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {feeTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewFeeType((v) => !v)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
              >
                <Plus className="w-4 h-4" />
                New type
              </button>
            </div>
            {showNewFeeType && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newFeeType}
                  onChange={(e) => setNewFeeType(e.target.value)}
                  placeholder="e.g. Uniform"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  disabled={addingFeeType || !newFeeType.trim()}
                  onClick={handleAddFeeType}
                  className="px-3 py-2 text-sm bg-slate-800 text-white rounded-lg disabled:opacity-50"
                >
                  {addingFeeType ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <CalendarDays className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Payment date
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
              placeholder="Enter amount for this student"
              min={1}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <MessageSquare className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Notes {feeType.toLowerCase() === "other" ? "(required)" : "(optional)"}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={feeType.toLowerCase() === "other" ? "Describe the fee…" : "Optional note"}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Payment mode</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                    paymentMode === mode
                      ? mode === "cash"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-violet-600 text-white border-violet-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {paymentModeLabel(mode)}
                </button>
              ))}
            </div>
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
              Fee recorded and synced to Google Sheets!
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !selectedFee}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : "Record fee"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-[320px]">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400 shrink-0" />
          <h2 className="font-semibold text-slate-800 truncate">
            {selectedFee ? `${selectedFee.studentName}'s other fees` : "Fee history"}
          </h2>
        </div>

        {!selectedFee ? (
          <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-sm px-4 text-center">
            Select a student to view their bag, bus, books, and other one-time fees
          </div>
        ) : loadingEntries ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-sm">
            No other fees recorded yet
          </div>
        ) : (
          <div className="divide-y divide-slate-50 overflow-y-auto max-h-[600px]">
            {[...entries].reverse().map((entry) => (
              <div key={entry.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{formatDate(entry.date)}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="text-xs font-medium text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                      {entry.feeType}
                    </span>
                    {entry.paymentMode && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        entry.paymentMode === "online" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"
                      }`}>
                        {paymentModeLabel(entry.paymentMode)}
                      </span>
                    )}
                  </div>
                  {entry.notes && (
                    <p className="text-xs text-slate-400 mt-1 truncate">{entry.notes}</p>
                  )}
                </div>

                {editingId === entry.id ? (
                  <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                    <select
                      value={editFeeType}
                      onChange={(e) => setEditFeeType(e.target.value)}
                      className="text-sm border border-slate-200 rounded px-2 py-1"
                    >
                      {feeTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-slate-500">₹</span>
                      <input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-24 border border-blue-400 rounded px-2 py-1 text-sm"
                        min={1}
                      />
                    </div>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Notes"
                      className="w-full sm:w-40 border border-slate-200 rounded px-2 py-1 text-sm"
                    />
                    <div className="flex gap-1">
                      {PAYMENT_MODES.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setEditPaymentMode(mode)}
                          className={`text-xs px-2 py-1 rounded border ${
                            editPaymentMode === mode ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200"
                          }`}
                        >
                          {paymentModeLabel(mode)}
                        </button>
                      ))}
                    </div>
                    {editSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500 self-end" />
                    ) : (
                      <div className="flex gap-1 self-end">
                        <button onClick={() => handleEditSave(entry)} className="text-green-600"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                      </div>
                    )}
                  </div>
                ) : confirmDeleteId === entry.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">Delete?</span>
                    {deleting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    ) : (
                      <>
                        <button onClick={() => handleDelete(entry)} className="text-xs font-medium text-red-600 px-2 py-0.5 rounded border border-red-200">Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)}><X className="w-4 h-4 text-slate-400" /></button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    <span className="text-sm font-semibold text-violet-700">{fmt(entry.amount)}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditAmount(String(entry.amount));
                          setEditPaymentMode(entry.paymentMode ?? "cash");
                          setEditFeeType(entry.feeType);
                          setEditNotes(entry.notes);
                          setConfirmDeleteId(null);
                        }}
                        className="text-slate-300 hover:text-blue-500 p-1"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setConfirmDeleteId(entry.id); setEditingId(null); }}
                        className="text-slate-300 hover:text-red-500 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {entries.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-t border-slate-100 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">{entries.length} fee{entries.length !== 1 ? "s" : ""}</span>
              <span className="font-semibold text-violet-700">
                {fmt(entries.reduce((s, e) => s + e.amount, 0))} total
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
