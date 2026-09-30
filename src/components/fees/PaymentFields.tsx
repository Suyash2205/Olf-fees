"use client";

import { Receipt } from "lucide-react";
import { PAYMENT_MODES, paymentModeLabel, type PaymentMode } from "@/lib/payment-mode";

/** What the office picks on the form: one mode, or a cash + online split. */
export type PaymentModeChoice = PaymentMode | "split";

export const RECEIPT_MAX = 30;

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

/** Prominent, optional receipt-number field. */
export function ReceiptField({
  value,
  onChange,
  id = "receipt-no",
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-3">
      <label htmlFor={id} className="block text-sm font-semibold text-amber-900 mb-1">
        <Receipt className="inline w-4 h-4 mr-1.5 -mt-0.5" />
        Receipt No <span className="font-normal text-amber-700">(optional)</span>
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={RECEIPT_MAX}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 1042"
        className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
    </div>
  );
}

/** Cash / Online / Cash + Online. */
export function PaymentModePicker({
  value,
  onChange,
}: {
  value: PaymentModeChoice;
  onChange: (m: PaymentModeChoice) => void;
}) {
  const options: PaymentModeChoice[] = [...PAYMENT_MODES, "split"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`px-2 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
            value === mode
              ? mode === "cash"
                ? "bg-emerald-600 text-white border-emerald-600"
                : mode === "online"
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-slate-800 text-white border-slate-800"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
          }`}
        >
          {mode === "split" ? "Cash + Online" : paymentModeLabel(mode)}
        </button>
      ))}
    </div>
  );
}

/** Two amount inputs with a live total, for a split payment. */
export function SplitAmountInputs({
  cash,
  online,
  onCash,
  onOnline,
}: {
  cash: string;
  online: string;
  onCash: (v: string) => void;
  onOnline: (v: string) => void;
}) {
  const total = (Number(cash) || 0) + (Number(online) || 0);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-emerald-700 mb-1">Cash (₹)</label>
          <input
            type="number"
            min={0}
            step="any"
            value={cash}
            onChange={(e) => onCash(e.target.value)}
            className="w-full border border-emerald-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-violet-700 mb-1">Online (₹)</label>
          <input
            type="number"
            min={0}
            step="any"
            value={online}
            onChange={(e) => onOnline(e.target.value)}
            className="w-full border border-violet-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">Total</span>
        <span className="font-semibold text-slate-800">{fmt(total)}</span>
      </div>
      <p className="text-xs text-slate-400">
        Saved as two entries (one cash, one online) with the same receipt number.
      </p>
    </div>
  );
}

/** Body fields for the POST APIs, or an error string when the amounts are not valid. */
export function paymentBody(
  mode: PaymentModeChoice,
  amount: string,
  cash: string,
  online: string
): { fields: Record<string, unknown>; total: number } | { error: string } {
  if (mode === "split") {
    const c = Number(cash);
    const o = Number(online);
    if (!(c > 0) || !(o > 0)) {
      return { error: "For Cash + Online, enter both a cash amount and an online amount." };
    }
    return { fields: { paymentMode: "split", cashAmount: c, onlineAmount: o }, total: c + o };
  }
  const a = Number(amount);
  if (!(a > 0)) return { error: "Enter a valid amount." };
  return { fields: { paymentMode: mode, amount: a }, total: a };
}
