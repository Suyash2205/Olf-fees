import { describe, expect, it } from "vitest";
import {
  computePendingReport,
  computePendingRow,
  cumulativeDue,
  filterByClass,
  groupByClass,
  pendingCsvFilename,
  pendingToCsv,
  reportTotals,
  type PendingFeeInput,
} from "./pending-report";

const fee = (over: Partial<PendingFeeInput> = {}): PendingFeeInput => ({
  srNo: "1",
  studentName: "A Student",
  className: "1st Std",
  totalFee: 40000,
  totalPaid: 0,
  ...over,
});

describe("cumulativeDue", () => {
  it("puts the remainder in Q4", () => {
    expect(cumulativeDue(40003)).toEqual([10000, 20000, 30000, 40003]);
  });
  it("is all zero for a zero or negative fee", () => {
    expect(cumulativeDue(0)).toEqual([0, 0, 0, 0]);
    expect(cumulativeDue(-5)).toEqual([0, 0, 0, 0]);
  });
});

describe("computePendingRow", () => {
  it("unpaid student is behind on Q1 and Q2", () => {
    const r = computePendingRow(fee(), "q2")!;
    expect(r.quartersLabel).toBe("Q1+Q2");
    expect(r.dueTillQuarter).toBe(20000);
    expect(r.balance).toBe(40000);
  });
  it("Q1 filter only looks at Q1", () => {
    const r = computePendingRow(fee(), "q1")!;
    expect(r.quartersLabel).toBe("Q1");
    expect(r.dueTillQuarter).toBe(10000);
  });
  it("partly paid Q1 still counts as pending, shortfall shown", () => {
    const r = computePendingRow(fee({ totalPaid: 4000 }), "q1")!;
    expect(r.dueTillQuarter).toBe(6000);
    expect(r.quartersBehind).toEqual([1]);
  });
  it("Q1 fully paid: not in Q1 list, but in Q2 list as Q2", () => {
    expect(computePendingRow(fee({ totalPaid: 10000 }), "q1")).toBeNull();
    const r = computePendingRow(fee({ totalPaid: 10000 }), "q2")!;
    expect(r.quartersLabel).toBe("Q2");
    expect(r.dueTillQuarter).toBe(10000);
  });
  it("Q1 + part of Q2 paid is behind on Q2 only", () => {
    const r = computePendingRow(fee({ totalPaid: 15000 }), "q2")!;
    expect(r.quartersLabel).toBe("Q2");
    expect(r.dueTillQuarter).toBe(5000);
  });
  it("Q1+Q2 fully paid drops out of q1/q2 but stays in 'any'", () => {
    expect(computePendingRow(fee({ totalPaid: 20000 }), "q2")).toBeNull();
    const r = computePendingRow(fee({ totalPaid: 20000 }), "any")!;
    expect(r.balance).toBe(20000);
    expect(r.dueTillQuarter).toBe(20000);
    expect(r.quartersLabel).toBe("Q3+Q4");
  });
  it("zero fee never appears", () => {
    for (const f of ["q1", "q2", "any"] as const) {
      expect(computePendingRow(fee({ totalFee: 0 }), f)).toBeNull();
    }
  });
  it("full discount (fee 0 after discount) never appears even with nothing paid", () => {
    expect(computePendingRow(fee({ totalFee: 0, totalPaid: 0 }), "any")).toBeNull();
  });
  it("overpaid never appears and balance is never negative", () => {
    for (const f of ["q1", "q2", "any"] as const) {
      expect(computePendingRow(fee({ totalPaid: 45000 }), f)).toBeNull();
    }
  });
  it("exactly paid in full is not pending", () => {
    expect(computePendingRow(fee({ totalPaid: 40000 }), "any")).toBeNull();
  });
  it("tolerates float noise", () => {
    expect(computePendingRow(fee({ totalPaid: 9999.9999 }), "q1")).toBeNull();
  });
  it("uneven fee splits: remainder is in Q4 and does not make Q1 pending", () => {
    // 10003 -> [2500,2500,2500,2503]
    expect(computePendingRow(fee({ totalFee: 10003, totalPaid: 2500 }), "q1")).toBeNull();
    expect(computePendingRow(fee({ totalFee: 10003, totalPaid: 2499 }), "q1")).not.toBeNull();
  });
});

describe("computePendingReport", () => {
  const fees: PendingFeeInput[] = [
    fee({ srNo: "3", studentName: "Zed", className: "2nd Std" }),
    fee({ srNo: "1", studentName: "Amy", className: "1st Std" }),
    fee({ srNo: "2", studentName: "Amy", className: "1st Std", totalPaid: 40000 }),
    fee({ srNo: "4", studentName: "Amy", className: "1st Std" }), // duplicate name, different Sr No
  ];
  it("sorts by grade then name, keeps duplicate names as separate students", () => {
    const rows = computePendingReport({ fees, filter: "q2" });
    expect(rows.map((r) => r.srNo)).toEqual(["1", "4", "3"]);
  });
  it("attaches last payment and latest follow-up by Sr No only", () => {
    const rows = computePendingReport({
      fees,
      filter: "q2",
      lastPaymentBySrNo: new Map([["1", "2026-08-01"]]),
      latestFollowUpBySrNo: new Map([
        ["4", { parentSaid: "Will pay Friday", reason: "Salary delay", nextFollowUp: "2026-10-03" }],
      ]),
    });
    const byId = Object.fromEntries(rows.map((r) => [r.srNo, r]));
    expect(byId["1"].lastPaymentDate).toBe("2026-08-01");
    expect(byId["1"].latestNote).toBe("");
    expect(byId["4"].latestNote).toBe("Will pay Friday (Reason: Salary delay)");
    expect(byId["4"].nextFollowUp).toBe("2026-10-03");
  });
});

describe("grouping and export", () => {
  const rows = computePendingReport({
    filter: "q2",
    fees: [
      fee({ srNo: "1", studentName: "A", className: "1st Std", totalPaid: 10000 }),
      fee({ srNo: "2", studentName: "B", className: "1st Std" }),
      fee({ srNo: "3", studentName: "C", className: "Nursery" }),
    ],
  });
  it("groups by class in grade order with subtotals", () => {
    const groups = groupByClass(rows);
    expect(groups.map((g) => g.className)).toEqual(["Nursery", "1st Std"]);
    const first = groups.find((g) => g.className === "1st Std")!;
    expect(first.count).toBe(2);
    expect(first.dueTotal).toBe(10000 + 20000);
    expect(first.balanceTotal).toBe(30000 + 40000);
  });
  it("filters by class", () => {
    expect(filterByClass(rows, "Nursery")).toHaveLength(1);
    expect(filterByClass(rows, "all")).toHaveLength(3);
  });
  it("totals", () => {
    expect(reportTotals(rows)).toEqual({ count: 3, dueTotal: 10000 + 20000 + 20000, balanceTotal: 30000 + 40000 + 40000 });
  });
  it("CSV escapes commas/quotes/newlines and neutralises formulas", () => {
    const csv = pendingToCsv([
      {
        ...rows[0],
        studentName: '=HYPERLINK("x")',
        latestNote: 'said "soon", maybe\nnext week',
      },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Class,Sr No,Student Name,Quarters Behind,Due Till Selected Quarter,Total Balance,Last Payment,Latest Follow-up Note,Next Follow-up"
    );
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"said ""soon"", maybe\nnext week"`);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("names the file with filter, class and date", () => {
    expect(pendingCsvFilename("q2", "all", "2026-09-30")).toBe("pending-fees-q2-all-classes-2026-09-30.csv");
    expect(pendingCsvFilename("any", "1st Std", "2026-09-30")).toBe("pending-fees-any-1st-std-2026-09-30.csv");
  });
});
