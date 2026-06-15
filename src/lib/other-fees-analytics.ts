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
import type { OtherFeeEntry } from "@/lib/sheets/otherFeesLog";
import {
  categoryColor,
  defaultGranularityForPreset,
  type Granularity,
  type PeriodPreset,
} from "@/lib/expense-analytics";

export { categoryColor, defaultGranularityForPreset, type Granularity, type PeriodPreset };

export interface FeeTypePoint {
  feeType: string;
  amount: number;
  count: number;
}

export interface OtherFeesTimelinePoint {
  key: string;
  label: string;
  total: number;
  cash: number;
  online: number;
  count: number;
}

export interface OtherFeesAnalytics {
  summary: {
    total: number;
    count: number;
    cash: number;
    online: number;
    topFeeType: string;
    topFeeTypeAmount: number;
    uniqueStudents: number;
  };
  timeline: OtherFeesTimelinePoint[];
  byFeeType: FeeTypePoint[];
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

function filterEntries(
  entries: OtherFeeEntry[],
  preset: PeriodPreset,
  feeTypeFilter: string
): OtherFeeEntry[] {
  const start = periodStart(preset);
  const end = endOfDay(new Date());
  return entries.filter((e) => {
    if (feeTypeFilter && e.feeType !== feeTypeFilter) return false;
    if (!start) return true;
    const d = parseEntryDate(e.date);
    return d >= start && d <= end;
  });
}

function emptyBuckets(
  preset: PeriodPreset,
  granularity: Granularity,
  now = new Date()
): Map<string, OtherFeesTimelinePoint> {
  const map = new Map<string, OtherFeesTimelinePoint>();
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

export function listOtherFeeTypes(entries: OtherFeeEntry[]): string[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.feeType, (map.get(e.feeType) ?? 0) + e.amount);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export function computeOtherFeesAnalytics(
  entries: OtherFeeEntry[],
  granularity: Granularity,
  preset: PeriodPreset,
  feeTypeFilter = ""
): OtherFeesAnalytics {
  const filtered = filterEntries(entries, preset, feeTypeFilter);
  const timelineMap = emptyBuckets(preset, granularity);
  const typeMap = new Map<string, FeeTypePoint>();
  const students = new Set<string>();
  let cash = 0;
  let online = 0;

  for (const e of filtered) {
    students.add(e.srNo);
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

    const row = typeMap.get(e.feeType) ?? { feeType: e.feeType, amount: 0, count: 0 };
    row.amount += e.amount;
    row.count += 1;
    typeMap.set(e.feeType, row);
  }

  const byFeeType = [...typeMap.values()].sort((a, b) => b.amount - a.amount);
  const top = byFeeType[0];
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  return {
    summary: {
      total,
      count: filtered.length,
      cash,
      online,
      topFeeType: top?.feeType ?? "—",
      topFeeTypeAmount: top?.amount ?? 0,
      uniqueStudents: students.size,
    },
    timeline: [...timelineMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byFeeType,
  };
}
