"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Plus,
  Tag,
} from "lucide-react";
import type { ExpenseEntry } from "@/lib/sheets/dailyExpense";
import {
  PAYMENT_MODES,
  paymentModeLabel,
  type PaymentMode,
} from "@/lib/payment-mode";
import { usePortalRefresh } from "@/lib/use-portal-refresh";
import { portalFetch } from "@/lib/portal-fetch";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

type LoadResponse = { entries: ExpenseEntry[]; categories: string[] };

export default function DailyExpenseForm() {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editPaymentMode, setEditPaymentMode] = useState<PaymentMode>("cash");
  const [editCategory, setEditCategory] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [filterCategory, setFilterCategory] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await portalFetch("/api/daily-expense");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: LoadResponse = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setCategories(Array.isArray(data.categories) ? data.categories : []);
      setCategory((prev) => prev || data.categories?.[0] || "");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  usePortalRefresh(load);

  const filteredEntries = useMemo(() => {
    const list = filterCategory
      ? entries.filter((e) => e.category === filterCategory)
      : entries;
    return [...list].reverse();
  }, [entries, filterCategory]);

  const totals = useMemo(() => {
    const list = filterCategory
      ? entries.filter((e) => e.category === filterCategory)
      : entries;
    const total = list.reduce((s, e) => s + e.amount, 0);
    const cash = list
      .filter((e) => e.paymentMode !== "online")
      .reduce((s, e) => s + e.amount, 0);
    const online = list
      .filter((e) => e.paymentMode === "online")
      .reduce((s, e) => s + e.amount, 0);
    return { total, cash, online, count: list.length };
  }, [entries, filterCategory]);

  async function handleAddCategory() {
    const name = newCategory.trim();
    if (!name) return;
    setAddingCategory(true);
    setError(null);
    try {
      const res = await portalFetch("/api/daily-expense/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setCategories(data.categories ?? []);
      setCategory(data.category ?? name);
      setNewCategory("");
      setShowNewCategory(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add category");
    } finally {
      setAddingCategory(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !date || !amount || Number(amount) <= 0 || !comment.trim()) {
      setError("Category, date, amount, and comment are required.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await portalFetch("/api/daily-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          category,
          amount: Number(amount),
          paymentMode,
          comment: comment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSuccess(true);
      setAmount("");
      setComment("");
      setTimeout(() => setSuccess(false), 3000);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: ExpenseEntry) {
    setDeleting(true);
    try {
      const res = await portalFetch("/api/daily-expense", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setConfirmDeleteId(null);
      await load();
    } catch {
      setConfirmDeleteId(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleEditSave(entry: ExpenseEntry) {
    const newAmt = Number(editAmount);
    if (!newAmt || newAmt <= 0 || !editComment.trim() || !editCategory) return;
    setEditSaving(true);
    try {
      const res = await portalFetch("/api/daily-expense", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: entry.id,
          amount: newAmt,
          comment: editComment.trim(),
          paymentMode: editPaymentMode,
          category: editCategory,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingId(null);
      await load();
    } catch {
      /* stay in edit */
    } finally {
      setEditSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading expenses…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          onClick={load}
          className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-slate-200 p-5 space-y-4"
        >
          <h2 className="font-semibold text-slate-800">Record Expense</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <Tag className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="" disabled>
                Select category…
              </option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {!showNewCategory ? (
              <button
                type="button"
                onClick={() => setShowNewCategory(true)}
                className="mt-2 text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add new category
              </button>
            ) : (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category name"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  disabled={addingCategory || !newCategory.trim()}
                  onClick={handleAddCategory}
                  className="px-3 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-900 disabled:opacity-50"
                >
                  {addingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCategory(false);
                    setNewCategory("");
                  }}
                  className="px-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <CalendarDays className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Date
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
              placeholder="e.g. 5000"
              min={1}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Payment mode
            </label>
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <MessageSquare className="inline w-3.5 h-3.5 mr-1 text-slate-400" />
              Comment <span className="text-red-500">*</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What was this expense for?"
              rows={3}
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
              Expense recorded and synced to Google Sheets!
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !category}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Record Expense"
            )}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-800">Expense Log</h2>
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-sm">
            No expenses recorded yet
          </div>
        ) : (
          <div className="divide-y divide-slate-50 overflow-y-auto max-h-[600px]">
            {filteredEntries.map((entry) => (
              <div key={entry.id} className="px-5 py-3">
                {editingId === entry.id ? (
                  <div className="space-y-2">
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                      min={1}
                    />
                    <textarea
                      value={editComment}
                      onChange={(e) => setEditComment(e.target.value)}
                      rows={2}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 resize-none"
                    />
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
                    <div className="flex gap-2 justify-end">
                      {editSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      ) : (
                        <>
                          <button
                            onClick={() => handleEditSave(entry)}
                            className="text-green-600"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-slate-400"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : confirmDeleteId === entry.id ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">Delete this expense?</span>
                    {deleting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(entry)}
                          className="text-xs font-medium text-red-600 px-2 py-0.5 rounded border border-red-200"
                        >
                          Yes
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}>
                          <X className="w-4 h-4 text-slate-400" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-800">{entry.category}</p>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            entry.paymentMode === "online"
                              ? "bg-violet-50 text-violet-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {paymentModeLabel(entry.paymentMode)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(entry.date)}</p>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{entry.comment}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-red-600">
                        {fmt(entry.amount)}
                      </span>
                      <button
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditAmount(String(entry.amount));
                          setEditComment(entry.comment);
                          setEditPaymentMode(entry.paymentMode);
                          setEditCategory(entry.category);
                          setConfirmDeleteId(null);
                        }}
                        className="text-slate-300 hover:text-blue-500"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDeleteId(entry.id);
                          setEditingId(null);
                        }}
                        className="text-slate-300 hover:text-red-500"
                        title="Delete"
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

        {totals.count > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">
                {totals.count} expense{totals.count !== 1 ? "s" : ""}
              </span>
              <span className="font-semibold text-red-600">{fmt(totals.total)} total</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Cash: {fmt(totals.cash)}</span>
              <span>Online: {fmt(totals.online)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
