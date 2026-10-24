import { describe, expect, it } from "vitest";
import { normalizeIndianMobile, resolveParentContacts } from "../parent-contacts";
import { columnLetter, parseKeyedRows } from "../keyed-tab";

describe("normalizeIndianMobile", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["09876543210", "9876543210"],
    ["98765-43210", "9876543210"],
    ["12345", null],
    ["5876543210", null],
    ["", null],
  ])("%s → %s", (raw, want) => expect(normalizeIndianMobile(raw)).toBe(want));
});

const adm = (grNo: string, father: string, mother: string) => ({
  grNo, fatherName: "F", motherName: "M", fatherContact: father, motherContact: mother,
});

describe("resolveParentContacts", () => {
  it("joins via GR in notes, never by name", () => {
    const r = resolveParentContacts(
      [{ srNo: "1", notes: "GR: GR-2026-5" }, { srNo: "2", notes: "" }],
      [adm("GR-2026-5", "9876543210", "9876543210")],
      []
    );
    expect(r.get("1")).toMatchObject({ phones: ["9876543210"], source: "admissions" });
    expect(r.get("2")).toMatchObject({ phones: [], source: "none" });
  });

  it("portal override comes first, admissions numbers kept after", () => {
    const r = resolveParentContacts(
      [{ srNo: "1", notes: "STATUS: x GR: GR-2026-5" }],
      [adm("GR-2026-5", "9876543210", "")],
      [{ "Sr No": "1", "Parent Name": "Asha", "Primary Phone": "9123456780", "Alternate Phone": "" }]
    );
    expect(r.get("1")).toMatchObject({ parentName: "Asha", phones: ["9123456780", "9876543210"], source: "portal" });
  });

  it("reports malformed numbers", () => {
    const r = resolveParentContacts([{ srNo: "1", notes: "GR-2026-5" }], [adm("GR-2026-5", "12345", "")], []);
    expect(r.get("1")).toMatchObject({ phones: [], invalidRaw: ["12345"], source: "none" });
  });

  it("uses each valid number when one cell holds two", () => {
    const r = resolveParentContacts([{ srNo: "1", notes: "GR-2026-5" }], [adm("GR-2026-5", "7021767262 / 9284390759", "12345678 / 919820012345")], []);
    expect(r.get("1")).toMatchObject({ phones: ["7021767262", "9284390759", "9820012345"], invalidRaw: [], source: "admissions" });
  });
});

describe("keyed-tab", () => {
  it("columnLetter", () => {
    expect([0, 25, 26, 51, 52].map(columnLetter)).toEqual(["A", "Z", "AA", "AZ", "BA"]);
  });
  it("parses by header name, tolerates reordering and blank rows", () => {
    const rows = parseKeyedRows(
      [["B", "Extra", "A"], ["b1", "x", "a1"], [], ["", "", ""], ["b4", "", "a4"]],
      ["A", "B"] as const
    );
    expect(rows).toEqual([
      { A: "a1", B: "b1", sheetRow: 2 },
      { A: "a4", B: "b4", sheetRow: 5 },
    ]);
  });
});
