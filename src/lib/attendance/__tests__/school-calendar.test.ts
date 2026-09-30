import { describe, expect, it } from "vitest";
import {
  dayStatus,
  expandDateRange,
  filterToSchoolDays,
  isSchoolDay,
  isSchoolDayForAnyClass,
  lastNSchoolDays,
  nonSchoolDayMessage,
  parseCalendarRows,
  parseDateCell,
  schoolDaysBetween,
  validateCalendarInput,
  type CalendarEntry,
} from "../school-calendar";

// 2026-09-28 is a Monday.
const MON = "2026-09-28";
const FRI = "2026-10-02";
const SAT = "2026-10-03";
const SUN = "2026-10-04";
const NEXT_MON = "2026-10-05";

const hol = (d: string, classes: CalendarEntry["classes"] = "All", title = "Holiday", end = d): CalendarEntry => ({
  startDate: d, endDate: end, type: "Holiday", classes, title,
});
const work = (d: string, classes: CalendarEntry["classes"] = "All", title = "Working", end = d): CalendarEntry => ({
  startDate: d, endDate: end, type: "Working day", classes, title,
});

describe("default rule (Mon-Sat school, Sunday off)", () => {
  it("Mon-Sat are school days by default, Sunday is not", () => {
    expect(isSchoolDay(MON, "5th Std", [])).toBe(true);
    expect(isSchoolDay(FRI, "5th Std", [])).toBe(true);
    expect(isSchoolDay(SAT, "5th Std", [])).toBe(true);
    expect(isSchoolDay(SUN, "5th Std", [])).toBe(false);
  });
  it("reports Sunday as the reason", () => {
    expect(dayStatus(SUN, "5th Std", [])).toMatchObject({ isSchoolDay: false, source: "default", title: "Sunday" });
    expect(dayStatus(SAT, "5th Std", [])).toMatchObject({ isSchoolDay: true, source: "default" });
  });
});

describe("Saturday and Sunday overrides", () => {
  it("a Holiday entry closes a Saturday for all classes", () => {
    const e = [hol(SAT, "All", "Diwali")];
    expect(isSchoolDay(SAT, "5th Std", e)).toBe(false);
    expect(isSchoolDay(SAT, "10th Std", e)).toBe(false);
    expect(isSchoolDay("2026-10-10", "5th Std", e)).toBe(true); // next Saturday unaffected
  });
  it("a class-specific Saturday Holiday closes only that class", () => {
    const e = [hol(SAT, ["5th Std"], "Sports")];
    expect(isSchoolDay(SAT, "5th Std", e)).toBe(false);
    expect(isSchoolDay(SAT, "6th Std", e)).toBe(true);
  });
  it("a class-specific Saturday Holiday beats an All Working day", () => {
    const e = [work(SAT, "All"), hol(SAT, ["5th Std"])];
    expect(isSchoolDay(SAT, "5th Std", e)).toBe(false);
    expect(isSchoolDay(SAT, "6th Std", e)).toBe(true);
  });
  it("a Working-day entry opens a Sunday, that Sunday only", () => {
    const e = [work(SUN, "All", "Makeup")];
    expect(isSchoolDay(SUN, "5th Std", e)).toBe(true);
    expect(isSchoolDay("2026-10-11", "5th Std", e)).toBe(false);
  });
  it("a class-specific Working Sunday opens only that class", () => {
    const e = [work(SUN, ["10th Std"])];
    expect(isSchoolDay(SUN, "10th Std", e)).toBe(true);
    expect(isSchoolDay(SUN, "9th Std", e)).toBe(false);
  });
});

describe("entries override the default", () => {
  it("a Holiday closes a weekday", () => {
    expect(isSchoolDay(MON, "5th Std", [hol(MON, "All", "Gandhi Jayanti")])).toBe(false);
  });
  it("a Working day on an ordinary weekday changes nothing", () => {
    expect(isSchoolDay(MON, "5th Std", [work(MON)])).toBe(true);
  });
  it("ranges cover every day inclusive", () => {
    const e = [hol("2026-10-05", "All", "Break", "2026-10-09")];
    expect(["2026-10-05", "2026-10-07", "2026-10-09"].map((d) => isSchoolDay(d, "1st Std", e))).toEqual([false, false, false]);
    expect(isSchoolDay("2026-10-04", "1st Std", e)).toBe(false); // Sunday, default
    expect(isSchoolDay("2026-10-10", "1st Std", e)).toBe(true); // Saturday after the range
    expect(isSchoolDay("2026-10-12", "1st Std", e)).toBe(true);
  });
  it("a Holiday range spanning Sat+Sun+Mon closes the Saturday and Monday, Sunday stays closed", () => {
    const e = [hol("2026-10-03", "All", "Break", "2026-10-05")];
    expect([SAT, SUN, NEXT_MON, "2026-10-06"].map((d) => isSchoolDay(d, "1st Std", e))).toEqual([false, false, false, true]);
  });
  it("a Working range over Sat+Sun opens both", () => {
    const e = [work("2026-10-03", "All", "Makeup", "2026-10-04")];
    expect([SAT, SUN, NEXT_MON].map((d) => isSchoolDay(d, "1st Std", e))).toEqual([true, true, true]);
  });
});

describe("class-specific vs All", () => {
  it("a class-specific holiday closes only that class", () => {
    const e = [hol(MON, ["5th Std"], "Sports day")];
    expect(isSchoolDay(MON, "5th Std", e)).toBe(false);
    expect(isSchoolDay(MON, "6th Std", e)).toBe(true);
  });
  it("class-specific Working day beats an All holiday", () => {
    const e = [hol(MON, "All", "Closed"), work(MON, ["10th Std"], "Board revision")];
    expect(isSchoolDay(MON, "10th Std", e)).toBe(true);
    expect(isSchoolDay(MON, "9th Std", e)).toBe(false);
  });
  it("class-specific holiday beats an All working day", () => {
    const e = [work(SAT, "All"), hol(SAT, ["3rd Std"], "Trip")];
    expect(isSchoolDay(SAT, "3rd Std", e)).toBe(false);
    expect(isSchoolDay(SAT, "4th Std", e)).toBe(true);
  });
  it("specificity wins regardless of sheet order", () => {
    const a = [hol(MON, ["3rd Std"]), work(MON, "All")];
    const b = [work(MON, "All"), hol(MON, ["3rd Std"])];
    expect(isSchoolDay(MON, "3rd Std", a)).toBe(false);
    expect(isSchoolDay(MON, "3rd Std", b)).toBe(false);
  });
  it("same specificity: the later entry wins", () => {
    expect(isSchoolDay(MON, "3rd Std", [hol(MON), work(MON)])).toBe(true);
    expect(isSchoolDay(MON, "3rd Std", [work(MON), hol(MON)])).toBe(false);
  });
  it("matches class aliases via canonical labels", () => {
    expect(isSchoolDay(MON, "PG", [hol(MON, ["P.G."])])).toBe(false);
    expect(isSchoolDay(MON, "1st", [hol(MON, ["1st Std"])])).toBe(false);
  });
});

describe("isSchoolDayForAnyClass", () => {
  it("true when at least one class has school", () => {
    const e = [hol(MON, ["5th Std"])];
    expect(isSchoolDayForAnyClass(MON, ["5th Std", "6th Std"], e)).toBe(true);
  });
  it("false when every class is closed", () => {
    expect(isSchoolDayForAnyClass(MON, ["5th Std", "6th Std"], [hol(MON)])).toBe(false);
    expect(isSchoolDayForAnyClass(SUN, ["5th Std"], [])).toBe(false);
    expect(isSchoolDayForAnyClass(SAT, ["5th Std", "6th Std"], [hol(SAT)])).toBe(false);
  });
  it("Saturday is open by default", () => {
    expect(isSchoolDayForAnyClass(SAT, ["5th Std"], [])).toBe(true);
  });
  it("Sunday is open if just one class works", () => {
    expect(isSchoolDayForAnyClass(SUN, ["5th Std", "10th Std"], [work(SUN, ["10th Std"])])).toBe(true);
  });
});

describe("schoolDaysBetween / lastNSchoolDays", () => {
  it("skips Sundays and holidays but counts Saturdays", () => {
    const e = [hol("2026-09-30")];
    expect(schoolDaysBetween("5th Std", MON, NEXT_MON, e)).toEqual([
      "2026-09-28", "2026-09-29", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05",
    ]);
  });
  it("a Saturday Holiday drops out of the count", () => {
    expect(schoolDaysBetween("5th Std", FRI, NEXT_MON, [hol(SAT)])).toEqual([FRI, NEXT_MON]);
  });
  it("a working Sunday is counted", () => {
    expect(schoolDaysBetween("5th Std", SAT, NEXT_MON, [work(SUN)])).toEqual([SAT, SUN, NEXT_MON]);
  });
  it("empty for an inverted range", () => {
    expect(schoolDaysBetween("5th Std", NEXT_MON, MON, [])).toEqual([]);
  });
  it("lastN goes newest first, counts Saturdays and skips Sundays", () => {
    expect(lastNSchoolDays("5th Std", NEXT_MON, 3, [])).toEqual(["2026-10-05", "2026-10-03", "2026-10-02"]);
  });
  it("lastN includes the end day itself, and skips it when it is a holiday", () => {
    expect(lastNSchoolDays("5th Std", MON, 1, [])).toEqual([MON]);
    expect(lastNSchoolDays("5th Std", MON, 1, [hol(MON)])).toEqual(["2026-09-26"]); // Saturday before
  });
  it("lastN skips a Saturday Holiday", () => {
    expect(lastNSchoolDays("5th Std", NEXT_MON, 2, [hol(SAT)])).toEqual(["2026-10-05", "2026-10-02"]);
  });
  it("lastN honours a working Sunday", () => {
    expect(lastNSchoolDays("5th Std", NEXT_MON, 2, [work(SUN)])).toEqual(["2026-10-05", "2026-10-04"]);
  });
  it("lastN returns fewer when the lookback cap is hit and never loops forever", () => {
    const forever = [hol("2020-01-01", "All", "x", "2030-12-31")];
    expect(lastNSchoolDays("5th Std", MON, 5, forever, 30)).toEqual([]);
  });
  it("n <= 0 or bad date gives empty", () => {
    expect(lastNSchoolDays("5th Std", MON, 0, [])).toEqual([]);
    expect(lastNSchoolDays("5th Std", "nope", 3, [])).toEqual([]);
  });
});

describe("expandDateRange", () => {
  it("expands inclusive, handles single day and invalid", () => {
    expect(expandDateRange("2026-10-01", "2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(expandDateRange("2026-10-01", "2026-10-01")).toEqual(["2026-10-01"]);
    expect(expandDateRange("2026-10-03", "2026-10-01")).toEqual([]);
    expect(expandDateRange("2026-02-30", "2026-03-02")).toEqual([]);
  });
  it("crosses month and year ends", () => {
    expect(expandDateRange("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("nonSchoolDayMessage", () => {
  it("names the date, class and title", () => {
    expect(nonSchoolDayMessage(MON, "5th Std", [hol(MON, "All", "Gandhi Jayanti")])).toBe(
      "2026-09-28 is a holiday for 5th Std: Gandhi Jayanti"
    );
  });
  it("uses Sunday for the default rule", () => {
    expect(nonSchoolDayMessage(SUN, "PG", [])).toBe("2026-10-04 is a holiday for P.G.: Sunday");
  });
  it("Saturday is open by default (null)", () => {
    expect(nonSchoolDayMessage(SAT, "PG", [])).toBeNull();
  });
  it("null on a school day", () => {
    expect(nonSchoolDayMessage(MON, "5th Std", [])).toBeNull();
  });
});

describe("parseCalendarRows / parseDateCell", () => {
  it("parses a single date, a range and DD/MM/YYYY", () => {
    expect(parseDateCell("2026-10-20")).toEqual({ startDate: "2026-10-20", endDate: "2026-10-20" });
    expect(parseDateCell("2026-10-20 to 2026-10-25")).toEqual({ startDate: "2026-10-20", endDate: "2026-10-25" });
    expect(parseDateCell("20/10/2026")).toEqual({ startDate: "2026-10-20", endDate: "2026-10-20" });
  });
  it("rejects garbage and inverted ranges", () => {
    expect(parseDateCell("someday")).toBeNull();
    expect(parseDateCell("2026-10-25 to 2026-10-20")).toBeNull();
    expect(parseDateCell("2026-02-30")).toBeNull();
  });
  it("drops Cancelled rows, reports malformed rows, canonicalises classes", () => {
    const r = parseCalendarRows([
      { Date: "2026-10-20", Type: "Holiday", Classes: "All", Title: "Diwali" },
      { Date: "2026-10-21", Type: "holiday", Classes: "PG, 1st", Title: "Small" },
      { Date: "2026-10-22", Type: "Cancelled", Classes: "All", Title: "x [was Holiday]" },
      { Date: "bad", Type: "Holiday", Classes: "All", Title: "y" },
      { Date: "2026-10-23", Type: "Party", Classes: "All", Title: "z" },
      { Date: "2026-10-24", Type: "Working day", Classes: "", Title: "blank classes = All" },
    ]);
    expect(r.entries.map((e) => e.title)).toEqual(["Diwali", "Small", "blank classes = All"]);
    expect(r.entries[1].classes).toEqual(["P.G.", "1st Std"]);
    expect(r.entries[2].classes).toBe("All");
    expect(r.skipped.map((s) => s.reason)).toEqual(["cancelled", "invalid date", "invalid type"]);
  });
});

describe("validateCalendarInput", () => {
  const ok = { startDate: "2026-10-20", type: "Holiday", classes: "All" as const, title: "Diwali" };
  it("accepts a good single-day entry and defaults end to start", () => {
    expect(validateCalendarInput(ok)).toEqual({
      ok: true,
      value: { startDate: "2026-10-20", endDate: "2026-10-20", type: "Holiday", classes: "All", title: "Diwali" },
    });
  });
  it("resolves class aliases and dedupes", () => {
    const r = validateCalendarInput({ ...ok, classes: ["PG", "P.G.", "3rd"] });
    expect(r.ok && r.value.classes).toEqual(["P.G.", "3rd Std"]);
  });
  it.each([
    [{ ...ok, startDate: "" }, /Start date/],
    [{ ...ok, startDate: "2026-13-01" }, /Start date/],
    [{ ...ok, endDate: "2026-10-19" }, /before/],
    [{ ...ok, endDate: "2027-06-01" }, /at most/],
    [{ ...ok, type: "Party" }, /Type/],
    [{ ...ok, title: "  " }, /title/i],
    [{ ...ok, title: "x".repeat(121) }, /120/],
    [{ ...ok, classes: [] as string[] }, /at least one class/],
    [{ ...ok, classes: ["11th Std"] }, /Unknown class/],
  ])("rejects %#", (input, msg) => {
    const r = validateCalendarInput(input);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(msg);
  });
});

describe("filterToSchoolDays", () => {
  it("drops rows on non-school days for their own class only", () => {
    const rows = [
      { date: MON, className: "5th Std", id: 1 },
      { date: MON, className: "6th Std", id: 2 },
    ];
    expect(filterToSchoolDays(rows, [hol(MON, ["5th Std"])]).map((r) => r.id)).toEqual([2]);
  });
  it("keeps Saturday rows and drops Sunday rows", () => {
    const rows = [
      { date: SAT, className: "5th Std", id: 1 },
      { date: SUN, className: "5th Std", id: 2 },
    ];
    expect(filterToSchoolDays(rows, []).map((r) => r.id)).toEqual([1]);
  });
  it("drops a Saturday with a Holiday and keeps a Sunday with a Working day", () => {
    const rows = [
      { date: SAT, className: "5th Std", id: 1 },
      { date: SUN, className: "5th Std", id: 2 },
    ];
    expect(filterToSchoolDays(rows, [hol(SAT), work(SUN)]).map((r) => r.id)).toEqual([2]);
  });
});
