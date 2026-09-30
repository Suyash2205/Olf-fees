/** Cash + Online split payments (pure). One split becomes two log rows, same receipt. */
import type { PaymentMode } from "@/lib/payment-mode";

export interface SplitPart {
  paymentMode: PaymentMode;
  amount: number;
  /** Comment/notes for this row, with the "(split: ...)" suffix. */
  note: string;
}

function money(n: number): string {
  return `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

function validAmount(n: number): boolean {
  return Number.isFinite(n) && n > 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

export function splitSuffix(cash: number, online: number): string {
  return `(split: ${money(cash)} cash + ${money(online)} online)`;
}

/**
 * Build the two rows of a split payment: cash first, then online.
 * Both amounts must be > 0 (a single-mode payment is not a split).
 */
export function buildSplitParts(cash: number, online: number, note?: string): [SplitPart, SplitPart] {
  if (!validAmount(cash) || !validAmount(online)) {
    throw new Error(
      "For a Cash + Online payment enter both amounts (each above 0, at most 2 decimals)."
    );
  }
  const base = (note ?? "").trim();
  const suffix = splitSuffix(cash, online);
  const text = base ? `${base} ${suffix}` : suffix;
  return [
    { paymentMode: "cash", amount: cash, note: text },
    { paymentMode: "online", amount: online, note: text },
  ];
}

export class SplitRollbackError extends Error {}

/**
 * Save the parts one by one. If a later part fails, undo the ones already saved (newest first)
 * so a half-saved split is never left behind. `append` returns the saved row id.
 * Throws the original error when the rollback succeeded; throws SplitRollbackError with
 * the ids that must be removed by hand when a rollback step itself fails.
 */
export async function saveAllOrNothing<P>(
  parts: P[],
  append: (part: P) => Promise<string>,
  undo: (rowId: string, part: P) => Promise<void>
): Promise<string[]> {
  const saved: { id: string; part: P }[] = [];
  try {
    for (const part of parts) {
      saved.push({ id: await append(part), part });
    }
    return saved.map((s) => s.id);
  } catch (err) {
    const stuck: string[] = [];
    for (const s of [...saved].reverse()) {
      try {
        await undo(s.id, s.part);
      } catch {
        stuck.push(s.id);
      }
    }
    if (stuck.length > 0) {
      throw new SplitRollbackError(
        `Split payment failed part-way and the earlier part could not be undone automatically (sheet row ${stuck.join(", ")}). Remove that row by hand before retrying.`
      );
    }
    throw err;
  }
}
