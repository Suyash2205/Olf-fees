import { describe, expect, it } from "vitest";
import {
  DETAIL_FIELDS,
  buildDetailViews,
  changedCells,
  detailField,
  isMissingValue,
  validateDetail,
  validateDetailUpdates,
} from "../details";

const T = "2026-10-24";
const f = (k: string) => detailField(k)!;

describe("validateDetail", () => {
  it("normalises phones and Aadhaar, rejects bad ones", () => {
    expect(validateDetail(f("parentPhone"), "+91 98200 12345", T)).toEqual({ ok: true, value: "9820012345" });
    expect(validateDetail(f("parentPhone"), "12345", T).ok).toBe(false);
    expect(validateDetail(f("aadhar"), "2345 6789 0123", T)).toEqual({ ok: true, value: "234567890123" });
    expect(validateDetail(f("aadhar"), "12345678901", T).ok).toBe(false);
    expect(validateDetail(f("aadhar"), "123456789012", T).ok).toBe(false);
  });
  it("checks dates, options and text", () => {
    expect(validateDetail(f("dob"), "2015-02-29", T).ok).toBe(false);
    expect(validateDetail(f("dob"), "2027-01-01", T).ok).toBe(false);
    expect(validateDetail(f("dob"), "2016-02-29", T)).toEqual({ ok: true, value: "2016-02-29" });
    expect(validateDetail(f("sex"), "female", T)).toEqual({ ok: true, value: "Female" });
    expect(validateDetail(f("sex"), "x", T).ok).toBe(false);
    expect(validateDetail(f("religion"), "=IMPORTXML(1)", T).ok).toBe(false);
    expect(validateDetail(f("residentialAddress"), "  Flat 2,   Mira  Road ", T)).toEqual({ ok: true, value: "Flat 2, Mira Road" });
    expect(validateDetail(f("religion"), "", T)).toEqual({ ok: true, value: "" });
  });
});

describe("validateDetailUpdates", () => {
  it("is all-or-nothing, drops blanks, rejects unknown fields and duplicates", () => {
    expect(validateDetailUpdates([{ srNo: "1", fields: { dob: "2015-01-01", religion: "" } }], T)).toEqual({ ok: true, value: [{ srNo: "1", values: { dob: "2015-01-01" } }] });
    expect(validateDetailUpdates([{ srNo: "1", fields: { status: "Left" } }], T).ok).toBe(false);
    expect(validateDetailUpdates([{ srNo: "1", fields: {} }, { srNo: "1", fields: {} }], T).ok).toBe(false);
    const r = validateDetailUpdates([{ srNo: "1", fields: { dob: "2015-01-01" } }, { srNo: "2", fields: { aadhar: "1" } }], T);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Sr No 2") });
  });
});

describe("changedCells", () => {
  it("returns only admission cells that differ; the phone is never an admission cell", () => {
    const cur: Record<string, string> = { DOB: "2015-01-01", Religion: "" };
    expect(changedCells({ dob: "2015-01-01", religion: "Hindu", parentPhone: "9820012345" }, (h) => cur[h] ?? "")).toEqual({ Religion: "Hindu" });
  });
});

describe("buildDetailViews", () => {
  it("joins by GR, treats placeholders as missing, uses the first valid phone", () => {
    const views = buildDetailViews(
      [
        { srNo: "2", studentName: "B", className: "1st Std", notes: "GR: GR-2024-2" },
        { srNo: "1", studentName: "A", className: "Nursery", notes: "GR: gr-2024-1" },
      ],
      [
        { grNo: "GR-2024-1", dob: "2020-01-01", caste: "-", fatherName: "F" },
        { grNo: "GR-2024-2", dob: "", aadhar: "" },
      ],
      new Map([["1", { phones: ["9820012345"], invalidRaw: [] }], ["2", { phones: [], invalidRaw: ["12345"] }]]),
      new Map([["gr-2024-2", "234567890123"]])
    );
    expect(views.map((v) => v.srNo)).toEqual(["1", "2"]);
    expect(views[0].values.parentPhone).toBe("9820012345");
    expect(views[0].missing).toContain("caste");
    expect(views[0].missing).not.toContain("dob");
    expect(views[1].missing).toContain("parentPhone");
    expect(views[1].invalidPhones).toEqual(["12345"]);
    expect(views[1].udiseAadhaar).toBe("234567890123");
    expect(views[0].missing.length + Object.values(views[0].values).filter(Boolean).length).toBe(DETAIL_FIELDS.length);
  });
  it("treats dashes and NA as missing", () => {
    expect(["", "-", "NA", "n/a", "--"].every(isMissingValue)).toBe(true);
    expect(isMissingValue("Hindu")).toBe(false);
  });
});
