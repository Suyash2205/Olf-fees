/** One-time fee types (bag, bus, books, etc.) — not quarterly school fees. */
export const DEFAULT_OTHER_FEE_TYPES = [
  "Bag",
  "Admission",
  "Books",
  "Bus",
  "Other",
] as const;

export function normalizeFeeTypeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function isValidFeeTypeName(name: string): boolean {
  return normalizeFeeTypeName(name).length >= 2;
}
