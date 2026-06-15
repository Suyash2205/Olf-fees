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
  MessageSquare,
  Tag,
  Plus,
} from "lucide-react";
import type { FeeRecord } from "@/lib/sheets/fees";
import type { DailyEntry } from "@/lib/sheets/dailyLog";
import type { OtherFeeEntry } from "@/lib/sheets/otherFeesLog";
import { splitIntoQuarters } from "@/lib/fees/structure";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { feesListUrl, portalFetch } from "@/lib/portal-fetch";
import { sortByGradeThenName } from "@/lib/sort-by-grade";
import {
  PAYMENT_MODES,
  paymentModeLabel,
  type PaymentMode,
} from "@/lib/payment-mode";

const SCHOOL_FEE_TYPE = "School Fees";

type HistoryFilter = "all" | "school" | "other";
type HistoryKind = "school" | "other";

type SchoolHistoryItem = DailyEntry & { kind: "school"; sortKey: string };
type OtherHistoryItem = OtherFeeEntry & { kind: "other"; sortKey: string };
type HistoryItem = SchoolHistoryItem | OtherHistoryItem;

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

function historyKey(kind: HistoryKind, id: string) {
  return `${kind}:${id}`;
}

function normalizeDateForSort(iso: string) {
  return iso || "0000-00-00";
}

export default function DailyEntryForm() {
  const searchParams = useSearchParams();
  const initialStudentName = searchParams.get("student") ?? undefined;
  const initialFeeType = searchParams.get("type") ?? undefined;

  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [feesLoading, setFeesLoading] = useState(true);
  const [feesError, setFeesError] = useState<string | null>(null);

  const [otherFeeTypes, setOtherFeeTypes] = useState<string[]>([]);
  const [feeType, setFeeType] = useState(SCHOOL_FEE_TYPE);
  const [newFeeType, setNewFeeType] = useState("");
  const [showNewFeeType, setShowNewFeeType] = useState(false);
  const [addingFeeType, setAddingFeeType] = useState(false);

  const loadFees = useCallback(async () => {
    setFeesLoading(true);
    setFeesError(null);
    try {
      const res = await portalFetch(feesListUrl());
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: FeeRecord[] = await res.json();
      setFees(data);
    } catch (e) {
      setFeesError(e instanceof Error ? e.message : "Failed to load students");
    } finally {
      setFeesLoading(false);
    }
  }, []);

  const loadFeeTypes = useCallback(async () => {
    try {
      const res = await portalFetch("/api/other-fees/categories");
      if (!res.ok) return;
      const types: string[] = await res.json();
      setOtherFeeTypes(types.filter((t) => t !== SCHOOL_FEE_TYPE));
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadFees();
    loadFeeTypes();
  }, [loadFees, loadFeeTypes]);
  usePortalRefresh(loadFees);

  const feeTypeOptions = useMemo(
    () => [SCHOOL_FEE_TYPE, ...otherFeeTypes],
    [otherFeeTypes]
  );

  const isSchoolFee = feeType === SCHOOL_FEE_TYPE;

  useEffect(() => {
    if (!initialFeeType) return;
    const match = feeTypeOptions.find(
      (t) => t.toLowerCase() === initialFeeType.toLowerCase()
    );
    if (match) setFeeType(match);
  }, [initialFeeType, feeTypeOptions]);

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

  const [schoolEntries, setSchoolEntries] = useState<DailyEntry[]>([]);
  const [otherEntries, setOtherEntries] = useState<OtherFeeEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPaymentMode, setEditPaymentMode] = useState<PaymentMode>("cash");
  const [editFeeType, setEditFeeType] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const quarterAmounts = useMemo(() => {
    if (!selectedFee || selectedFee.totalFee <= 0) return null;
    return splitIntoQuarters(selectedFee.totalFee);
  }, [selectedFee]);

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

  const historyItems = useMemo((): HistoryItem[] => {
    const school: SchoolHistoryItem[] = schoolEntries.map((e) => ({
      ...e,
      kind: "school",
      sortKey: normalizeDateForSort(e.date),
    }));
    const other: OtherHistoryItem[] = otherEntries.map((e) => ({
      ...e,
      kind: "other",
      sortKey: normalizeDateForSort(e.date),
    }));
    const merged = [...school, ...other].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    if (historyFilter === "school") return merged.filter((e) => e.kind === "school");
    if (historyFilter === "other") return merged.filter((e) => e.kind === "other");
    return merged;
  }, [schoolEntries, otherEntries, historyFilter]);

  const historyStats = useMemo(() => {
    const schoolTotal = schoolEntries.reduce((s, e) => s + e.amount, 0);
    const otherTotal = otherEntries.reduce((s, e) => s + e.amount, 0);
    const schoolCash = schoolEntries
      .filter((e) => e.paymentMode !== "online")
      .reduce((s, e) => s + e.amount, 0);
    const schoolOnline = schoolEntries
      .filter((e) => e.paymentMode === "online")
      .reduce((s, e) => s + e.amount, 0);
    const otherCash = otherEntries
      .filter((e) => e.paymentMode !== "online")
      .reduce((s, e) => s + e.amount, 0);
    const otherOnline = otherEntries
      .filter((e) => e.paymentMode === "online")
      .reduce((s, e) => s + e.amount, 0);
    return {
      schoolCount: schoolEntries.length,
      otherCount: otherEntries.length,
      schoolTotal,
      otherTotal,
      grandTotal: schoolTotal + otherTotal,
      cashTotal: schoolCash + otherCash,
      onlineTotal: schoolOnline + otherOnline,
    };
  }, [schoolEntries, otherEntries]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

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

  const refreshAllEntries = useCallback(async (srNo: string, reconcile = false) => {
    setLoadingEntries(true);
    try {
      const schoolUrl = `/api/daily-entry?srNo=${encodeURIComponent(srNo)}${reconcile ? "&reconcile=1" : ""}`;
      const [schoolRes, otherRes] = await Promise.all([
        portalFetch(schoolUrl),
        portalFetch(`/api/other-fees?srNo=${encodeURIComponent(srNo)}`),
      ]);
      const schoolData = await schoolRes.json();
      const otherData = await otherRes.json();
      setSchoolEntries(Array.isArray(schoolData) ? schoolData : []);
      if (otherData?.entries) {
        setOtherEntries(Array.isArray(otherData.entries) ? otherData.entries : []);
        if (otherData.feeTypes?.length) {
          setOtherFeeTypes(
            otherData.feeTypes.filter((t: string) => t !== SCHOOL_FEE_TYPE)
          );
        }
      } else {
        setOtherEntries([]);
      }
    } catch {
      setSchoolEntries([]);
      setOtherEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedFee) {
      setSchoolEntries([]);
      setOtherEntries([]);
      return;
    }
    refreshAllEntries(selectedFee.srNo, true).then(() =>
      refreshStudentFee(selectedFee.studentName)
    );
  }, [selectedFee?.srNo, refreshAllEntries]);

  function selectStudent(fee: FeeRecord) {
    setSelectedFee(fee);
    setInputValue(`${fee.studentName} (${fee.className})`);
    setShowDropdown(false);
    setError(null);
  }

  function clearSelection() {
    setSelectedFee(null);
    setInputValue("");
    setSchoolEntries([]);
    setOtherEntries([]);
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
      const types = (data.feeTypes ?? []).filter((t: string) => t !== SCHOOL_FEE_TYPE);
      setOtherFeeTypes(types);
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
    if (!selectedFee || !date || !amount || Number(amount) <= 0) {
      setError("Select a student and enter a valid amount.");
      return;
    }
    if (!isSchoolFee && feeType.toLowerCase() === "other" && !notes.trim()) {
      setError('Notes are required when fee type is "Other".');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      if (isSchoolFee) {
        const res = await portalFetch("/api/daily-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName: selectedFee.studentName,
            date,
            amount: Number(amount),
            paymentMode,
            comment: notes.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
      } else {
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
      }

      setSuccess(true);
      setAmount("");
      setNotes("");
      setTimeout(() => setSuccess(false), 3000);
      await Promise.all([
        refreshStudentFee(selectedFee.studentName),
        refreshAllEntries(selectedFee.srNo),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: HistoryItem) {
    setDeleting(true);
    setError(null);
    try {
      if (item.kind === "school") {
        const res = await portalFetch("/api/daily-entry", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: item.id,
            studentName: item.studentName,
            srNo: item.srNo,
            date: item.date,
            amount: item.amount,
            feeMonth: item.feeMonth,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Delete failed");
        await refreshStudentFee(item.studentName);
      } else {
        const res = await portalFetch("/api/other-fees", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: item.id,
            srNo: item.srNo,
            date: item.date,
            amount: item.amount,
            feeType: item.feeType,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Delete failed");
      }
      setConfirmDeleteKey(null);
      await refreshAllEntries(item.srNo);
    } catch (err) {
      setConfirmDeleteKey(null);
      setError(err instanceof Error ? err.message : "Could not delete entry");
    } finally {
      setDeleting(false);
    }
  }

  async function handleEditSave(item: HistoryItem) {
    const newAmt = Number(editAmount);
    if (!newAmt || newAmt <= 0) return;
    if (item.kind === "other" && editFeeType.toLowerCase() === "other" && !editNotes.trim()) {
      setError('Notes are required when fee type is "Other".');
      return;
    }

    setEditSaving(true);
    try {
      if (item.kind === "school") {
        const res = await portalFetch("/api/daily-entry", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: item.id,
            newAmount: newAmt,
            studentName: item.studentName,
            srNo: item.srNo,
            paymentMode: editPaymentMode,
            comment: editNotes.trim(),
          }),
        });
        if (!res.ok) throw new Error("Update failed");
        await refreshStudentFee(item.studentName);
      } else {
        const res = await portalFetch("/api/other-fees", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: item.id,
            amount: newAmt,
            paymentMode: editPaymentMode,
            feeType: editFeeType,
            notes: editNotes.trim(),
          }),
        });
        if (!res.ok) throw new Error("Update failed");
      }
      setEditingKey(null);
      await refreshAllEntries(item.srNo);
    } catch {
      /* stay in edit */
    } finally {
      setEditSaving(false);
    }
  }

  function startEdit(item: HistoryItem) {
    setEditingKey(historyKey(item.kind, item.id));
    setEditAmount(String(item.amount));
    setEditPaymentMode(item.paymentMode ?? "cash");
    setConfirmDeleteKey(null);
    if (item.kind === "school") {
      setEditNotes(item.comment ?? "");
      setEditFeeType(SCHOOL_FEE_TYPE);
    } else {
      setEditNotes(item.notes);
      setEditFeeType(item.feeType);
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

  const hasHistory = schoolEntries.length + otherEntries.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  if (selectedFee) { setSelectedFee(null); setSchoolEntries([]); setOtherEntries([]); }
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
                <span className="text-slate-500">Annual fee</span>
                <span className="font-medium">{fmt(selectedFee.totalFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Per quarter</span>
                <span className="font-medium">
                  {quarterAmounts ? fmt(quarterAmounts[0]) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">School fees paid</span>
                <span className="font-medium text-green-700">{fmt(selectedFee.totalPaid)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1">
                <span className="text-slate-600 font-medium">Balance</span>
                <span className={`font-semibold ${selectedFee.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                  {fmt(selectedFee.balance)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 pt-1">
                Fee &amp; discount are set in Admissions — they appear here automatically.
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Tag className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Fee type
            </label>
            <div className="flex flex-wrap gap-2">
              {feeTypeOptions.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setFeeType(t);
                    setAmount("");
                    setNotes("");
                    setError(null);
                  }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    feeType === t
                      ? t === SCHOOL_FEE_TYPE
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-violet-600 text-white border-violet-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {t}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowNewFeeType((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-dashed border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50"
              >
                <Plus className="w-3.5 h-3.5" />
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
            {isSchoolFee && selectedFee && quarterAmounts && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(["Q1", "Q2", "Q3", "Q4"] as const).map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setAmount(String(quarterAmounts[i]))}
                    className="text-xs px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    {label} {fmt(quarterAmounts[i])}
                  </button>
                ))}
                {selectedFee.balance > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(selectedFee.balance))}
                    className="text-xs px-2.5 py-1 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    Balance {fmt(selectedFee.balance)}
                  </button>
                )}
              </div>
            )}
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={isSchoolFee ? "Quarter amount or partial payment" : "Enter amount"}
              min={1}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {isSchoolFee && (
              <p className="text-xs text-slate-400 mt-1">
                Use quick-fill for a full quarter, or enter a partial amount.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <MessageSquare className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              {isSchoolFee
                ? <>Comment <span className="text-slate-400 font-normal">(optional)</span></>
                : <>Notes {feeType.toLowerCase() === "other" ? "(required)" : "(optional)"}</>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isSchoolFee
                  ? "e.g. partial Q1 payment, receipt ref…"
                  : feeType.toLowerCase() === "other"
                    ? "Describe the fee…"
                    : "Optional note"
              }
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
              Payment recorded and synced to Google Sheets!
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !selectedFee}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors ${
              isSchoolFee ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700"
            }`}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : "Record payment"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-[320px]">
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400 shrink-0" />
            <h2 className="font-semibold text-slate-800 truncate">
              {selectedFee ? `${selectedFee.studentName}'s payments` : "Payment history"}
            </h2>
          </div>
          {selectedFee && hasHistory && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 px-2 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">School</p>
                <p className="text-sm font-semibold text-blue-700">{fmt(historyStats.schoolTotal)}</p>
                <p className="text-[10px] text-slate-400">{historyStats.schoolCount} payments</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Other</p>
                <p className="text-sm font-semibold text-violet-700">{fmt(historyStats.otherTotal)}</p>
                <p className="text-[10px] text-slate-400">{historyStats.otherCount} fees</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Total</p>
                <p className="text-sm font-semibold text-green-700">{fmt(historyStats.grandTotal)}</p>
                <p className="text-[10px] text-slate-400">all types</p>
              </div>
            </div>
          )}
          {selectedFee && hasHistory && (
            <div className="flex gap-1">
              {(["all", "school", "other"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setHistoryFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    historyFilter === f
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {f === "all" ? "All" : f === "school" ? "School fees" : "Other fees"}
                </button>
              ))}
            </div>
          )}
        </div>

        {!selectedFee ? (
          <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-sm px-4 text-center">
            Select a student to view school fees and other payments together
          </div>
        ) : loadingEntries ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : historyItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-sm">
            No payments recorded yet
          </div>
        ) : (
          <div className="divide-y divide-slate-50 overflow-y-auto max-h-[600px]">
            {historyItems.map((entry) => {
              const key = historyKey(entry.kind, entry.id);
              const typeLabel = entry.kind === "school" ? SCHOOL_FEE_TYPE : entry.feeType;
              const noteText = entry.kind === "school" ? entry.comment : entry.notes;

              return (
                <div key={key} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{formatDate(entry.date)}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          entry.kind === "school"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-violet-50 text-violet-700"
                        }`}
                      >
                        {typeLabel}
                      </span>
                      {entry.paymentMode && (
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            entry.paymentMode === "online"
                              ? "bg-violet-50 text-violet-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {paymentModeLabel(entry.paymentMode)}
                        </span>
                      )}
                    </div>
                    {noteText && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{noteText}</p>
                    )}
                  </div>

                  {editingKey === key ? (
                    <div className="flex flex-col items-end gap-2 shrink-0 w-full sm:w-auto">
                      {entry.kind === "other" && (
                        <select
                          value={editFeeType}
                          onChange={(e) => setEditFeeType(e.target.value)}
                          className="text-xs border border-slate-200 rounded px-2 py-1"
                        >
                          {otherFeeTypes.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-slate-500">₹</span>
                        <input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleEditSave(entry);
                            if (e.key === "Escape") setEditingKey(null);
                          }}
                          className="w-24 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none"
                          autoFocus
                          min={1}
                        />
                      </div>
                      <div className="flex gap-1">
                        {PAYMENT_MODES.map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setEditPaymentMode(mode)}
                            className={`text-xs px-2 py-1 rounded border ${
                              editPaymentMode === mode
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-slate-500 border-slate-200"
                            }`}
                          >
                            {paymentModeLabel(mode)}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder={entry.kind === "school" ? "Optional comment" : "Notes"}
                        rows={2}
                        className="w-full sm:w-40 text-xs border border-slate-200 rounded-lg px-2 py-1.5 resize-none"
                      />
                      {editSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => handleEditSave(entry)} className="text-green-600 hover:text-green-700" title="Save"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingKey(null)} className="text-slate-400 hover:text-slate-600" title="Cancel"><X className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                  ) : confirmDeleteKey === key ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-500">Delete?</span>
                      {deleting ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                      ) : (
                        <>
                          <button onClick={() => handleDelete(entry)} className="text-xs font-medium text-red-600 hover:text-red-700 px-2 py-0.5 rounded border border-red-200 hover:bg-red-50 transition-colors">Yes</button>
                          <button onClick={() => setConfirmDeleteKey(null)} className="text-slate-400 hover:text-slate-600" title="Cancel"><X className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-semibold ${entry.kind === "school" ? "text-green-700" : "text-violet-700"}`}>
                        {fmt(entry.amount)}
                      </span>
                      <button
                        onClick={() => startEdit(entry)}
                        className="text-slate-300 hover:text-blue-500 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setConfirmDeleteKey(key); setEditingKey(null); }}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {hasHistory && (
          <div className="px-5 py-3 border-t border-slate-100 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">
                {historyStats.schoolCount + historyStats.otherCount} total entries
              </span>
              <span className="font-semibold text-green-700">{fmt(historyStats.grandTotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Cash: {fmt(historyStats.cashTotal)}</span>
              <span>Online: {fmt(historyStats.onlineTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
