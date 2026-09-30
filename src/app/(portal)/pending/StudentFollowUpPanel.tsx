"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Phone, X } from "lucide-react";
import { portalFetch } from "@/lib/portal-fetch";
import { paymentModeLabel } from "@/lib/payment-mode";
import type { FollowUp } from "@/lib/fees/follow-ups";
import type { PendingRow } from "@/lib/fees/pending-report";

interface Contact {
  parentName: string;
  phones: string[];
  source: "portal" | "admissions" | "none";
  invalidRaw: string[];
}

interface PaymentLine {
  key: string;
  date: string;
  type: string;
  amount: number;
  mode: string;
  receiptNo?: string;
}

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

async function getJson(url: string) {
  const res = await portalFetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data;
}

const SOURCE_LABEL: Record<Contact["source"], string> = {
  portal: "Saved in portal",
  admissions: "From admissions",
  none: "No number on file",
};

export default function StudentFollowUpPanel({
  row,
  today,
  onClose,
  onChanged,
}: {
  row: PendingRow;
  today: string;
  onClose: () => void;
  /** Called after a follow-up is saved so the report refreshes. */
  onChanged: () => void;
}) {
  const { srNo } = row;

  // ---- parent contact
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [parentName, setParentName] = useState("");
  const [primary, setPrimary] = useState("");
  const [alternate, setAlternate] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);

  // ---- follow-ups
  const [history, setHistory] = useState<FollowUp[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [callDate, setCallDate] = useState(today);
  const [parentSaid, setParentSaid] = useState("");
  const [reason, setReason] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  // ---- payments
  const [payments, setPayments] = useState<PaymentLine[] | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const loadContact = useCallback(async () => {
    try {
      const data = await getJson(`/api/parent-contact?srNo=${encodeURIComponent(srNo)}`);
      setContactError(null);
      const c = data.contact as Contact;
      setContact(c);
      setParentName(c.parentName ?? "");
      setPrimary(c.phones[0] ?? "");
      setAlternate(c.phones[1] ?? "");
    } catch (e) {
      setContactError(e instanceof Error ? e.message : "Could not load contact");
    }
  }, [srNo]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await getJson(`/api/fee-followups?srNo=${encodeURIComponent(srNo)}`);
      setHistoryError(null);
      setHistory(data.followUps as FollowUp[]);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Could not load follow-ups");
    }
  }, [srNo]);

  const loadPayments = useCallback(async () => {
    try {
      const [school, other] = await Promise.all([
        getJson(`/api/daily-entry?srNo=${encodeURIComponent(srNo)}&reconcile=0`),
        getJson(`/api/other-fees?srNo=${encodeURIComponent(srNo)}`),
      ]);
      const lines: PaymentLine[] = [
        ...(school as { id: string; date: string; amount: number; paymentMode?: string; receiptNo?: string }[]).map((e) => ({
          key: `s${e.id}`,
          date: e.date,
          type: "School Fees",
          amount: e.amount,
          mode: e.paymentMode ?? "",
          receiptNo: e.receiptNo,
        })),
        ...((other as { entries: { id: string; date: string; amount: number; feeType: string; paymentMode: string; receiptNo?: string }[] }).entries ?? []).map((e) => ({
          key: `o${e.id}`,
          date: e.date,
          type: e.feeType,
          amount: e.amount,
          mode: e.paymentMode,
          receiptNo: e.receiptNo,
        })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      setPaymentsError(null);
      setPayments(lines);
    } catch (e) {
      setPaymentsError(e instanceof Error ? e.message : "Could not load payments");
    }
  }, [srNo]);

  useEffect(() => {
    // Deferred so no state is set synchronously inside the effect body.
    const id = setTimeout(() => {
      loadContact();
      loadHistory();
      loadPayments();
    }, 0);
    return () => clearTimeout(id);
  }, [loadContact, loadHistory, loadPayments]);

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    setSavingContact(true);
    setContactError(null);
    setContactSaved(false);
    try {
      const res = await portalFetch("/api/parent-contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srNo, parentName, primaryPhone: primary, alternatePhone: alternate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save contact");
      setContactSaved(true);
      await loadContact();
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Could not save contact");
    } finally {
      setSavingContact(false);
    }
  }

  async function saveFollowUp(e: React.FormEvent) {
    e.preventDefault();
    setSavingFollowUp(true);
    setFollowUpError(null);
    try {
      const res = await portalFetch("/api/fee-followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srNo, date: callDate, parentSaid, reason, nextFollowUp: nextDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save follow-up");
      setParentSaid("");
      setReason("");
      setNextDate("");
      await loadHistory();
      onChanged();
    } catch (err) {
      setFollowUpError(err instanceof Error ? err.message : "Could not save follow-up");
    } finally {
      setSavingFollowUp(false);
    }
  }

  const inputCls =
    "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="no-print fixed inset-0 z-[60] flex justify-end">
      <button type="button" aria-label="Close panel" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <aside className="relative w-full max-w-lg h-full overflow-y-auto bg-white shadow-xl p-5 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800 truncate">{row.studentName}</h2>
            <p className="text-sm text-slate-500">
              {row.className} · Sr No {row.srNo}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fee summary */}
        <section className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-400">Annual fee</p>
            <p className="font-semibold">{fmt(row.totalFee)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-400">Paid</p>
            <p className="font-semibold text-green-700">{fmt(row.totalPaid)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-400">Balance</p>
            <p className="font-semibold text-red-600">{fmt(row.balance)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-400">Quarters behind</p>
            <p className="font-semibold">{row.quartersLabel || "—"}</p>
          </div>
        </section>
        <div>
          <Link
            href={`/daily-entry?student=${encodeURIComponent(row.studentName)}`}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Record a payment for this student
          </Link>
        </div>

        {/* Parent contact */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Parent contact</h3>
            {contact && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {SOURCE_LABEL[contact.source]}
              </span>
            )}
          </div>
          {contactError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {contactError}
            </div>
          )}
          {contact && contact.invalidRaw.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {contact.invalidRaw.length} number(s) on file are not valid mobile numbers. Enter the correct one below.
            </p>
          )}
          {contact && contact.phones.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {contact.phones.map((p) => (
                <a
                  key={p}
                  href={`tel:+91${p}`}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {p}
                </a>
              ))}
            </div>
          )}
          <form onSubmit={saveContact} className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Parent name</label>
              <input className={inputCls} value={parentName} onChange={(e) => setParentName(e.target.value)} maxLength={120} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Primary phone</label>
                <input className={inputCls} inputMode="tel" value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="10-digit mobile" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Alternate phone</label>
                <input className={inputCls} inputMode="tel" value={alternate} onChange={(e) => setAlternate(e.target.value)} placeholder="optional" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingContact || !contact}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-60"
              >
                {savingContact ? "Saving…" : "Save contact"}
              </button>
              {contactSaved && (
                <span className="inline-flex items-center gap-1 text-sm text-green-700">
                  <CheckCircle2 className="w-4 h-4" /> Saved
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Call log */}
        <section className="space-y-3">
          <h3 className="font-semibold text-slate-800">Call log</h3>
          <form onSubmit={saveFollowUp} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Call date</label>
                <input type="date" className={inputCls} value={callDate} onChange={(e) => setCallDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Next follow-up (optional)</label>
                <input type="date" className={inputCls} value={nextDate} min={callDate} onChange={(e) => setNextDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">What the parent said</label>
              <textarea className={inputCls} rows={2} value={parentSaid} onChange={(e) => setParentSaid(e.target.value)} maxLength={1000} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Reason for delay</label>
              <textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            </div>
            {followUpError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {followUpError}
              </div>
            )}
            <button
              type="submit"
              disabled={savingFollowUp}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {savingFollowUp ? "Saving…" : "Add to call log"}
            </button>
          </form>

          {historyError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {historyError}
            </div>
          )}
          {history.length === 0 && !historyError && <p className="text-sm text-slate-400">No calls logged yet.</p>}
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.sheetRow} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <p className="text-xs text-slate-400">
                  {h.date}
                  {h.nextFollowUp && <> · next {h.nextFollowUp}</>}
                  {h.addedBy && <> · {h.addedBy}</>}
                </p>
                {h.parentSaid && <p className="text-slate-700 whitespace-pre-wrap">{h.parentSaid}</p>}
                {h.reason && <p className="text-slate-500 whitespace-pre-wrap">Reason: {h.reason}</p>}
              </li>
            ))}
          </ul>
        </section>

        {/* Payments */}
        <section className="space-y-2">
          <h3 className="font-semibold text-slate-800">Payment history</h3>
          {paymentsError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {paymentsError}
            </div>
          )}
          {!payments && !paymentsError && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          {payments && payments.length === 0 && <p className="text-sm text-slate-400">No payments recorded.</p>}
          {payments && payments.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="py-1.5 pr-2">Date</th>
                  <th className="py-1.5 pr-2">Type</th>
                  <th className="py-1.5 pr-2 text-right">Amount</th>
                  <th className="py-1.5 pr-2">Mode</th>
                  <th className="py-1.5">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {payments.map((p) => (
                  <tr key={p.key}>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{p.date}</td>
                    <td className="py-1.5 pr-2">{p.type}</td>
                    <td className="py-1.5 pr-2 text-right font-medium">{fmt(p.amount)}</td>
                    <td className="py-1.5 pr-2">{paymentModeLabel(p.mode) || "—"}</td>
                    <td className="py-1.5 font-mono text-xs">{p.receiptNo ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </aside>
    </div>
  );
}
