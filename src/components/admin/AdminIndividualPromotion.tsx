"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { portalFetch } from "@/lib/portal-fetch";
import { dispatchPortalRefresh } from "@/lib/portal-refresh";
import { sortByGradeThenName } from "@/lib/sort-by-grade";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import AdminPasswordDialog from "@/components/admin/AdminPasswordDialog";

type StudentRow = {
  name: string;
  className: string;
  sheetRow: number;
};

function isPassOut(name: string, className: string): boolean {
  return /\(pass\s*out\)/i.test(name) || /pass\s*out/i.test(className);
}

export default function AdminIndividualPromotion() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    sheetRow: number;
    action: "promote" | "demote";
    studentName: string;
  } | null>(null);
  const [passwordAction, setPasswordAction] = useState<typeof confirmAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await portalFetch("/api/students");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setStudents(
        data.map((s: StudentRow & { fees?: string }) => ({
          name: s.name,
          className: s.className,
          sheetRow: s.sheetRow,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = !q
      ? students
      : students.filter(
          (s) =>
            s.name.toLowerCase().includes(q) || s.className.toLowerCase().includes(q)
        );
    return sortByGradeThenName(list, (s) => s.className, (s) => s.name);
  }, [students, query]);

  async function runPromo(password: string) {
    if (!passwordAction) return;
    const { sheetRow, action } = passwordAction;
    setBusy(true);
    setError(null);
    setRowBusy(sheetRow);
    try {
      const res = await portalFetch("/api/promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sheetRow, adminPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.skipped > 0 && data.updated === 0) {
        setError(data.errors?.[0] ?? "No change made");
        return;
      }
      setPasswordAction(null);
      await load();
      dispatchPortalRefresh();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
      setRowBusy(null);
    }
  }

  const verb = confirmAction?.action === "promote" ? "Promote" : "Demote";
  const pwdVerb = passwordAction?.action === "promote" ? "Promote" : "Demote";

  return (
    <>
      <ConfirmDialog
        open={confirmAction != null}
        title={`${verb} student`}
        description={
          confirmAction
            ? `${verb} ${confirmAction.studentName} one standard and update their 2026–27 fee?`
            : ""
        }
        confirmLabel="Continue"
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction) {
            setPasswordAction(confirmAction);
            setConfirmAction(null);
          }
        }}
      />
      <AdminPasswordDialog
        open={passwordAction != null}
        title={`${pwdVerb} student`}
        description={
          passwordAction
            ? `Enter admin password to ${pwdVerb.toLowerCase()} ${passwordAction.studentName}.`
            : ""
        }
        confirmLabel={passwordAction ? `${pwdVerb} student` : "Confirm"}
        busy={busy}
        error={error}
        onClose={() => {
          if (!busy) {
            setPasswordAction(null);
            setError(null);
          }
        }}
        onConfirm={runPromo}
      />

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Promote / demote one student</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Change a single student&apos;s class and fee. Requires admin password.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search student or class…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-6 text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 max-h-[360px] overflow-y-auto divide-y divide-slate-50">
            {filtered.map((s) => {
              const passOut = isPassOut(s.name, s.className);
              const rowLoading = rowBusy === s.sheetRow;
              return (
                <div
                  key={s.sheetRow}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.className || "—"}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {rowLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={passOut}
                          title="Promote"
                          onClick={() =>
                            setConfirmAction({
                              sheetRow: s.sheetRow,
                              action: "promote",
                              studentName: s.name,
                            })
                          }
                          className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-30"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Demote"
                          onClick={() =>
                            setConfirmAction({
                              sheetRow: s.sheetRow,
                              action: "demote",
                              studentName: s.name,
                            })
                          }
                          className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
