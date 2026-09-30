/** Fee follow-up (call log) selection logic — pure. */

export interface FollowUp {
  srNo: string;
  studentName: string;
  className: string;
  /** Call date, YYYY-MM-DD. */
  date: string;
  parentSaid: string;
  reason: string;
  /** YYYY-MM-DD or "". */
  nextFollowUp: string;
  addedBy: string;
  addedAt: string;
  /** Sheet row — final tiebreak. */
  sheetRow: number;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Newest first: call date, then time added, then sheet row. */
export function compareFollowUpsNewestFirst(a: FollowUp, b: FollowUp): number {
  return (
    b.date.localeCompare(a.date) ||
    b.addedAt.localeCompare(a.addedAt) ||
    b.sheetRow - a.sheetRow
  );
}

/** History for one student, newest first. Joined on Sr No only. */
export function followUpHistory(rows: FollowUp[], srNo: string): FollowUp[] {
  return rows.filter((r) => r.srNo === srNo).sort(compareFollowUpsNewestFirst);
}

/** The most recent call-log entry per Sr No. */
export function latestFollowUpBySrNo(rows: FollowUp[]): Map<string, FollowUp> {
  const out = new Map<string, FollowUp>();
  for (const r of rows) {
    if (!r.srNo) continue;
    const cur = out.get(r.srNo);
    if (!cur || compareFollowUpsNewestFirst(r, cur) < 0) out.set(r.srNo, r);
  }
  return out;
}

export interface DueFollowUp {
  followUp: FollowUp;
  overdue: boolean;
  daysOverdue: number;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000
  );
}

/**
 * Follow-ups due: the student's LATEST entry has a next-follow-up date that is today or earlier.
 * `owing` is the set of Sr Nos still worth chasing (active students with a balance);
 * anyone not in it is skipped so paid-up students stop appearing.
 */
export function selectDueFollowUps(
  latest: Map<string, FollowUp>,
  owing: ReadonlySet<string>,
  todayIso: string
): DueFollowUp[] {
  const out: DueFollowUp[] = [];
  for (const [srNo, f] of latest) {
    if (!owing.has(srNo)) continue;
    if (!isValidIsoDate(f.nextFollowUp)) continue;
    if (f.nextFollowUp > todayIso) continue;
    const overdue = f.nextFollowUp < todayIso;
    out.push({ followUp: f, overdue, daysOverdue: overdue ? daysBetween(f.nextFollowUp, todayIso) : 0 });
  }
  return out.sort(
    (a, b) =>
      a.followUp.nextFollowUp.localeCompare(b.followUp.nextFollowUp) ||
      a.followUp.className.localeCompare(b.followUp.className) ||
      a.followUp.studentName.localeCompare(b.followUp.studentName)
  );
}
