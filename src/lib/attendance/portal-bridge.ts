const FROM_FEES_KEY = "attendance_from_fees";
const FEES_UNLOCK_KEY = "fees_portal_unlocked";
const FEES_UNLOCK_AT_KEY = "fees_portal_unlocked_at";
const UNLOCK_TTL_MS = 8 * 60 * 60 * 1000;

export function markAttendanceFromFees(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(FROM_FEES_KEY, "1");
}

export function cameFromFeesPortal(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(FROM_FEES_KEY) === "1";
}

export function clearFeesPortalUnlock(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(FEES_UNLOCK_KEY);
  sessionStorage.removeItem(FEES_UNLOCK_AT_KEY);
}

export function setFeesPortalUnlocked(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(FEES_UNLOCK_KEY, "1");
  sessionStorage.setItem(FEES_UNLOCK_AT_KEY, String(Date.now()));
}

export function isFeesPortalUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  if (sessionStorage.getItem(FEES_UNLOCK_KEY) !== "1") return false;
  const at = Number(sessionStorage.getItem(FEES_UNLOCK_AT_KEY));
  if (!at || Date.now() - at > UNLOCK_TTL_MS) {
    clearFeesPortalUnlock();
    return false;
  }
  return true;
}

export function canShowFeesPortalBackLink(): boolean {
  return cameFromFeesPortal() || isFeesPortalUnlocked();
}
