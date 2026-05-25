"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpCircle, ArrowDownCircle, Loader2 } from "lucide-react";

type BulkAction = "promote-all" | "demote-all";

export default function PromotionPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState<BulkAction | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function runBulk(action: BulkAction) {
    const label = action === "promote-all" ? "promote ALL students" : "demote ALL students";
    const extra =
      action === "promote-all"
        ? "\n\n10th Std → Pass out (fee unchanged).\nEveryone else moves up one class with 2026–27 fees."
        : "\n\nPass out → 10th Std with 10th fees.\nEveryone else moves down with matching fees.\nP.G. cannot go lower.";

    if (!confirm(`Are you sure you want to ${label}?${extra}`)) return;

    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);

      const errNote =
        data.errors?.length > 0 ? ` (${data.errors.length} errors — check console)` : "";
      if (data.errors?.length) console.warn("Promotion errors:", data.errors);

      setMessage({
        type: "ok",
        text: `Updated ${data.updated} student(s). Skipped ${data.skipped}.${errNote}`,
      });
      window.dispatchEvent(new Event("students-refresh"));
      router.refresh();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Promotion failed",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-amber-900">Class promotion</h2>
        <p className="text-xs text-amber-800/80 mt-0.5">
          Promote moves everyone up one standard and sets <strong>Fees decided</strong> to the
          2026–27 amount for their new class. 10th → Pass out (fee not changed). Demote reverses
          class and fee.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => runBulk("promote-all")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          {busy === "promote-all" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowUpCircle className="w-4 h-4" />
          )}
          Promote all
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => runBulk("demote-all")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-60 transition-colors"
        >
          {busy === "demote-all" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowDownCircle className="w-4 h-4" />
          )}
          Demote all
        </button>
      </div>

      {message && (
        <p
          className={`text-sm px-3 py-2 rounded-lg ${
            message.type === "ok"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-red-100 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
