/** Helpers to confirm Google Sheets writes actually persisted before returning success. */

export function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

export function parseSheetAmount(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const n = parseFloat(String(val ?? "").replace(/[₹,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function normalizeSheetDate(val: unknown): string {
  const s = String(val ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Re-read the sheet until the expected state is visible, or throw so callers
 * skip audit / cache invalidation on a failed write.
 */
export async function verifySheetWrite(
  verify: () => Promise<boolean>,
  label: string
): Promise<void> {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(300 * i);
    if (await verify()) return;
  }
  throw new Error(
    `${label} could not be confirmed on Google Sheets — nothing was saved. Please try again.`
  );
}
