/** Receipt-number helpers (pure). A receipt is optional free text such as "1042" or "R-17/26". */

export const RECEIPT_MAX_LENGTH = 30;
const RECEIPT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 /._#-]*$/;

/**
 * Trim and validate a receipt number. Blank → undefined.
 * Throws a user-readable Error on invalid input (never silently alters the value,
 * apart from trimming and collapsing runs of spaces).
 */
export function normalizeReceiptNo(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim().replace(/\s+/g, " ");
  if (!s) return undefined;
  if (s.length > RECEIPT_MAX_LENGTH) {
    throw new Error(`Receipt number is too long (max ${RECEIPT_MAX_LENGTH} characters).`);
  }
  if (!RECEIPT_PATTERN.test(s)) {
    throw new Error(
      "Receipt number may only contain letters, digits, spaces and / . _ # - (and must start with a letter or digit)."
    );
  }
  return s;
}

/**
 * Value to write into a USER_ENTERED cell. All-digit receipts get a leading apostrophe so
 * Sheets stores them as text (keeps "0042" instead of turning it into 42).
 */
export function receiptCellValue(receiptNo: string | undefined): string {
  if (!receiptNo) return "";
  return /^\d+$/.test(receiptNo) ? `'${receiptNo}` : receiptNo;
}

/** Read a receipt cell back (strips a stray leading apostrophe). */
export function parseReceiptCell(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim().replace(/^'/, "");
  return s || undefined;
}

/**
 * Find entries by receipt number: exact (case-insensitive) matches first; only when there is
 * none and the query is at least 3 characters, fall back to "contains".
 */
export function searchByReceipt<T extends { receiptNo?: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = items.filter((i) => i.receiptNo?.trim().toLowerCase() === q);
  if (exact.length > 0) return exact;
  if (q.length < 3) return [];
  return items.filter((i) => i.receiptNo?.toLowerCase().includes(q));
}
