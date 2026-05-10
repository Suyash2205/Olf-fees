"use client";

import { useState, useMemo, useRef } from "react";
import { Search, Check, X, Loader2 } from "lucide-react";
import type { FeeRecord } from "@/lib/sheets/fees";

type QField = "q1Paid" | "q2Paid" | "q3Paid" | "q4Paid";

function fmt(n: number) {
  if (n === 0) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

function StatusPill({ paid, quarterFee }: { paid: number; quarterFee: number }) {
  if (paid <= 0) return <span className="text-xs text-slate-400">Pending</span>;
  if (paid >= quarterFee) return <span className="text-xs font-medium text-green-600">Paid</span>;
  return <span className="text-xs font-medium text-amber-600">Partial</span>;
}

interface EditingCell {
  sheetRow: number;
  field: QField | "notes";
  value: string;
}

export default function FeesTable({
  fees,
  highlightStudent,
}: {
  fees: FeeRecord[];
  highlightStudent?: string;
}) {
  const [query, setQuery] = useState(highlightStudent ?? "");
  const [classFilter, setClassFilter] = useState("all");
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const [localFees, setLocalFees] = useState<FeeRecord[]>(fees);
  const inputRef = useRef<HTMLInputElement>(null);

  const classes = useMemo(
    () => ["all", ...Array.from(new Set(fees.map((f) => f.className).filter(Boolean))).sort()],
    [fees]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return localFees.filter((f) => {
      if (classFilter !== "all" && f.className !== classFilter) return false;
      if (!q) return true;
      return (
        f.studentName.toLowerCase().includes(q) ||
        f.srNo.includes(q) ||
        f.className.toLowerCase().includes(q)
      );
    });
  }, [localFees, query, classFilter]);

  function startEdit(fee: FeeRecord, field: QField | "notes") {
    const value = field === "notes" ? fee.notes : String(fee[field]);
    setEditing({ sheetRow: fee.sheetRow, field, value });
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commitEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/fees/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetRow: editing.sheetRow, field: editing.field, value: editing.value }),
      });
      if (!res.ok) throw new Error("Save failed");

      setLocalFees((prev) =>
        prev.map((f) => {
          if (f.sheetRow !== editing.sheetRow) return f;
          const updated = { ...f, [editing.field]: editing.field === "notes" ? editing.value : Number(editing.value) || 0 };
          updated.totalPaid = updated.q1Paid + updated.q2Paid + updated.q3Paid + updated.q4Paid;
          updated.balance = updated.totalFee - updated.totalPaid;
          return updated;
        })
      );

      setFlash(editing.sheetRow);
      setTimeout(() => setFlash(null), 1500);
    } catch {
      // keep editing open on error
    } finally {
      setSaving(false);
      setEditing(null);
    }
  }

  function cancelEdit() {
    setEditing(null);
  }

  function EditableCell({
    fee,
    field,
    value,
  }: {
    fee: FeeRecord;
    field: QField | "notes";
    value: string;
  }) {
    const isEditing = editing?.sheetRow === fee.sheetRow && editing?.field === field;
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type={field === "notes" ? "text" : "number"}
            value={editing.value}
            onChange={(e) => setEditing((prev) => prev && { ...prev, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            className="w-24 border border-blue-400 rounded px-2 py-0.5 text-sm focus:outline-none"
            min={0}
          />
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
          ) : (
            <>
              <button onClick={commitEdit} className="text-green-600 hover:text-green-700">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      );
    }
    return (
      <button
        onClick={() => startEdit(fee, field)}
        className="text-left hover:bg-blue-50 hover:text-blue-700 rounded px-1 py-0.5 -mx-1 transition-colors w-full"
        title="Click to edit"
      >
        {value || "—"}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      {/* Filters */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search student or class..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {classes.map((c) => (
            <option key={`class-${c}`} value={c}>
              {c === "all" ? "All Classes" : c}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-400 self-center">
          {filtered.length} students
        </span>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Fee</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Q1</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Q2</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Q3</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Q4</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paid</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Balance</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                  No records found
                </td>
              </tr>
            ) : (
              filtered.map((f) => {
                const qFee = f.totalFee / 4;
                const isFlash = flash === f.sheetRow;
                return (
                  <tr
                    key={f.sheetRow}
                    className={`transition-colors ${isFlash ? "bg-green-50" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-4 py-2.5 text-xs text-slate-400">{f.srNo}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 sticky left-0 bg-white">
                      {f.studentName}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{f.className || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmt(f.totalFee)}</td>
                    {(["q1Paid", "q2Paid", "q3Paid", "q4Paid"] as QField[]).map((q) => (
                      <td key={q} className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <EditableCell fee={f} field={q} value={fmt(f[q])} />
                          <StatusPill paid={f[q]} quarterFee={qFee} />
                        </div>
                      </td>
                    ))}
                    <td className="px-4 py-2.5 font-medium text-green-700">{fmt(f.totalPaid)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-medium ${f.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                        {fmt(f.balance)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs max-w-32">
                      <EditableCell fee={f} field="notes" value={f.notes || ""} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
        Click any Q1–Q4 cell to update the amount · changes save directly to Google Sheets
      </div>
    </div>
  );
}
