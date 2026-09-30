/** Pending-fees report maths — pure, no I/O. */
import { splitIntoQuarters } from "@/lib/fees/structure";
import { compareByGradeThenName } from "@/lib/sort-by-grade";

export type PendingFilter = "q1" | "q2" | "any";

export const PENDING_FILTERS: { value: PendingFilter; label: string }[] = [
  { value: "q1", label: "Q1 pending" },
  { value: "q2", label: "Q1 or Q2 pending" },
  { value: "any", label: "All with any balance" },
];

export interface PendingFeeInput {
  srNo: string;
  studentName: string;
  className: string;
  /** Annual fee after discount (Fee details column E). */
  totalFee: number;
  totalPaid: number;
}

export interface PendingRow {
  srNo: string;
  studentName: string;
  className: string;
  totalFee: number;
  totalPaid: number;
  /** Quarters (1-4) whose cumulative due exceeds what has been paid, within the filter. */
  quartersBehind: number[];
  /** "Q1+Q2", "Q2", … */
  quartersLabel: string;
  /** Shortfall up to the filter's quarter (any = whole balance). */
  dueTillQuarter: number;
  /** Whole annual balance, never negative. */
  balance: number;
  lastPaymentDate: string;
  latestNote: string;
  nextFollowUp: string;
}

const EPS = 0.001;

function filterQuarter(filter: PendingFilter): 1 | 2 | 4 {
  return filter === "q1" ? 1 : filter === "q2" ? 2 : 4;
}

/** Cumulative amount due by the end of each quarter (index 0 = Q1). */
export function cumulativeDue(totalFee: number): [number, number, number, number] {
  const q = splitIntoQuarters(Math.max(0, totalFee));
  return [q[0], q[0] + q[1], q[0] + q[1] + q[2], q[0] + q[1] + q[2] + q[3]];
}

/**
 * Pending status of one student for a filter, or null if they don't qualify.
 * Payments fill Q1→Q4 in order, so "behind on Qn" means totalPaid < cumulative due through Qn.
 * A partly paid quarter still counts as pending.
 */
export function computePendingRow(fee: PendingFeeInput, filter: PendingFilter): PendingRow | null {
  const cum = cumulativeDue(fee.totalFee);
  const upTo = filterQuarter(filter);
  const behind: number[] = [];
  for (let i = 0; i < upTo; i++) {
    if (fee.totalPaid + EPS < cum[i]) behind.push(i + 1);
  }
  const balance = Math.max(0, fee.totalFee - fee.totalPaid);
  if (filter === "any" ? balance <= EPS : behind.length === 0) return null;

  const due = filter === "any" ? balance : Math.max(0, cum[upTo - 1] - fee.totalPaid);
  return {
    srNo: fee.srNo,
    studentName: fee.studentName,
    className: fee.className,
    totalFee: fee.totalFee,
    totalPaid: fee.totalPaid,
    quartersBehind: behind,
    quartersLabel: behind.map((n) => `Q${n}`).join("+"),
    dueTillQuarter: due,
    balance,
    lastPaymentDate: "",
    latestNote: "",
    nextFollowUp: "",
  };
}

export interface PendingReportInput {
  fees: PendingFeeInput[];
  filter: PendingFilter;
  /** srNo → last payment date (YYYY-MM-DD). */
  lastPaymentBySrNo?: ReadonlyMap<string, string>;
  /** srNo → latest follow-up. */
  latestFollowUpBySrNo?: ReadonlyMap<string, { parentSaid: string; reason: string; nextFollowUp: string }>;
}

/** Note shown in the report: what the parent said, else the reason. */
export function followUpNoteText(f: { parentSaid: string; reason: string }): string {
  const said = f.parentSaid.trim();
  const reason = f.reason.trim();
  if (said && reason) return `${said} (Reason: ${reason})`;
  return said || (reason ? `Reason: ${reason}` : "");
}

export function computePendingReport(input: PendingReportInput): PendingRow[] {
  const rows: PendingRow[] = [];
  for (const fee of input.fees) {
    const row = computePendingRow(fee, input.filter);
    if (!row) continue;
    row.lastPaymentDate = input.lastPaymentBySrNo?.get(fee.srNo) ?? "";
    const fu = input.latestFollowUpBySrNo?.get(fee.srNo);
    if (fu) {
      row.latestNote = followUpNoteText(fu);
      row.nextFollowUp = fu.nextFollowUp;
    }
    rows.push(row);
  }
  return rows.sort((a, b) => {
    const g = compareByGradeThenName(a.className, b.className, a.studentName, b.studentName);
    return g !== 0 ? g : a.srNo.localeCompare(b.srNo, "en", { numeric: true });
  });
}

export function filterByClass(rows: PendingRow[], className: string): PendingRow[] {
  return className === "all" ? rows : rows.filter((r) => r.className === className);
}

export interface ClassGroup {
  className: string;
  rows: PendingRow[];
  count: number;
  dueTotal: number;
  balanceTotal: number;
}

/** Group already-sorted rows by class (keeps row order) with per-class subtotals. */
export function groupByClass(rows: PendingRow[]): ClassGroup[] {
  const groups: ClassGroup[] = [];
  for (const r of rows) {
    let g = groups.find((x) => x.className === r.className);
    if (!g) {
      g = { className: r.className, rows: [], count: 0, dueTotal: 0, balanceTotal: 0 };
      groups.push(g);
    }
    g.rows.push(r);
    g.count += 1;
    g.dueTotal += r.dueTillQuarter;
    g.balanceTotal += r.balance;
  }
  return groups;
}

export function reportTotals(rows: PendingRow[]) {
  return {
    count: rows.length,
    dueTotal: rows.reduce((s, r) => s + r.dueTillQuarter, 0),
    balanceTotal: rows.reduce((s, r) => s + r.balance, 0),
  };
}

function csvCell(value: string | number): string {
  let s = String(value);
  // Neutralise spreadsheet formula injection in text cells.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADERS = [
  "Class",
  "Sr No",
  "Student Name",
  "Quarters Behind",
  "Due Till Selected Quarter",
  "Total Balance",
  "Last Payment",
  "Latest Follow-up Note",
  "Next Follow-up",
] as const;

/** CSV of the (already class-filtered, sorted) rows. */
export function pendingToCsv(rows: PendingRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.className,
        r.srNo,
        r.studentName,
        r.quartersLabel,
        r.dueTillQuarter,
        r.balance,
        r.lastPaymentDate,
        r.latestNote,
        r.nextFollowUp,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export function pendingCsvFilename(filter: PendingFilter, className: string, todayIso: string): string {
  const cls = className === "all" ? "all-classes" : className.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `pending-fees-${filter}-${cls}-${todayIso}.csv`;
}
