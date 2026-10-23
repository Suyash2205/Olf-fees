import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedBot } from "./auth";
import { buildBotSnapshot } from "./snapshot";
import { parentTableValues, parseBotReport, WA_PARENT_HEADERS, type BotReport } from "@/lib/sheets/whatsapp-bot";
import type { ResolvedParentContact } from "@/lib/sheets/parent-contacts";

const contact = (srNo: string, phones: string[]): ResolvedParentContact => ({ srNo, parentName: "", phones, source: "admissions", invalidRaw: [] });

describe("buildBotSnapshot", () => {
  const base = {
    today: "2026-10-26",
    from: "2026-10-01",
    inactiveKeys: new Set<string>(["gr-2026-9"]),
    contacts: new Map([["1", contact("1", ["9800000001"])]]),
  };

  it("joins phones on Sr No, canonicalises class, marks inactive, filters attendance by date and roster", () => {
    const s = buildBotSnapshot({
      ...base,
      fees: [
        { srNo: "1", studentName: " Aarav ", className: "6th Std", notes: "" },
        { srNo: "2", studentName: "Left Kid", className: "6th Std", notes: "STATUS: Left" },
        { srNo: "3", studentName: "Gr Inactive", className: "6th Std", notes: "GR: GR-2026-9" },
        { srNo: "", studentName: "No Sr", className: "6th Std", notes: "" },
      ],
      attendance: [
        { srNo: "1", date: "2026-10-26", status: "absent" },
        { srNo: "1", date: "2026-09-30", status: "absent" },
        { srNo: "1", date: "2026-10-27", status: "absent" },
        { srNo: "99", date: "2026-10-26", status: "absent" },
      ],
    });
    expect(s.students.map((x) => [x.srNo, x.name, x.active, x.phones])).toEqual([
      ["1", "Aarav", true, ["9800000001"]],
      ["2", "Left Kid", false, []],
      ["3", "Gr Inactive", false, []],
    ]);
    expect(s.attendance).toEqual([{ srNo: "1", date: "2026-10-26", status: "absent" }]);
  });

  it("refuses duplicate Sr Nos rather than guessing which row is right", () => {
    expect(() =>
      buildBotSnapshot({
        ...base,
        fees: [
          { srNo: "1", studentName: "A", className: "6th Std", notes: "" },
          { srNo: "1", studentName: "B", className: "6th Std", notes: "" },
        ],
        attendance: [],
      })
    ).toThrow(/Duplicate/);
  });
});

describe("isAuthorizedBot", () => {
  const prev = process.env.BOT_SECRET;
  afterEach(() => {
    process.env.BOT_SECRET = prev;
  });
  it("is locked when no secret is configured", () => {
    delete process.env.BOT_SECRET;
    expect(isAuthorizedBot("anything")).toBe(false);
    expect(isAuthorizedBot("")).toBe(false);
  });
  it("accepts only the exact secret", () => {
    process.env.BOT_SECRET = "s3cret-value";
    expect(isAuthorizedBot("s3cret-value")).toBe(true);
    expect(isAuthorizedBot("s3cret-valuX")).toBe(false);
    expect(isAuthorizedBot("s3cret")).toBe(false);
    expect(isAuthorizedBot(null)).toBe(false);
  });
});

describe("bot report", () => {
  const report: BotReport = {
    parents: [
      { phone: "9800000001", srNos: ["1"], status: "ok", unanswered: 0, flaggedAt: null, lastSentAt: "t1", lastReplyAt: "t2", lastReplyText: "sick" },
      { phone: "9800000002", srNos: ["2", "3"], status: "not_replying", unanswered: 2, flaggedAt: "t3", lastSentAt: "t4", lastReplyAt: null, lastReplyText: null },
    ],
    replies: [{ id: 1, phone: "9800000001", text: "sick", receivedAt: "t2" }],
  };

  it("validates", () => {
    expect(parseBotReport(report)).toBe(report);
    expect(() => parseBotReport({})).toThrow();
    expect(() => parseBotReport({ ...report, parents: [{ ...report.parents[0], phone: "123" }] })).toThrow();
    expect(() => parseBotReport({ ...report, parents: [{ ...report.parents[0], status: "weird" }] })).toThrow();
  });

  it("builds the parents table with not-replying first and student labels", () => {
    const v = parentTableValues(report, (sr) => `S${sr}`, "now");
    expect(v[0]).toEqual([...WA_PARENT_HEADERS]);
    expect(v[1].slice(0, 5)).toEqual(["9800000002", "Not replying", "2", "S2; S3", "2, 3"]);
    expect(v[2].slice(0, 2)).toEqual(["9800000001", "OK"]);
    expect(v[2][8]).toBe("sick");
  });
});
