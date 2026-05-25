"use client";

import { useState } from "react";
import { Loader2, UserMinus, UserX } from "lucide-react";
import { portalFetch } from "@/lib/portal-fetch";
import { dispatchPortalRefresh } from "@/lib/portal-refresh";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type PendingAction = "Left" | "Failed" | "remove";

type Props = {
  studentName: string;
  sheetRow?: number;
  grNo?: string | null;
  compact?: boolean;
  onDone?: () => void;
};

export default function StudentStatusActions({
  studentName,
  sheetRow,
  grNo,
  compact = false,
  onDone,
}: Props) {
  const [busy, setBusy] = useState<PendingAction | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function executeAction(action: PendingAction) {
    setBusy(action);
    setError(null);
    try {
      if (action === "remove") {
        const res = await portalFetch("/api/students/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheetRow, grNo: grNo ?? undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
      } else {
        const res = await portalFetch("/api/students/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheetRow, grNo: grNo ?? undefined, status: action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
      }
      setPending(null);
      dispatchPortalRefresh();
      window.dispatchEvent(new Event("students-refresh"));
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const descriptions: Record<PendingAction, { title: string; body: string; label: string }> = {
    Left: {
      title: "Mark as left",
      body: `Mark ${studentName} as left school? They will be hidden from active fee and student lists.`,
      label: "Mark as left",
    },
    Failed: {
      title: "Mark as failed",
      body: `Mark ${studentName} as failed / discontinued? They will be hidden from active lists.`,
      label: "Mark as failed",
    },
    remove: {
      title: "Remove student permanently",
      body: `Permanently remove ${studentName} from Admissions, Fee details, and the student list? This cannot be undone.`,
      label: "Remove permanently",
    },
  };

  const dialog = pending ? descriptions[pending] : null;

  const btn =
    "inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors disabled:opacity-50";

  if (busy) {
    return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;
  }

  return (
    <>
      <ConfirmDialog
        open={pending != null}
        title={dialog?.title ?? ""}
        description={dialog?.body ?? ""}
        error={error}
        confirmLabel={dialog?.label ?? "Confirm"}
        variant={pending === "remove" ? "danger" : "default"}
        busy={busy != null}
        onClose={() => {
          if (!busy) {
            setPending(null);
            setError(null);
          }
        }}
        onConfirm={() => pending && executeAction(pending)}
      />
      <div className={`flex ${compact ? "flex-col gap-1" : "flex-wrap gap-1"}`}>
        <button
          type="button"
          className={`${btn} border-amber-200 text-amber-800 hover:bg-amber-50`}
          onClick={() => {
            setError(null);
            setPending("Left");
          }}
        >
          <UserMinus className="w-3.5 h-3.5" />
          Left
        </button>
        <button
          type="button"
          className={`${btn} border-orange-200 text-orange-800 hover:bg-orange-50`}
          onClick={() => {
            setError(null);
            setPending("Failed");
          }}
        >
          <UserX className="w-3.5 h-3.5" />
          Failed
        </button>
        <button
          type="button"
          className={`${btn} border-red-200 text-red-700 hover:bg-red-50`}
          onClick={() => {
            setError(null);
            setPending("remove");
          }}
        >
          Remove
        </button>
      </div>
    </>
  );
}
