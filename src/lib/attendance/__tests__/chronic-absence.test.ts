import { describe, expect, it } from "vitest";
import { anyMarkedOn, computeChronicAbsence } from "../chronic-absence";
import type { CalendarEntry } from "../school-calendar";
import type { AttendanceRow } from "../types";

// Weekday school days ending Friday 2026-10-02, newest first.
const DAYS = [
  "2026-10-02", "2026-10-01", "2026-09-30", "2026-09-29", "2026-09-28",
  "2026-09-25", "2026-09-24", "2026-09-23", "2026-09-22", "2026-09-21",
  "2026-09-18", "2026-09-17",
];
const TODAY = DAYS[0];

const mk = (className: string, srNo: string, name: string, date: string, present: boolean): AttendanceRow => ({
  rowId: `${className}-${srNo}-${date}`, date, studentName: name, srNo,
  status: present ? "present" : "absent",
  teacherEmail: "", teacherName: "", submittedAt: "", className,
});

/** pattern: newest-first array of booleans (true = present) over DAYS. */
function rowsFor(className: string, srNo: string, name: string, pattern: boolean[]): AttendanceRow[] {
  return pattern.map((p, i) => mk(className, srNo, name, DAYS[i], p));
}

const roster = (list: [string, string, string][]) =>
  list.map(([srNo, studentName, className]) => ({ srNo, studentName, className }));

const run = (rows: AttendanceRow[], r: ReturnType<typeof roster>, entries: CalendarEntry[] = [], today = TODAY) =>
  computeChronicAbsence({ rows, roster: r, entries, todayIso: today });

const A = false;
const P = true;

describe("3 in a row", () => {
  it("flags absent on the 3 most recent marked days", () => {
    const rows = [...rowsFor("5th Std", "1", "Asha", [A, A, A, P, P, P, P, P, P, P])];
    const r = run(rows, roster([["1", "Asha", "5th Std"]]));
    expect(r.flagged).toHaveLength(1);
    expect(r.flagged[0]).toMatchObject({ streak: true, absentCount: 3, windowDays: 10, absentEveryDay: false });
    expect(r.flagged[0].reasons).toEqual(["3 days in a row"]);
    expect(r.flagged[0].lastPresentDate).toBe(DAYS[3]);
  });
  it("does not flag 2 in a row", () => {
    const rows = rowsFor("5th Std", "1", "Asha", [A, A, P, P, P, P, P, P, P, P]);
    expect(run(rows, roster([["1", "Asha", "5th Std"]])).flagged).toHaveLength(0);
  });
  it("a streak that is not the most recent 3 does not count", () => {
    const rows = rowsFor("5th Std", "1", "Asha", [P, A, A, A, P, P, P, P, P, P]);
    expect(run(rows, roster([["1", "Asha", "5th Std"]])).flagged).toHaveLength(0);
  });
  it("3 in a row works with only 3 marked days", () => {
    const rows = rowsFor("5th Std", "1", "Asha", [A, A, A]);
    const r = run(rows, roster([["1", "Asha", "5th Std"]]));
    expect(r.flagged[0].reasons).toEqual(["3 days in a row"]);
    expect(r.absentEveryDay).toHaveLength(0); // window < 5
  });
});

describe("4 of 10", () => {
  it("flags 4 absences scattered in the window", () => {
    const rows = rowsFor("5th Std", "1", "Asha", [P, A, P, A, P, A, P, A, P, P]);
    const r = run(rows, roster([["1", "Asha", "5th Std"]]));
    expect(r.flagged[0]).toMatchObject({ streak: false, absentCount: 4, windowDays: 10 });
    expect(r.flagged[0].reasons).toEqual(["4 of last 10 school days"]);
  });
  it("3 scattered absences are not enough", () => {
    const rows = rowsFor("5th Std", "1", "Asha", [P, A, P, A, P, A, P, P, P, P]);
    expect(run(rows, roster([["1", "Asha", "5th Std"]])).flagged).toHaveLength(0);
  });
  it("an absence older than the 10-day window is ignored", () => {
    const rows = rowsFor("5th Std", "1", "Asha", [P, A, P, A, P, A, P, P, P, P, A, A]);
    expect(run(rows, roster([["1", "Asha", "5th Std"]])).flagged).toHaveLength(0);
  });
  it("fewer than 10 marked days: 4 of 6 flags with the real denominator", () => {
    const rows = rowsFor("5th Std", "1", "Asha", [P, A, A, P, A, A]);
    const r = run(rows, roster([["1", "Asha", "5th Std"]]));
    expect(r.flagged[0].reasons).toEqual(["4 of last 6 school days"]);
  });
  it("both reasons can apply", () => {
    const rows = rowsFor("5th Std", "1", "Asha", [A, A, A, P, A, P, P, P, P, P]);
    const r = run(rows, roster([["1", "Asha", "5th Std"]]));
    expect(r.flagged[0].reasons).toEqual(["3 days in a row", "4 of last 10 school days"]);
  });
});

describe("unmarked days and holidays", () => {
  it("days the class was not marked are skipped, not counted absent", () => {
    // Class marked only on 4 of the days: student absent on those 3 most recent MARKED days -> streak.
    const rows = [
      mk("5th Std", "1", "Asha", DAYS[0], false),
      mk("5th Std", "1", "Asha", DAYS[3], false),
      mk("5th Std", "1", "Asha", DAYS[6], false),
      mk("5th Std", "1", "Asha", DAYS[9], true),
    ];
    const r = run(rows, roster([["1", "Asha", "5th Std"]]));
    expect(r.flagged[0]).toMatchObject({ streak: true, windowDays: 4, absentCount: 3 });
  });
  it("unmarked days do not create a streak that is not there", () => {
    const rows = [mk("5th Std", "1", "Asha", DAYS[0], false), mk("5th Std", "1", "Asha", DAYS[5], true)];
    expect(run(rows, roster([["1", "Asha", "5th Std"]])).flagged).toHaveLength(0);
  });
  it("holidays are excluded from the window even when marked", () => {
    const rows = rowsFor("5th Std", "1", "Asha", [A, A, A, A, P, P, P, P, P, P]);
    const hols: CalendarEntry[] = [{ startDate: DAYS[1], endDate: DAYS[1], type: "Holiday", classes: "All", title: "H" }];
    // 10-02 A, (10-01 holiday, skipped), 09-30 A, 09-29 A -> the 3 most recent school days are all absent
    expect(run(rows, roster([["1", "Asha", "5th Std"]]), hols).flagged).toHaveLength(1);
    // Making the middle day a holiday removes it, and the holiday day's absence no longer counts
    const rows2 = rowsFor("5th Std", "1", "Asha", [A, A, P, P, P, P, P, P, P, P]);
    // 10-02 A, (10-01 A but holiday), 09-30 P ... -> only 1 absence in window
    expect(run(rows2, roster([["1", "Asha", "5th Std"]]), hols).flagged).toHaveLength(0);
  });
  it("marks on a Sunday are ignored by default", () => {
    const rows = [
      ...rowsFor("5th Std", "1", "Asha", [P, P, P]),
      mk("5th Std", "1", "Asha", "2026-10-04", false), // Sunday
      mk("5th Std", "1", "Asha", "2026-10-11", false), // Sunday
    ];
    expect(run(rows, roster([["1", "Asha", "5th Std"]]), [], "2026-10-11").flagged).toHaveLength(0);
  });
  it("a Saturday is part of the window by default", () => {
    const rows = [
      mk("5th Std", "1", "Asha", "2026-10-03", false), // Saturday
      mk("5th Std", "1", "Asha", DAYS[0], false),
      mk("5th Std", "1", "Asha", DAYS[1], false),
    ];
    const r = run(rows, roster([["1", "Asha", "5th Std"]]), [], "2026-10-03");
    expect(r.flagged).toHaveLength(1);
    expect(r.flagged[0].windowDays).toBe(3);
  });
  it("a Saturday Holiday is excluded from the window", () => {
    const sat: CalendarEntry = { startDate: "2026-10-03", endDate: "2026-10-03", type: "Holiday", classes: "All", title: "H" };
    const rows = [
      mk("5th Std", "1", "Asha", "2026-10-03", false),
      mk("5th Std", "1", "Asha", DAYS[0], false),
      mk("5th Std", "1", "Asha", DAYS[1], false),
    ];
    expect(run(rows, roster([["1", "Asha", "5th Std"]]), [sat], "2026-10-03").flagged).toHaveLength(0); // only 2 school days marked
  });
  it("a working Sunday is part of the window", () => {
    const sun: CalendarEntry = { startDate: "2026-10-04", endDate: "2026-10-04", type: "Working day", classes: "All", title: "W" };
    const rows = [
      mk("5th Std", "1", "Asha", "2026-10-04", false),
      mk("5th Std", "1", "Asha", DAYS[0], false),
      mk("5th Std", "1", "Asha", DAYS[1], false),
    ];
    expect(run(rows, roster([["1", "Asha", "5th Std"]]), [sun], "2026-10-04").flagged).toHaveLength(1);
  });
  it("marks after today are ignored", () => {
    const rows = [mk("5th Std", "1", "Asha", "2026-10-05", false), ...rowsFor("5th Std", "1", "Asha", [P, P, P])];
    expect(run(rows, roster([["1", "Asha", "5th Std"]])).flagged).toHaveLength(0);
  });
  it("a class with no marks at all yields nothing", () => {
    expect(run([], roster([["1", "Asha", "5th Std"]])).flagged).toEqual([]);
  });
  it("a class-specific holiday only affects that class", () => {
    const hol: CalendarEntry[] = [{ startDate: DAYS[0], endDate: DAYS[0], type: "Holiday", classes: ["5th Std"], title: "H" }];
    const rows = [
      ...rowsFor("5th Std", "1", "Asha", [A, A, A, P, P]),
      ...rowsFor("6th Std", "2", "Ravi", [A, A, A, P, P]),
    ];
    const r = run(rows, roster([["1", "Asha", "5th Std"], ["2", "Ravi", "6th Std"]]), hol);
    // 5th: 10-02 is a holiday, so its 3 most recent are 10-01(A), 09-30(A), 09-29(P) -> not a streak
    expect(r.flagged.map((f) => f.srNo)).toEqual(["2"]);
  });
});

describe("absent every day", () => {
  it("needs at least 5 marked days in the window", () => {
    const four = rowsFor("5th Std", "1", "Asha", [A, A, A, A]);
    expect(run(four, roster([["1", "Asha", "5th Std"]])).absentEveryDay).toHaveLength(0);
    const five = rowsFor("5th Std", "1", "Asha", [A, A, A, A, A]);
    const r = run(five, roster([["1", "Asha", "5th Std"]]));
    expect(r.absentEveryDay.map((f) => f.srNo)).toEqual(["1"]);
    expect(r.flagged).toHaveLength(1);
    expect(r.flagged[0].lastPresentDate).toBeNull();
  });
  it("one present day breaks it", () => {
    const rows = rowsFor("5th Std", "1", "Asha", [A, A, A, A, P, A, A, A, A, A]);
    const r = run(rows, roster([["1", "Asha", "5th Std"]]));
    expect(r.absentEveryDay).toHaveLength(0);
    expect(r.flagged).toHaveLength(1);
  });
  it("absent-every-day students are excluded from byClass but counted in countsByClass", () => {
    const rows = [
      ...rowsFor("5th Std", "1", "Asha", [A, A, A, A, A, A]),
      ...rowsFor("5th Std", "2", "Ben", [A, A, A, P, P, P]),
    ];
    const r = run(rows, roster([["1", "Asha", "5th Std"], ["2", "Ben", "5th Std"]]));
    expect(r.absentEveryDay.map((f) => f.srNo)).toEqual(["1"]);
    expect(r.byClass).toEqual([{ className: "5th Std", students: [expect.objectContaining({ srNo: "2" })] }]);
    expect(r.countsByClass).toEqual([{ className: "5th Std", count: 2 }]);
  });
});

describe("roster and identity", () => {
  it("students not on the (active) roster are ignored", () => {
    const rows = rowsFor("5th Std", "9", "Departed", [A, A, A, A, A]);
    expect(run(rows, roster([["1", "Asha", "5th Std"]])).flagged).toEqual([]);
  });
  it("duplicate names stay distinct by Sr No", () => {
    const rows = [
      ...rowsFor("5th Std", "10", "Same Name", [A, A, A, P, P]),
      ...rowsFor("5th Std", "11", "Same Name", [P, P, P, P, P]),
    ];
    const r = run(rows, roster([["10", "Same Name", "5th Std"], ["11", "Same Name", "5th Std"]]));
    expect(r.flagged.map((f) => f.srNo)).toEqual(["10"]);
  });
  it("a student with no row on a marked day (joined later) is not counted absent for that day", () => {
    const rows = [
      ...rowsFor("5th Std", "1", "Old", [P, P, P, P, P, P]),
      mk("5th Std", "2", "New", DAYS[0], false),
      mk("5th Std", "2", "New", DAYS[1], false),
    ];
    const r = run(rows, roster([["1", "Old", "5th Std"], ["2", "New", "5th Std"]]));
    expect(r.flagged).toEqual([]); // only 2 marks -> below the 3-streak threshold
  });
  it("class labels are canonicalised on both sides", () => {
    const rows = rowsFor("PG", "1", "Tiny", [A, A, A, P]);
    const r = run(rows, roster([["1", "Tiny", "P.G."]]));
    expect(r.flagged[0].className).toBe("P.G.");
  });
  it("orders classes by grade then name", () => {
    const rows = [
      ...rowsFor("10th Std", "3", "Zed", [A, A, A]),
      ...rowsFor("1st Std", "2", "Bob", [A, A, A]),
      ...rowsFor("1st Std", "1", "Amy", [A, A, A]),
    ];
    const r = run(rows, roster([["3", "Zed", "10th Std"], ["2", "Bob", "1st Std"], ["1", "Amy", "1st Std"]]));
    expect(r.flagged.map((f) => f.studentName)).toEqual(["Amy", "Bob", "Zed"]);
    expect(r.byClass.map((g) => g.className)).toEqual(["1st Std", "10th Std"]);
  });
  it("last present date ignores holiday/Sunday marks and is the most recent present day", () => {
    const rows = [
      ...rowsFor("5th Std", "1", "Asha", [A, A, A, P, P]),
      mk("5th Std", "1", "Asha", "2026-10-04", true), // Sunday, ignored
    ];
    const r = run(rows, roster([["1", "Asha", "5th Std"]]), [], "2026-10-04");
    expect(r.flagged[0].lastPresentDate).toBe(DAYS[3]);
  });
  it("a present Saturday counts as the last present date", () => {
    const rows = [
      ...rowsFor("5th Std", "1", "Asha", [A, A, A, P, P]),
      mk("5th Std", "1", "Asha", "2026-10-03", true),
    ];
    // Saturday present is the newest marked day, so the 3 most recent are P, A, A -> no streak
    expect(run(rows, roster([["1", "Asha", "5th Std"]]), [], "2026-10-03").flagged).toHaveLength(0);
  });
});

describe("anyMarkedOn (drives the 'no attendance marked today' skip)", () => {
  const rows = rowsFor("5th Std", "1", "Asha", [P, P]);
  it("true when any class has a mark that day", () => {
    expect(anyMarkedOn(rows, DAYS[0])).toBe(true);
  });
  it("false when nothing is marked that day, so yesterday's list is not re-sent", () => {
    expect(anyMarkedOn(rows, "2026-10-03")).toBe(false);
    expect(anyMarkedOn([], DAYS[0])).toBe(false);
  });
});
