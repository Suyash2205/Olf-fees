import { CLASS_OPTIONS, resolveClass } from "@/lib/fees/structure";

/** Lowest → highest grade, unknown class, then pass out last. */
const UNKNOWN_SORT_INDEX = CLASS_OPTIONS.length;
const PASS_OUT_SORT_INDEX = CLASS_OPTIONS.length + 1;

export function isPassOutClass(className: string, studentName?: string): boolean {
  if (/pass\s*out/i.test(className.trim())) return true;
  if (studentName && /\(pass\s*out\)/i.test(studentName)) return true;
  return false;
}

/** Sort key for a class label (lower = earlier in list). */
export function classSortIndex(className: string, studentName?: string): number {
  if (isPassOutClass(className, studentName)) return PASS_OUT_SORT_INDEX;

  const cls = resolveClass(className);
  if (cls) {
    const idx = CLASS_OPTIONS.indexOf(cls);
    if (idx >= 0) return idx;
  }

  return UNKNOWN_SORT_INDEX;
}

export function compareByGradeThenName(
  classA: string,
  classB: string,
  nameA: string,
  nameB: string
): number {
  const byGrade = classSortIndex(classA, nameA) - classSortIndex(classB, nameB);
  if (byGrade !== 0) return byGrade;
  return nameA.localeCompare(nameB, "en", { sensitivity: "base" });
}

export function sortByGradeThenName<T>(
  items: T[],
  getClass: (item: T) => string,
  getName: (item: T) => string
): T[] {
  return [...items].sort((a, b) =>
    compareByGradeThenName(getClass(a), getClass(b), getName(a), getName(b))
  );
}

/** Sort class filter dropdown labels (excludes "all"). */
export function sortClassNames(classes: Iterable<string>): string[] {
  return [...classes].sort((a, b) => classSortIndex(a) - classSortIndex(b));
}

/** All active grades for charts (includes P.G. at 0; excludes Pass out). */
export function gradeChartRows(classCounts: Record<string, number>): [string, number][] {
  const rows: [string, number][] = CLASS_OPTIONS.map((cls) => [cls, classCounts[cls] ?? 0]);
  for (const [cls, count] of Object.entries(classCounts)) {
    if ((CLASS_OPTIONS as readonly string[]).includes(cls)) continue;
    if (isPassOutClass(cls)) continue;
    rows.push([cls, count]);
  }
  return rows.sort((a, b) => classSortIndex(a[0]) - classSortIndex(b[0]));
}
