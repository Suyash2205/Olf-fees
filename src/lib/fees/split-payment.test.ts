import { describe, expect, it, vi } from "vitest";
import { buildSplitParts, saveAllOrNothing, SplitRollbackError, splitSuffix } from "./split-payment";

describe("buildSplitParts", () => {
  it("builds a cash row then an online row with the suffix", () => {
    const [cash, online] = buildSplitParts(3000, 2000, "Q1 fee");
    expect(cash).toEqual({
      paymentMode: "cash",
      amount: 3000,
      note: "Q1 fee (split: ₹3000 cash + ₹2000 online)",
    });
    expect(online.paymentMode).toBe("online");
    expect(online.amount).toBe(2000);
    expect(online.note).toBe(cash.note);
  });
  it("uses only the suffix when there is no comment", () => {
    expect(buildSplitParts(1, 2)[0].note).toBe("(split: ₹1 cash + ₹2 online)");
  });
  it("total equals the sum of parts", () => {
    const parts = buildSplitParts(1234.5, 765.5);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(2000);
    expect(splitSuffix(1234.5, 765.5)).toBe("(split: ₹1234.50 cash + ₹765.50 online)");
  });
  it("rejects zero, negative, NaN and >2 decimals", () => {
    expect(() => buildSplitParts(0, 100)).toThrow();
    expect(() => buildSplitParts(100, 0)).toThrow();
    expect(() => buildSplitParts(-1, 100)).toThrow();
    expect(() => buildSplitParts(NaN, 100)).toThrow();
    expect(() => buildSplitParts(10.123, 100)).toThrow();
  });
});

describe("saveAllOrNothing", () => {
  it("saves every part and returns the ids", async () => {
    const append = vi.fn(async (p: string) => `row-${p}`);
    const undo = vi.fn();
    expect(await saveAllOrNothing(["a", "b"], append, undo)).toEqual(["row-a", "row-b"]);
    expect(undo).not.toHaveBeenCalled();
  });
  it("undoes the first row when the second fails and rethrows the original error", async () => {
    const append = vi.fn(async (p: string) => {
      if (p === "b") throw new Error("boom");
      return `row-${p}`;
    });
    const undo = vi.fn(async () => {});
    await expect(saveAllOrNothing(["a", "b"], append, undo)).rejects.toThrow("boom");
    expect(undo).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledWith("row-a", "a");
  });
  it("does not undo anything when the first part fails", async () => {
    const undo = vi.fn();
    await expect(
      saveAllOrNothing(["a", "b"], async () => { throw new Error("first"); }, undo)
    ).rejects.toThrow("first");
    expect(undo).not.toHaveBeenCalled();
  });
  it("reports the stuck row when the rollback itself fails", async () => {
    const append = vi.fn(async (p: string) => {
      if (p === "b") throw new Error("boom");
      return "7";
    });
    const undo = vi.fn(async () => { throw new Error("nope"); });
    const err = await saveAllOrNothing(["a", "b"], append, undo).catch((e) => e);
    expect(err).toBeInstanceOf(SplitRollbackError);
    expect(err.message).toContain("row 7");
  });
});
