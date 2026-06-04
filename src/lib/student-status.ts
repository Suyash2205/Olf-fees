/** Admission / fee statuses that hide a student from active portal lists. */
export const INACTIVE_STATUSES = new Set(["left", "failed", "removed"]);

/** True for Left / Failed / Removed — hidden from Students, Fees, Dashboard. */
export function isInactiveAdmissionStatus(status: string | undefined): boolean {
  const s = status?.trim().toLowerCase();
  if (!s) return false;
  return INACTIVE_STATUSES.has(s);
}

/** Visible on portal lists (includes Active, Incomplete, and blank). */
export function isActiveStatus(status: string | undefined): boolean {
  return !isInactiveAdmissionStatus(status);
}

export function normalizeStatusLabel(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "left") return "Left";
  if (s === "failed") return "Failed";
  if (s === "removed") return "Removed";
  if (s === "active") return "Active";
  return status.trim();
}

export function statusFromFeeNotes(notes: string): string | null {
  const m = notes.match(/STATUS:\s*(Left|Failed|Removed)/i);
  return m ? normalizeStatusLabel(m[1]) : null;
}

export function upsertStatusInNotes(notes: string, status: string | null): string {
  const base = notes.replace(/\s*STATUS:\s*(Left|Failed|Removed)\s*/gi, "").trim();
  if (!status || isActiveStatus(status)) return base;
  const label = normalizeStatusLabel(status);
  return base ? `${base} STATUS: ${label}` : `STATUS: ${label}`;
}
