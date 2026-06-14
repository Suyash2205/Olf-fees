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
import type { ExpenseEntry } from "@/lib/sheets/dailyExpense";

export type Granularity = "daily" | "weekly" | "monthly";
export type PeriodPreset = "7d" | "30d" | "90d" | "ytd" | "all";

export interface TimelinePoint {
  key: string;
  label: string;
  total: number;
  cash: number;
  online: number;
  count: number;
}

export interface CategoryPoint {
  category: string;
  amount: number;
  count: number;
}

export interface ExpenseAnalytics {
  summary: {
    total: number;
    count: number;
    avgPerPeriod: number;
    cash: number;
    online: number;
    topCategory: string;
    topCategoryAmount: number;
  };
  timeline: TimelinePoint[];
  byCategory: CategoryPoint[];
}

const CATEGORY_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#6366f1",
  "#f97316",
];

export function categoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
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
  if (granularity === "weekly") {
    return `Week of ${format(d, "d MMM")}`;
  }
  return format(d, "d MMM yyyy");
}

function filterEntries(
  entries: ExpenseEntry[],
  preset: PeriodPreset,
  categoryFilter: string
): ExpenseEntry[] {
  const start = periodStart(preset);
  const end = endOfDay(new Date());

  return entries.filter((e) => {
    if (categoryFilter && e.category !== categoryFilter) return false;
    if (!start) return true;
    const d = parseEntryDate(e.date);
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

export function computeExpenseAnalytics(
  entries: ExpenseEntry[],
  granularity: Granularity,
  preset: PeriodPreset,
  categoryFilter = ""
): ExpenseAnalytics {
  const filtered = filterEntries(entries, preset, categoryFilter);
  const timelineMap = emptyBuckets(preset, granularity);

  const categoryMap = new Map<string, CategoryPoint>();
  let cash = 0;
  let online = 0;

  for (const e of filtered) {
    const d = parseEntryDate(e.date);
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
    point.total += e.amount;
    point.count += 1;
    if (e.paymentMode === "online") {
      point.online += e.amount;
      online += e.amount;
    } else {
      point.cash += e.amount;
      cash += e.amount;
    }

    const cat = categoryMap.get(e.category) ?? {
      category: e.category,
      amount: 0,
      count: 0,
    };
    cat.amount += e.amount;
    cat.count += 1;
    categoryMap.set(e.category, cat);
  }

  const timeline = [...timelineMap.values()].sort((a, b) =>
    a.key.localeCompare(b.key)
  );
  const byCategory = [...categoryMap.values()].sort((a, b) => b.amount - a.amount);
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const top = byCategory[0];

  return {
    summary: {
      total,
      count: filtered.length,
      avgPerPeriod: timeline.length > 0 ? total / timeline.length : 0,
      cash,
      online,
      topCategory: top?.category ?? "—",
      topCategoryAmount: top?.amount ?? 0,
    },
    timeline,
    byCategory,
  };
}

export function defaultGranularityForPreset(preset: PeriodPreset): Granularity {
  if (preset === "7d" || preset === "30d") return "daily";
  if (preset === "90d") return "weekly";
  return "monthly";
}
