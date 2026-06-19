"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { portalFetch } from "@/lib/portal-fetch";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function FeesPortalUnlockDialog({ open, onClose, onSuccess }: Props) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await portalFetch("/api/portal/fees-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invalid passcode");
      setPasscode("");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid passcode");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={() => !busy && onClose()}
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Admin passcode</h2>
            <p className="mt-1 text-sm text-slate-500">Enter passcode to open the fees portal.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoFocus
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          placeholder="Passcode"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !passcode}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Unlock fees portal
        </button>
      </form>
    </div>
  );
}
