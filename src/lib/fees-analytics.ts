import {
  endOfDay,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";
import { canonicalClassLabel } from "@/lib/fees/structure";
import type { DailyEntry } from "@/lib/sheets/dailyLog";
import type { FeeRecord } from "@/lib/sheets/fees";
import { gradeChartRows } from "@/lib/sort-by-grade";
import {
  categoryColor,
  defaultGranularityForPreset,
  type Granularity,
  type PeriodPreset,
} from "@/lib/expense-analytics";

export { categoryColor, defaultGranularityForPreset, type Granularity, type PeriodPreset };

export interface TimelinePoint {
  key: string;
  label: string;
  total: number;
  cash: number;
  online: number;
  count: number;
}

export interface ClassCollectionPoint {
  className: string;
  expected: number;
  collected: number;
  pending: number;
  students: number;
}

export interface QuarterPoint {
  quarter: string;
  collected: number;
}

export interface StatusPoint {
  status: string;
  count: number;
  fill: string;
}

export interface FeesAnalytics {
  summary: {
    totalExpected: number;
    totalCollected: number;
    totalPending: number;
    collectionRate: number;
    fullyPaid: number;
    hasPending: number;
    periodCollected: number;
    periodPayments: number;
    periodCash: number;
    periodOnline: number;
    studentCount: number;
  };
  timeline: TimelinePoint[];
  byClass: ClassCollectionPoint[];
  quarters: QuarterPoint[];
  statusBreakdown: StatusPoint[];
}

function parseEntryDate(iso: string): Date {
  return startOfDay(parseISO(iso));
}

function periodStart(preset: PeriodPreset, now = new Date()): Date | null {
  switch (preset) {
    case "7d":
      return startOfDay(subDays(now, 6));
    case "30d":
      return startOfDay(subDays(now, 29));
    case "90d":
      return startOfDay(subDays(now, 89));
    case "ytd":
      return startOfYear(now);
    case "all":
      return null;
  }
}

function bucketKey(date: Date, granularity: Granularity): string {
  if (granularity === "daily") return format(date, "yyyy-MM-dd");
  if (granularity === "weekly") {
    return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
  }
  return format(startOfMonth(date), "yyyy-MM");
}

function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === "monthly") {
    const [y, m] = key.split("-");
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[Number(m) - 1]} ${y}`;
  }
  const d = parseISO(key);
  if (granularity === "weekly") return `Week of ${format(d, "d MMM")}`;
  return format(d, "d MMM yyyy");
}

function filterFees(fees: FeeRecord[], classFilter: string): FeeRecord[] {
  if (!classFilter) return fees;
  return fees.filter((f) => canonicalClassLabel(f.className) === classFilter);
}

function filterPayments(
  payments: DailyEntry[],
  preset: PeriodPreset,
  classFilter: string
): DailyEntry[] {
  const start = periodStart(preset);
  const end = endOfDay(new Date());

  return payments.filter((p) => {
    if (classFilter && canonicalClassLabel(p.className) !== classFilter) return false;
    if (!start) return true;
    const d = parseEntryDate(p.date);
    return d >= start && d <= end;
  });
}

function emptyBuckets(
  preset: PeriodPreset,
  granularity: Granularity,
  now = new Date()
): Map<string, TimelinePoint> {
  const map = new Map<string, TimelinePoint>();
  const start = periodStart(preset, now);
  if (!start) return map;

  let cursor = start;
  if (granularity === "monthly") cursor = startOfMonth(cursor);
  if (granularity === "weekly") cursor = startOfWeek(cursor, { weekStartsOn: 1 });

  while (cursor <= now) {
    const key = bucketKey(cursor, granularity);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: bucketLabel(key, granularity),
        total: 0,
        cash: 0,
        online: 0,
        count: 0,
      });
    }
    if (granularity === "daily") {
      cursor = startOfDay(subDays(cursor, -1));
    } else if (granularity === "weekly") {
      cursor = startOfDay(subDays(cursor, -7));
    } else {
      const next = new Date(cursor);
      next.setMonth(next.getMonth() + 1);
      cursor = startOfMonth(next);
    }
  }
  return map;
}

export function listFeeClasses(fees: FeeRecord[]): string[] {
  const set = new Set(fees.map((f) => canonicalClassLabel(f.className)).filter(Boolean));
  return gradeChartRows(Object.fromEntries([...set].map((c) => [c, 0]))).map(([c]) => c);
}

export function computeFeesAnalytics(
  fees: FeeRecord[],
  payments: DailyEntry[],
  granularity: Granularity,
  preset: PeriodPreset,
  classFilter = ""
): FeesAnalytics {
  const filteredFees = filterFees(fees, classFilter);
  const filteredPayments = filterPayments(payments, preset, classFilter);

  const totalExpected = filteredFees.reduce((s, f) => s + f.totalFee, 0);
  const totalCollected = filteredFees.reduce((s, f) => s + f.totalPaid, 0);
  const totalPending = filteredFees.reduce((s, f) => s + f.balance, 0);
  const withFees = filteredFees.filter((f) => f.totalFee > 0);
  const fullyPaid = withFees.filter((f) => f.balance <= 0).length;
  const hasPending = withFees.filter((f) => f.balance > 0).length;

  const timelineMap = emptyBuckets(preset, granularity);
  let periodCash = 0;
  let periodOnline = 0;

  for (const p of filteredPayments) {
    const d = parseEntryDate(p.date);
    const key = bucketKey(d, granularity);
    if (!timelineMap.has(key)) {
      timelineMap.set(key, {
        key,
        label: bucketLabel(key, granularity),
        total: 0,
        cash: 0,
        online: 0,
        count: 0,
      });
    }
    const point = timelineMap.get(key)!;
    point.total += p.amount;
    point.count += 1;
    if (p.paymentMode === "online") {
      point.online += p.amount;
      periodOnline += p.amount;
    } else {
      point.cash += p.amount;
      periodCash += p.amount;
    }
  }

  const classMap = new Map<string, ClassCollectionPoint>();
  for (const f of filteredFees) {
    const cls = canonicalClassLabel(f.className) || "—";
    const row = classMap.get(cls) ?? {
      className: cls,
      expected: 0,
      collected: 0,
      pending: 0,
      students: 0,
    };
    row.expected += f.totalFee;
    row.collected += f.totalPaid;
    row.pending += f.balance;
    row.students += 1;
    classMap.set(cls, row);
  }

  const classCounts = Object.fromEntries(
    [...classMap.entries()].map(([c, r]) => [c, r.collected])
  );
  const byClass = gradeChartRows(classCounts)
    .map(([cls]) => classMap.get(cls)!)
    .filter(Boolean);

  const quarters: QuarterPoint[] = [
    { quarter: "Q1", collected: filteredFees.reduce((s, f) => s + f.q1Paid, 0) },
    { quarter: "Q2", collected: filteredFees.reduce((s, f) => s + f.q2Paid, 0) },
    { quarter: "Q3", collected: filteredFees.reduce((s, f) => s + f.q3Paid, 0) },
    { quarter: "Q4", collected: filteredFees.reduce((s, f) => s + f.q4Paid, 0) },
  ];

  const noFeeSet = filteredFees.filter((f) => f.totalFee <= 0).length;
  const partial = withFees.filter((f) => f.totalPaid > 0 && f.balance > 0).length;
  const notStarted = withFees.filter((f) => f.totalPaid <= 0).length;

  const statusBreakdown: StatusPoint[] = [
    { status: "Fully paid", count: fullyPaid, fill: "#10b981" },
    { status: "Partial", count: partial, fill: "#f59e0b" },
    { status: "Not started", count: notStarted, fill: "#ef4444" },
  ];
  if (noFeeSet > 0) {
    statusBreakdown.push({ status: "No fee set", count: noFeeSet, fill: "#94a3b8" });
  }

  const periodCollected = filteredPayments.reduce((s, p) => s + p.amount, 0);
  const timeline = [...timelineMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  return {
    summary: {
      totalExpected,
      totalCollected,
      totalPending,
      collectionRate: totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0,
      fullyPaid,
      hasPending,
      periodCollected,
      periodPayments: filteredPayments.length,
      periodCash,
      periodOnline,
      studentCount: filteredFees.length,
    },
    timeline,
    byClass,
    quarters,
    statusBreakdown: statusBreakdown.filter((s) => s.count > 0),
  };
}
