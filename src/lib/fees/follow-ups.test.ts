import { describe, expect, it } from "vitest";
import {
  followUpHistory,
  isValidIsoDate,
  latestFollowUpBySrNo,
  selectDueFollowUps,
  type FollowUp,
} from "./follow-ups";
import { validateFollowUpInput } from "@/lib/sheets/fee-followups";

let row = 1;
const fu = (over: Partial<FollowUp>): FollowUp => ({
  srNo: "1",
  studentName: "A",
  className: "1st Std",
  date: "2026-09-01",
  parentSaid: "",
  reason: "",
  nextFollowUp: "",
  addedBy: "x",
  addedAt: "2026-09-01T05:00:00.000Z",
  sheetRow: ++row,
  ...over,
});

describe("isValidIsoDate", () => {
  it("accepts real dates only", () => {
    expect(isValidIsoDate("2026-09-30")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("30-09-2026")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("latestFollowUpBySrNo", () => {
  it("picks the entry with the latest call date", () => {
    const rows = [
      fu({ date: "2026-09-10", nextFollowUp: "2026-09-20" }),
      fu({ date: "2026-09-01", nextFollowUp: "2026-09-05" }),
    ];
    expect(latestFollowUpBySrNo(rows).get("1")!.nextFollowUp).toBe("2026-09-20");
  });
  it("breaks same-day ties by time added, then sheet row", () => {
    const a = fu({ date: "2026-09-10", addedAt: "2026-09-10T04:00:00Z", nextFollowUp: "A" });
    const b = fu({ date: "2026-09-10", addedAt: "2026-09-10T06:00:00Z", nextFollowUp: "B" });
    expect(latestFollowUpBySrNo([a, b]).get("1")!.nextFollowUp).toBe("B");
    const c = fu({ date: "2026-09-10", addedAt: "2026-09-10T06:00:00Z", nextFollowUp: "C" });
    expect(latestFollowUpBySrNo([b, c]).get("1")!.nextFollowUp).toBe("C");
  });
  it("keeps students with the same name apart (keys on Sr No)", () => {
    const m = latestFollowUpBySrNo([fu({ srNo: "1" }), fu({ srNo: "2" })]);
    expect([...m.keys()].sort()).toEqual(["1", "2"]);
  });
});

describe("followUpHistory", () => {
  it("returns one student's entries newest first", () => {
    const h = followUpHistory(
      [fu({ date: "2026-09-01" }), fu({ srNo: "2", date: "2026-09-30" }), fu({ date: "2026-09-15" })],
      "1"
    );
    expect(h.map((x) => x.date)).toEqual(["2026-09-15", "2026-09-01"]);
  });
});

describe("selectDueFollowUps", () => {
  const today = "2026-09-30";
  const owing = new Set(["1", "2", "3", "4", "5"]);
  it("includes today and overdue, excludes future and blank", () => {
    const latest = latestFollowUpBySrNo([
      fu({ srNo: "1", nextFollowUp: "2026-09-30" }),
      fu({ srNo: "2", nextFollowUp: "2026-09-25" }),
      fu({ srNo: "3", nextFollowUp: "2026-10-01" }),
      fu({ srNo: "4", nextFollowUp: "" }),
    ]);
    const due = selectDueFollowUps(latest, owing, today);
    expect(due.map((d) => d.followUp.srNo)).toEqual(["2", "1"]); // overdue first
    expect(due[0]).toMatchObject({ overdue: true, daysOverdue: 5 });
    expect(due[1]).toMatchObject({ overdue: false, daysOverdue: 0 });
  });
  it("uses only the latest entry: a newer entry with a future date clears an old overdue one", () => {
    const latest = latestFollowUpBySrNo([
      fu({ date: "2026-09-01", nextFollowUp: "2026-09-05" }),
      fu({ date: "2026-09-20", nextFollowUp: "2026-10-10" }),
    ]);
    expect(selectDueFollowUps(latest, owing, today)).toEqual([]);
  });
  it("skips students who no longer owe (paid up, inactive)", () => {
    const latest = latestFollowUpBySrNo([fu({ srNo: "9", nextFollowUp: "2026-09-01" })]);
    expect(selectDueFollowUps(latest, owing, today)).toEqual([]);
  });
  it("ignores malformed dates", () => {
    const latest = latestFollowUpBySrNo([fu({ nextFollowUp: "soon" })]);
    expect(selectDueFollowUps(latest, owing, today)).toEqual([]);
  });
});

describe("validateFollowUpInput", () => {
  const base = { srNo: "1", studentName: "A", className: "1st Std", date: "2026-09-30" };
  it("accepts a note only", () => {
    expect(validateFollowUpInput({ ...base, parentSaid: " will pay " }).parentSaid).toBe("will pay");
  });
  it("rejects an empty entry", () => {
    expect(() => validateFollowUpInput(base)).toThrow(/Enter what the parent said/);
  });
  it("rejects bad dates and next before call date", () => {
    expect(() => validateFollowUpInput({ ...base, date: "x", parentSaid: "a" })).toThrow(/date/);
    expect(() => validateFollowUpInput({ ...base, parentSaid: "a", nextFollowUp: "2026-09-01" })).toThrow(/before/);
    expect(() => validateFollowUpInput({ ...base, parentSaid: "a", nextFollowUp: "2026-13-01" })).toThrow();
  });
  it("accepts a next date alone and caps text length", () => {
    expect(validateFollowUpInput({ ...base, nextFollowUp: "2026-10-05" }).nextFollowUp).toBe("2026-10-05");
    expect(() => validateFollowUpInput({ ...base, parentSaid: "x".repeat(1001) })).toThrow(/limited/);
  });
});
