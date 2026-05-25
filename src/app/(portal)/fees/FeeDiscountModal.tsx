"use client";

import { useMemo, useState } from "react";
import { X, Loader2, Percent } from "lucide-react";
import type { FeeRecord } from "@/lib/sheets/fees";
import { applyDiscount, formatINR, getBaseTuition, type DiscountType } from "@/lib/fees/structure";

function resolveBase(record: FeeRecord): number {
  const fromClass = getBaseTuition(record.className);
  if (fromClass != null) return fromClass;
  return record.totalFee + record.discount;
}

export default function FeeDiscountModal({
  record,
  onClose,
  onSaved,
}: {
  record: FeeRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const baseFee = resolveBase(record);

  const [discountType, setDiscountType] = useState<DiscountType>(
    record.discount > 0 ? "amount" : "none"
  );
  const [discountValue, setDiscountValue] = useState(
    record.discount > 0 ? String(record.discount) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const breakdown = useMemo(() => {
    if (discountType === "none") {
      return applyDiscount(baseFee, "none", 0);
    }
    return applyDiscount(baseFee, discountType, Number(discountValue) || 0);
  }, [baseFee, discountType, discountValue]);

  const standardNote =
    getBaseTuition(record.className) != null
      ? "Using 2026–27 standard fee for this class."
      : "No standard fee for this class — base is current fee + existing discount.";

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/fees/discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetRow: record.sheetRow,
          discountType,
          discountValue: Number(discountValue) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="font-semibold text-slate-800">Fee discount</h2>
              <p className="text-xs text-slate-500 truncate max-w-56">{record.studentName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Class</span>
              <span>{record.className || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Base annual fee</span>
              <span className="font-medium">{formatINR(baseFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Currently decided</span>
              <span>{formatINR(record.totalFee)}</span>
            </div>
            {record.discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Current discount</span>
                <span>−{formatINR(record.discount)}</span>
              </div>
            )}
            <p className="text-xs text-slate-400 pt-1">{standardNote}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Discount</p>
            <div className="flex gap-2 mb-3">
              {(
                [
                  ["none", "None"],
                  ["amount", "₹ Amount"],
                  ["percent", "%"],
                ] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setDiscountType(t);
                    if (t === "none") setDiscountValue("");
                  }}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border ${
                    discountType === t
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {discountType !== "none" && (
              <input
                type="number"
                min={0}
                max={discountType === "percent" ? 100 : baseFee}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 2000"}
              />
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm space-y-2">
            <div className="flex justify-between font-medium text-emerald-900">
              <span>New annual fee</span>
              <span>{formatINR(breakdown.finalFee)}</span>
            </div>
            {breakdown.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-800">
                <span>Discount</span>
                <span>−{formatINR(breakdown.discountAmount)}</span>
              </div>
            )}
            <div className="grid grid-cols-4 gap-1 text-center text-xs pt-1">
              {breakdown.quarterlyFees.map((q, i) => (
                <div key={i} className="bg-white/70 rounded py-1">
                  <div className="text-emerald-700/70">Q{i + 1}</div>
                  <div className="font-medium">{formatINR(q)}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-emerald-800/80 pt-1">
              Balance will update to new fee minus amount already paid ({formatINR(record.totalPaid)}).
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save to sheet
          </button>
        </div>
      </div>
    </>
  );
}
