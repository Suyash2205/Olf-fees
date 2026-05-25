"use client";

import { useState } from "react";
import { FileStack, Loader2 } from "lucide-react";
import AdminPasswordDialog from "./AdminPasswordDialog";
import { portalFetch } from "@/lib/portal-fetch";

type BackfillResult = {
  created: number;
  skipped: number;
  skippedNames: string[];
  createdGrNos: string[];
};

export default function AdminAdmissionBackfill() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  async function runBackfill(password: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4 * 60 * 1000);
    try {
      const res = await portalFetch("/api/admin/backfill-admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: password }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setResult(data);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setError(
          "Timed out after 4 minutes. Refresh Admissions — partial rows may exist; run again to finish remaining students."
        );
      } else {
        setError(e instanceof Error ? e.message : "Backfill failed");
      }
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
          <FileStack className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Create admission profiles</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            One-time setup: adds an Admissions row for every student already on the Fee details
            sheet. Name, class, and fees are copied; other fields stay empty for your team to
            complete later. New students should still use{" "}
            <strong>Add new admission</strong> only.
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => setPasswordOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileStack className="w-4 h-4" />
        )}
        {loading
          ? "Creating profiles… (may take 1–3 min)"
          : "Create profiles for existing students"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="text-sm text-slate-700 space-y-1 rounded-lg bg-slate-50 border border-slate-100 p-3">
          <p>
            <strong>{result.created}</strong> admission profile
            {result.created === 1 ? "" : "s"} created.
          </p>
          {result.skipped > 0 && (
            <p className="text-slate-500">
              {result.skipped} skipped (already had a profile or inactive).
            </p>
          )}
        </div>
      )}

      <AdminPasswordDialog
        open={passwordOpen}
        title="Confirm bulk admission setup"
        description="This creates Incomplete admission records for all fee-sheet students who do not have one yet."
        confirmLabel="Create profiles"
        onClose={() => setPasswordOpen(false)}
        onConfirm={async (password) => {
          setPasswordOpen(false);
          await runBackfill(password);
        }}
      />
    </section>
  );
}
