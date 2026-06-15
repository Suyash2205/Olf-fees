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
import type { DailyEntry } from "@/lib/sheets/dailyLog";
import type { ExpenseEntry } from "@/lib/sheets/dailyExpense";
import type { OtherFeeEntry } from "@/lib/sheets/otherFeesLog";
import type { FeeRecord } from "@/lib/sheets/fees";
import {
  FEE_EXPENSE_PAIRS,
  expenseCategoryMatches,
  feeTypeMatches,
} from "@/lib/fee-expense-pairs";
import {
  defaultGranularityForPreset,
  type Granularity,
  type PeriodPreset,
} from "@/lib/expense-analytics";

export { defaultGranularityForPreset, type Granularity, type PeriodPreset };

export interface CategoryPairPoint {
  id: string;
  label: string;
  feesCollected: number;
  expenses: number;
  net: number;
  feeCount: number;
  expenseCount: number;
}

export interface CombinedTimelinePoint {
  key: string;
  label: string;
  schoolFees: number;
  otherFees: number;
  totalIncome: number;
  expenses: number;
  net: number;
}

export interface PortalOverviewAnalytics {
  summary: {
    schoolFeesExpected: number;
    schoolFeesCollected: number;
    schoolFeesPending: number;
    periodSchoolPayments: number;
    periodOtherFees: number;
    periodTotalIncome: number;
    periodTotalExpenses: number;
    periodNet: number;
    allTimeOtherFees: number;
    allTimeExpenses: number;
    collectionRate: number;
  };
  categoryPairs: CategoryPairPoint[];
  unpairedOtherFees: { feeType: string; amount: number; count: number }[];
  unpairedExpenses: { category: string; amount: number; count: number }[];
  combinedTimeline: CombinedTimelinePoint[];
  otherFeesByType: { feeType: string; amount: number; count: number }[];
  expensesByCategory: { category: string; amount: number; count: number }[];
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

function inPeriod(dateIso: string, preset: PeriodPreset): boolean {
  const start = periodStart(preset);
  if (!start) return true;
  const d = parseEntryDate(dateIso);
  return d >= start && d <= endOfDay(new Date());
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

function emptyTimelineBuckets(
  preset: PeriodPreset,
  granularity: Granularity,
  now = new Date()
): Map<string, CombinedTimelinePoint> {
  const map = new Map<string, CombinedTimelinePoint>();
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
        schoolFees: 0,
        otherFees: 0,
        totalIncome: 0,
        expenses: 0,
        net: 0,
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

function ensureBucket(
  map: Map<string, CombinedTimelinePoint>,
  dateIso: string,
  granularity: Granularity
) {
  const d = parseEntryDate(dateIso);
  const key = bucketKey(d, granularity);
  if (!map.has(key)) {
    map.set(key, {
      key,
      label: bucketLabel(key, granularity),
      schoolFees: 0,
      otherFees: 0,
      totalIncome: 0,
      expenses: 0,
      net: 0,
    });
  }
  return map.get(key)!;
}

export function computePortalOverview(
  fees: FeeRecord[],
  schoolPayments: DailyEntry[],
  otherFees: OtherFeeEntry[],
  expenses: ExpenseEntry[],
  granularity: Granularity,
  preset: PeriodPreset
): PortalOverviewAnalytics {
  const schoolExpected = fees.reduce((s, f) => s + f.totalFee, 0);
  const schoolCollected = fees.reduce((s, f) => s + f.totalPaid, 0);
  const schoolPending = fees.reduce((s, f) => s + f.balance, 0);

  const periodSchool = schoolPayments.filter((p) => inPeriod(p.date, preset));
  const periodOther = otherFees.filter((e) => inPeriod(e.date, preset));
  const periodExpenses = expenses.filter((e) => inPeriod(e.date, preset));

  const periodSchoolTotal = periodSchool.reduce((s, p) => s + p.amount, 0);
  const periodOtherTotal = periodOther.reduce((s, e) => s + e.amount, 0);
  const periodExpenseTotal = periodExpenses.reduce((s, e) => s + e.amount, 0);

  const pairedFeeTypes = new Set<string>();
  const pairedExpenseCats = new Set<string>();

  const categoryPairs: CategoryPairPoint[] = FEE_EXPENSE_PAIRS.map((pair) => {
    const feeRows = periodOther.filter((e) => feeTypeMatches(pair, e.feeType));
    const expRows = periodExpenses.filter((e) =>
      expenseCategoryMatches(pair, e.category)
    );
    for (const f of pair.feeTypes) pairedFeeTypes.add(f.toLowerCase());
    for (const c of pair.expenseCategories) pairedExpenseCats.add(c.toLowerCase());

    const feesCollected = feeRows.reduce((s, e) => s + e.amount, 0);
    const expAmount = expRows.reduce((s, e) => s + e.amount, 0);
    return {
      id: pair.id,
      label: pair.label,
      feesCollected,
      expenses: expAmount,
      net: feesCollected - expAmount,
      feeCount: feeRows.length,
      expenseCount: expRows.length,
    };
  });

  const otherTypeMap = new Map<string, { feeType: string; amount: number; count: number }>();
  for (const e of periodOther) {
    const row = otherTypeMap.get(e.feeType) ?? { feeType: e.feeType, amount: 0, count: 0 };
    row.amount += e.amount;
    row.count += 1;
    otherTypeMap.set(e.feeType, row);
  }

  const unpairedOtherFees = [...otherTypeMap.values()]
    .filter((r) => !pairedFeeTypes.has(r.feeType.toLowerCase()))
    .sort((a, b) => b.amount - a.amount);

  const expenseCatMap = new Map<string, { category: string; amount: number; count: number }>();
  for (const e of periodExpenses) {
    const row = expenseCatMap.get(e.category) ?? {
      category: e.category,
      amount: 0,
      count: 0,
    };
    row.amount += e.amount;
    row.count += 1;
    expenseCatMap.set(e.category, row);
  }

  const unpairedExpenses = [...expenseCatMap.values()]
    .filter((r) => !pairedExpenseCats.has(r.category.toLowerCase()))
    .sort((a, b) => b.amount - a.amount);

  const timelineMap = emptyTimelineBuckets(preset, granularity);
  for (const p of periodSchool) {
    const point = ensureBucket(timelineMap, p.date, granularity);
    point.schoolFees += p.amount;
  }
  for (const e of periodOther) {
    const point = ensureBucket(timelineMap, e.date, granularity);
    point.otherFees += e.amount;
  }
  for (const e of periodExpenses) {
    const point = ensureBucket(timelineMap, e.date, granularity);
    point.expenses += e.amount;
  }

  const combinedTimeline = [...timelineMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((p) => ({
      ...p,
      totalIncome: p.schoolFees + p.otherFees,
      net: p.schoolFees + p.otherFees - p.expenses,
    }));

  return {
    summary: {
      schoolFeesExpected: schoolExpected,
      schoolFeesCollected: schoolCollected,
      schoolFeesPending: schoolPending,
      periodSchoolPayments: periodSchoolTotal,
      periodOtherFees: periodOtherTotal,
      periodTotalIncome: periodSchoolTotal + periodOtherTotal,
      periodTotalExpenses: periodExpenseTotal,
      periodNet: periodSchoolTotal + periodOtherTotal - periodExpenseTotal,
      allTimeOtherFees: otherFees.reduce((s, e) => s + e.amount, 0),
      allTimeExpenses: expenses.reduce((s, e) => s + e.amount, 0),
      collectionRate: schoolExpected > 0 ? (schoolCollected / schoolExpected) * 100 : 0,
    },
    categoryPairs,
    unpairedOtherFees,
    unpairedExpenses,
    combinedTimeline,
    otherFeesByType: [...otherTypeMap.values()].sort((a, b) => b.amount - a.amount),
    expensesByCategory: [...expenseCatMap.values()].sort((a, b) => b.amount - a.amount),
  };
}
