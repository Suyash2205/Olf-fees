/** Who can open fees vs attendance (see FEES_ALLOWED_EMAILS / ATTENDANCE_ALLOWED_EMAILS). */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

const feesEmails = parseEmailList(process.env.FEES_ALLOWED_EMAILS);
const attendanceEmails = parseEmailList(process.env.ATTENDANCE_ALLOWED_EMAILS);

function isConfigured(): boolean {
  return feesEmails.size > 0 || attendanceEmails.size > 0;
}

/** Admins — fees & expense portal (and attendance via canAccessAttendance). */
export function canAccessFees(email: string | null | undefined): boolean {
  if (!email) return false;
  if (!isConfigured()) return true;
  return feesEmails.has(normalizeEmail(email));
}

/** Teachers + admins — attendance system. */
export function canAccessAttendance(email: string | null | undefined): boolean {
  if (!email) return false;
  if (!isConfigured()) return true;
  const normalized = normalizeEmail(email);
  return feesEmails.has(normalized) || attendanceEmails.has(normalized);
}

/** Anyone on either list (for sign-in when lists are configured). */
export function canSignIn(email: string | null | undefined): boolean {
  return canAccessAttendance(email);
}
