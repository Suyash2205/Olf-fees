import { describe, expect, it } from "vitest";
import type { DueFollowUp, FollowUp } from "@/lib/fees/follow-ups";
import {
  buildFeeFollowUpsEmail,
  buildFeeFollowUpsText,
  groupFollowUpItems,
  toEmailItems,
  type FeeFollowUpEmailItem,
} from "./fee-followups-template";

const item = (over: Partial<FeeFollowUpEmailItem>): FeeFollowUpEmailItem => ({
  srNo: "1",
  studentName: "Asha",
  className: "1st Std",
  balance: 12500,
  parentName: "Mr Rao",
  phones: ["9876543210"],
  lastNote: "Will pay Friday",
  lastNoteDate: "2026-09-20",
  nextFollowUp: "2026-09-30",
  overdue: false,
  daysOverdue: 0,
  ...over,
});

describe("fee follow-ups email", () => {
  const data = {
    dateIso: "2026-09-30",
    items: [
      item({ srNo: "9", studentName: "Zoya", className: "Nursery", phones: [], parentName: "", lastNote: "" }),
      item({ srNo: "2", studentName: "Bela", overdue: true, daysOverdue: 3, nextFollowUp: "2026-09-27" }),
      item({}),
    ],
  };
  it("groups by class in grade order", () => {
    const g = groupFollowUpItems(data.items);
    expect(g.map((x) => x.className)).toEqual(["Nursery", "1st Std"]);
    expect(g[1].items.map((i) => i.studentName)).toEqual(["Asha", "Bela"]);
  });
  it("subject counts students and overdue", () => {
    const e = buildFeeFollowUpsEmail(data);
    expect(e.subject).toBe("Fee follow-ups due: 3 students, 1 overdue — 2026-09-30");
    expect(e.count).toBe(3);
    expect(e.overdueCount).toBe(1);
  });
  it("text lists balance, phones, last note and overdue label", () => {
    const t = buildFeeFollowUpsText(data);
    expect(t).toContain("3 students to call today or overdue.");
    expect(t).toContain("Asha (Sr No 1) — balance ₹12,500 — due today");
    expect(t).toContain("Mr Rao: +91 9876543210");
    expect(t).toContain("Last note (2026-09-20): Will pay Friday");
    expect(t).toContain("overdue by 3 days (was 2026-09-27)");
    expect(t).toContain("No number on file");
    expect(t).toContain("No note recorded");
  });
  it("singular wording", () => {
    const e = buildFeeFollowUpsEmail({ dateIso: "2026-09-30", items: [item({})] });
    expect(e.subject).toBe("Fee follow-ups due: 1 student — 2026-09-30");
  });
  it("html links phones and escapes user text", () => {
    const e = buildFeeFollowUpsEmail({
      dateIso: "2026-09-30",
      items: [item({ lastNote: "<script>x</script>", studentName: "A&B" })],
    });
    expect(e.html).toContain('href="tel:+919876543210"');
    expect(e.html).not.toContain("<script>x</script>");
    expect(e.html).toContain("A&amp;B");
  });
});

describe("toEmailItems", () => {
  const f: FollowUp = {
    srNo: "5", studentName: "Chitra", className: "2nd Std", date: "2026-09-20",
    parentSaid: "Cheque next week", reason: "Delay", nextFollowUp: "2026-09-29",
    addedBy: "a", addedAt: "t", sheetRow: 2,
  };
  const due: DueFollowUp[] = [{ followUp: f, overdue: true, daysOverdue: 1 }];
  it("joins balance and contact by Sr No", () => {
    const [it] = toEmailItems(due, new Map([["5", 8000]]), new Map([["5", { parentName: "P", phones: ["9123456780"] }]]));
    expect(it).toMatchObject({ balance: 8000, parentName: "P", phones: ["9123456780"], overdue: true, daysOverdue: 1 });
    expect(it.lastNote).toBe("Cheque next week (Reason: Delay)");
  });
  it("tolerates a missing contact", () => {
    const [it] = toEmailItems(due, new Map(), new Map());
    expect(it.phones).toEqual([]);
    expect(it.balance).toBe(0);
  });
});
