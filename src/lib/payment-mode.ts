export const PAYMENT_MODES = ["cash", "online"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export function normalizePaymentMode(val: unknown): PaymentMode {
  const s = String(val ?? "").trim().toLowerCase();
  return s === "online" ? "online" : "cash";
}

export function paymentModeLabel(mode?: PaymentMode | string): string {
  if (mode === "online") return "Online";
  if (mode === "cash") return "Cash";
  return "";
}
