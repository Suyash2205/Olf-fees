/** 2026–27 annual tuition (₹) from school fee structure slips */

export const CLASS_OPTIONS = [
  "P.G.",
  "Nursery",
  "Jr. Kg.",
  "Sr. Kg.",
  "1st Std",
  "2nd Std",
  "3rd Std",
  "4th Std",
  "5th Std",
  "6th Std",
  "7th Std",
  "8th Std",
  "9th Std",
  "10th Std",
] as const;

export type ClassOption = (typeof CLASS_OPTIONS)[number];

export const TUITION_2026_27: Record<ClassOption, number> = {
  "P.G.": 23000,
  Nursery: 23000,
  "Jr. Kg.": 23000,
  "Sr. Kg.": 23000,
  "1st Std": 25600,
  "2nd Std": 25600,
  "3rd Std": 23500,
  "4th Std": 23500,
  "5th Std": 25400,
  "6th Std": 25400,
  "7th Std": 25400,
  "8th Std": 28400,
  "9th Std": 31200,
  "10th Std": 37800,
};

/** Quarterly tuition from slips (equal split of annual; amounts match photos) */
export const QUARTERLY_2026_27: Record<ClassOption, number> = {
  "P.G.": 5750,
  Nursery: 5750,
  "Jr. Kg.": 5750,
  "Sr. Kg.": 5750,
  "1st Std": 6400,
  "2nd Std": 6400,
  "3rd Std": 5875,
  "4th Std": 5875,
  "5th Std": 6350,
  "6th Std": 6350,
  "7th Std": 6350,
  "8th Std": 7100,
  "9th Std": 7800,
  "10th Std": 9450,
};

const ALIASES: Record<string, ClassOption> = {
  pg: "P.G.",
  "p.g": "P.G.",
  "p.g.": "P.G.",
  "p g": "P.G.",
  "p. g": "P.G.",
  "p. g.": "P.G.",
  playgroup: "P.G.",
  "play group": "P.G.",
  prekg: "P.G.",
  "pre kg": "P.G.",
  nursery: "Nursery",
  "jr kg": "Jr. Kg.",
  "jr. kg": "Jr. Kg.",
  "jr. kg.": "Jr. Kg.",
  "jr kg.": "Jr. Kg.",
  "junior kg": "Jr. Kg.",
  "sr kg": "Sr. Kg.",
  "sr. kg": "Sr. Kg.",
  "sr. kg.": "Sr. Kg.",
  "sr kg.": "Sr. Kg.",
  "senior kg": "Sr. Kg.",
  "1st": "1st Std",
  "1st std": "1st Std",
  "2nd": "2nd Std",
  "2nd std": "2nd Std",
  "3rd": "3rd Std",
  "3rd std": "3rd Std",
  "4th": "4th Std",
  "4th std": "4th Std",
  "5th": "5th Std",
  "5th std": "5th Std",
  "6th": "6th Std",
  "6th std": "6th Std",
  "7th": "7th Std",
  "7th std": "7th Std",
  "8th": "8th Std",
  "8th std": "8th Std",
  "9th": "9th Std",
  "9th std": "9th Std",
  "10th": "10th Std",
  "10th std": "10th Std",
};

export function resolveClass(className: string): ClassOption | null {
  const raw = className.trim();
  if (!raw) return null;
  if ((CLASS_OPTIONS as readonly string[]).includes(raw)) return raw as ClassOption;
  const key = raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  const keyWithDots = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (ALIASES[key]) return ALIASES[key];
  if (ALIASES[keyWithDots]) return ALIASES[keyWithDots];
  return null;
}

/** Canonical label for portal display and grouping (e.g. "PG" → "P.G."). */
export function canonicalClassLabel(className: string): string {
  return resolveClass(className) ?? (className.trim() || "Unknown");
}

export function getBaseTuition(className: string): number | null {
  const cls = resolveClass(className);
  return cls ? TUITION_2026_27[cls] : null;
}

export function getBaseQuarterly(className: string): number | null {
  const cls = resolveClass(className);
  return cls ? QUARTERLY_2026_27[cls] : null;
}

export type DiscountType = "none" | "amount" | "percent";

export interface FeeBreakdown {
  baseFee: number;
  discountAmount: number;
  finalFee: number;
  quarterlyFees: [number, number, number, number];
}

export function applyDiscount(
  baseFee: number,
  discountType: DiscountType,
  discountValue: number
): FeeBreakdown {
  let discountAmount = 0;
  if (discountType === "amount") {
    discountAmount = Math.max(0, discountValue);
  } else if (discountType === "percent") {
    discountAmount = Math.max(0, Math.round((baseFee * discountValue) / 100));
  }
  discountAmount = Math.min(discountAmount, baseFee);
  const finalFee = baseFee - discountAmount;

  const q = splitIntoQuarters(finalFee);
  return { baseFee, discountAmount, finalFee, quarterlyFees: q };
}

/** Split annual fee into 4 quarters; remainder goes to Q4 (matches slip rounding). */
export function splitIntoQuarters(annual: number): [number, number, number, number] {
  const q = Math.floor(annual / 4);
  const remainder = annual - q * 4;
  return [q, q, q, q + remainder];
}

export function computeFeeBreakdown(
  className: string,
  discountType: DiscountType,
  discountValue: number
): FeeBreakdown | null {
  const baseFee = getBaseTuition(className);
  if (baseFee == null) return null;
  return applyDiscount(baseFee, discountType, discountValue);
}

export function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}
