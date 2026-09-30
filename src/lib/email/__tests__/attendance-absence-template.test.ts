import { describe, expect, it } from "vitest";
import {
  buildAbsenceEmailHtml,
  buildAbsenceEmailSubject,
  buildAbsenceEmailText,
  type AbsenceContactLookup,
} from "../attendance-absence-template";
import type { ChronicAbsenceReport, FlaggedStudent } from "@/lib/attendance/chronic-absence";

const stu = (over: Partial<FlaggedStudent>): FlaggedStudent => ({
  srNo: "1", studentName: "Asha Rao", className: "5th Std",
  reasons: ["3 days in a row"], streak: true, absentCount: 3, windowDays: 10,
  absentEveryDay: false, lastPresentDate: "2026-09-28", ...over,
});

const every = stu({ srNo: "2", studentName: "Ben <Every>", reasons: ["3 days in a row", "6 of last 6 school days"], absentEveryDay: true, absentCount: 6, windowDays: 6, lastPresentDate: null });
const a = stu({});
const b = stu({ srNo: "3", studentName: "Cara", className: "6th Std", reasons: ["5 of last 10 school days"], streak: false, absentCount: 5 });

const report: ChronicAbsenceReport = {
  dateIso: "2026-10-02",
  flagged: [a, every, b],
  absentEveryDay: [every],
  byClass: [
    { className: "5th Std", students: [a] },
    { className: "6th Std", students: [b] },
  ],
  countsByClass: [{ className: "5th Std", count: 2 }, { className: "6th Std", count: 1 }],
};

const contacts: Record<string, { parentName: string; phones: string[] }> = {
  "1": { parentName: "Mr Rao", phones: ["9876543210", "9123456780"] },
  "3": { parentName: "", phones: [] },
};
const lookup: AbsenceContactLookup = (sr) => contacts[sr];

describe("subject", () => {
  it("pluralises and carries the date", () => {
    expect(buildAbsenceEmailSubject(report)).toBe("Attendance alert: 3 students with repeated absence — 2 Oct 2026");
    expect(buildAbsenceEmailSubject({ ...report, flagged: [a] })).toContain("1 student with");
  });
});

describe("text", () => {
  const text = buildAbsenceEmailText(report, lookup);
  it("has the per-class summary and the absent-every-day section before the class groups", () => {
    expect(text).toContain("Per class: 5th Std 2, 6th Std 1");
    expect(text.indexOf("ABSENT EVERY DAY IN THE WINDOW")).toBeGreaterThan(-1);
    expect(text.indexOf("ABSENT EVERY DAY IN THE WINDOW")).toBeLessThan(text.indexOf("5th Std (1)"));
  });
  it("shows name, Sr No, reason, last present, parent and phones", () => {
    expect(text).toContain("Asha Rao (Sr No 1) — 3 days in a row");
    expect(text).toContain("Last present: 28 Sep 2026");
    expect(text).toContain("Parent: Mr Rao");
    expect(text).toContain("Phone: 9876543210, 9123456780");
  });
  it("says No number on file when there is none, or no contact at all", () => {
    expect(text).toContain("Cara (Sr No 3)");
    expect(text.match(/No number on file/g)).toHaveLength(2); // Cara (empty) + Ben (no lookup entry)
  });
  it("says when nobody has ever been present", () => {
    expect(text).toContain("no present day on record");
  });
  it("omits the every-day section when empty", () => {
    const t = buildAbsenceEmailText({ ...report, absentEveryDay: [] }, lookup);
    expect(t).not.toContain("ABSENT EVERY DAY");
  });
});

describe("html", () => {
  const html = buildAbsenceEmailHtml(report, lookup);
  it("renders phones as tel: links and escapes names", () => {
    expect(html).toContain('href="tel:9876543210"');
    expect(html).toContain('href="tel:9123456780"');
    expect(html).toContain("Ben &lt;Every&gt;");
    expect(html).not.toContain("Ben <Every>");
  });
  it("marks missing numbers and lists the sections", () => {
    expect(html).toContain("No number on file");
    expect(html).toContain("Absent every day in the window");
    expect(html).toContain("5th Std (1)");
    expect(html).toContain("6th Std (1)");
  });
  it("has the header summary counts", () => {
    expect(html).toContain("<strong>3</strong> students flagged");
    expect(html).toContain("5th Std: <strong>2</strong>");
  });
});
