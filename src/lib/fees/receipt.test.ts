import { describe, expect, it } from "vitest";
import { normalizeReceiptNo, parseReceiptCell, receiptCellValue, searchByReceipt } from "./receipt";

describe("normalizeReceiptNo", () => {
  it("returns undefined for blank input", () => {
    expect(normalizeReceiptNo(undefined)).toBeUndefined();
    expect(normalizeReceiptNo(null)).toBeUndefined();
    expect(normalizeReceiptNo("   ")).toBeUndefined();
  });
  it("trims and collapses spaces", () => {
    expect(normalizeReceiptNo("  R-17/26  ")).toBe("R-17/26");
    expect(normalizeReceiptNo("A   12")).toBe("A 12");
  });
  it("keeps leading zeros", () => {
    expect(normalizeReceiptNo("0042")).toBe("0042");
  });
  it("rejects formula-like or odd input", () => {
    expect(() => normalizeReceiptNo("=SUM(A1)")).toThrow();
    expect(() => normalizeReceiptNo("+91")).toThrow();
    expect(() => normalizeReceiptNo("-5")).toThrow();
    expect(() => normalizeReceiptNo("a<b")).toThrow();
  });
  it("rejects over-long input", () => {
    expect(() => normalizeReceiptNo("1".repeat(31))).toThrow(/too long/);
    expect(normalizeReceiptNo("1".repeat(30))).toBe("1".repeat(30));
  });
});

describe("receipt cell round trip", () => {
  it("forces all-digit receipts to text", () => {
    expect(receiptCellValue("0042")).toBe("'0042");
    expect(receiptCellValue("1042")).toBe("'1042");
    expect(receiptCellValue("R-17")).toBe("R-17");
    expect(receiptCellValue(undefined)).toBe("");
  });
  it("parses a cell back", () => {
    expect(parseReceiptCell("'0042")).toBe("0042");
    expect(parseReceiptCell(" R-17 ")).toBe("R-17");
    expect(parseReceiptCell("")).toBeUndefined();
    expect(parseReceiptCell(undefined)).toBeUndefined();
  });
});

describe("searchByReceipt", () => {
  const items = [
    { id: 1, receiptNo: "1042" },
    { id: 2, receiptNo: "1042" }, // split payment: two rows, one receipt
    { id: 3, receiptNo: "R-1042" },
    { id: 4, receiptNo: undefined },
    { id: 5, receiptNo: "10420" },
  ];
  it("finds exact matches (both rows of a split)", () => {
    expect(searchByReceipt(items, " 1042 ").map((i) => i.id)).toEqual([1, 2]);
  });
  it("is case-insensitive", () => {
    expect(searchByReceipt(items, "r-1042").map((i) => i.id)).toEqual([3]);
  });
  it("falls back to contains only for 3+ chars when no exact match", () => {
    expect(searchByReceipt(items, "104").map((i) => i.id)).toEqual([1, 2, 3, 5]);
    expect(searchByReceipt(items, "10")).toEqual([]);
  });
  it("returns nothing for blank query or rows without receipts", () => {
    expect(searchByReceipt(items, "")).toEqual([]);
    expect(searchByReceipt([{ receiptNo: undefined }], "1")).toEqual([]);
  });
});
