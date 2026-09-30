import { describe, expect, it } from "vitest";
import {
  aadhaarPendingCsv,
  aadhaarPendingList,
  buildStudentRecordViews,
  csvCell,
  isPrePrimary,
  NO_REASON_FILTER,
  toCsv,
  udiseApplies,
  udisePendingCsv,
  udisePendingList,
  validateHeight,
  validateMeasuredOn,
  validateRecordFields,
  validateWeight,
  type ViewAdmission,
  type ViewFee,
  type ViewRecordRow,
  type ViewUdise,
} from "../records";

const TODAY = "2026-09-30";

describe("udiseApplies", () => {
  it.each(["P.G.", "PG", "Nursery", "Jr. Kg.", "Sr. Kg."])("%s is pre-primary (N/A)", (c) => {
    expect(isPrePrimary(c)).toBe(true);
    expect(udiseApplies(c)).toBe(false);
  });
  it.each(["1st Std", "1st", "5th Std", "10th Std"])("%s applies", (c) => {
    expect(udiseApplies(c)).toBe(true);
  });
  it("an unrecognised class is treated as applicable so it stays visible", () => {
    expect(udiseApplies("Mystery")).toBe(true);
  });
});

describe("height / weight validation", () => {
  it("accepts blank (clears the value)", () => {
    expect(validateHeight("")).toEqual({ ok: true, value: "" });
    expect(validateWeight("  ")).toEqual({ ok: true, value: "" });
  });
  it("accepts the boundaries and normalises decimals", () => {
    expect(validateHeight("50")).toEqual({ ok: true, value: "50" });
    expect(validateHeight("220")).toEqual({ ok: true, value: "220" });
    expect(validateHeight("112.50")).toEqual({ ok: true, value: "112.5" });
    expect(validateWeight("5")).toEqual({ ok: true, value: "5" });
    expect(validateWeight("150")).toEqual({ ok: true, value: "150" });
    expect(validateWeight("18.04")).toEqual({ ok: true, value: "18" });
  });
  it.each(["49.9", "221", "0", "-5", "1200"])("rejects height %s", (v) => {
    expect(validateHeight(v).ok).toBe(false);
  });
  it.each(["4.9", "151", "0"])("rejects weight %s", (v) => {
    expect(validateWeight(v).ok).toBe(false);
  });
  it.each(["abc", "12cm", "1,5", "NaN", "1e2", "١٢٣"])("rejects non-numeric %s", (v) => {
    expect(validateHeight(v).ok).toBe(false);
    expect(validateWeight(v).ok).toBe(false);
  });
  it("error message names the range", () => {
    const r = validateHeight("300");
    expect(!r.ok && r.error).toMatch(/50 and 220 cm/);
  });
});

describe("validateMeasuredOn", () => {
  it("accepts blank, today and the past", () => {
    expect(validateMeasuredOn("", TODAY).ok).toBe(true);
    expect(validateMeasuredOn(TODAY, TODAY).ok).toBe(true);
    expect(validateMeasuredOn("2026-01-05", TODAY).ok).toBe(true);
  });
  it("rejects future, malformed and impossible dates", () => {
    expect(validateMeasuredOn("2026-10-01", TODAY).ok).toBe(false);
    expect(validateMeasuredOn("30/09/2026", TODAY).ok).toBe(false);
    expect(validateMeasuredOn("2026-02-30", TODAY).ok).toBe(false);
  });
});

describe("validateRecordFields", () => {
  const ctx = { className: "5th Std", todayIso: TODAY };
  it("maps only supplied fields to sheet headers", () => {
    const r = validateRecordFields({ height: "120", weight: "22.5" }, ctx);
    expect(r).toEqual({ ok: true, value: { "Height (cm)": "120", "Weight (kg)": "22.5" } });
  });
  it("saves a UDISE status with reason and note", () => {
    const r = validateRecordFields({ udiseStatus: "Not updated", udiseReason: "Aadhaar missing", udiseNote: " call parent " }, ctx);
    expect(r).toEqual({
      ok: true,
      value: { "UDISE Status": "Not updated", "UDISE Reason": "Aadhaar missing", "UDISE Note": "call parent" },
    });
  });
  it("rejects UDISE fields for pre-primary students", () => {
    const r = validateRecordFields({ udiseStatus: "Updated", udiseReason: "", udiseNote: "" }, { ...ctx, className: "Nursery" });
    expect(!r.ok && r.error).toMatch(/pre-primary/);
  });
  it("still lets pre-primary students have height and weight", () => {
    expect(validateRecordFields({ height: "90" }, { ...ctx, className: "Nursery" }).ok).toBe(true);
  });
  it("rejects a bad status, a bad reason, a reason with Updated, and an overlong note", () => {
    expect(validateRecordFields({ udiseStatus: "Done" }, ctx).ok).toBe(false);
    expect(validateRecordFields({ udiseStatus: "Not updated", udiseReason: "Lazy" }, ctx).ok).toBe(false);
    expect(validateRecordFields({ udiseStatus: "Updated", udiseReason: "Other" }, ctx).ok).toBe(false);
    expect(validateRecordFields({ udiseNote: "x".repeat(501) }, ctx).ok).toBe(false);
  });
  it("blank status clears it", () => {
    expect(validateRecordFields({ udiseStatus: "", udiseReason: "", udiseNote: "" }, ctx)).toEqual({
      ok: true,
      value: { "UDISE Status": "", "UDISE Reason": "", "UDISE Note": "" },
    });
  });
  it("the first invalid field wins and nothing is returned", () => {
    const r = validateRecordFields({ height: "999", weight: "20" }, ctx);
    expect(r.ok).toBe(false);
  });
});

// ---- merged view + reports ----

const fee = (srNo: string, studentName: string, className: string, notes = ""): ViewFee => ({ srNo, studentName, className, notes });
const adm = (grNo: string, aadhar: string): ViewAdmission => ({ grNo, aadhar });
const udise = (grNumber: string, extra: Partial<ViewUdise> = {}): ViewUdise => ({
  grNumber, permanentEducationNumber: "", aadhaarNumber: "", heightCm: "", weightKg: "", ...extra,
});
const rec = (srNo: string, extra: Partial<ViewRecordRow> = {}): ViewRecordRow => ({
  "Sr No": srNo, "Height (cm)": "", "Weight (kg)": "", "Measured On": "",
  "UDISE Status": "", "UDISE Reason": "", "UDISE Note": "", ...extra,
});

const FEES: ViewFee[] = [
  fee("1", "Asha Rao", "5th Std", "GR: GR-2026-1"),
  fee("2", "Asha Rao", "5th Std", "GR: GR-2026-2"), // duplicate name, different student
  fee("3", "Tiny Tot", "Nursery", "GR: GR-2026-3"),
  fee("4", "No Admission", "2nd Std", "GR: GR-2026-99"),
  fee("5", "No GR", "3rd Std", "STATUS: none"),
  fee("6", "Ten", "10th Std", "GR: GR-2026-6"),
];
const ADMS = [adm("GR-2026-1", "1234 5678 9012"), adm("GR-2026-2", ""), adm("GR-2026-3", ""), adm("GR-2026-6", "")];
const UDS = [
  udise("GR-2026-2", { aadhaarNumber: "999911112222", permanentEducationNumber: "PEN1", heightCm: "121", weightKg: "NA" }),
  udise("GR-2026-6"),
];

describe("buildStudentRecordViews", () => {
  const views = buildStudentRecordViews(FEES, ADMS, UDS, [
    rec("1", { "Height (cm)": "130", "Measured On": "2026-09-01", "UDISE Status": "Updated" }),
    rec("2", { "UDISE Status": "Not updated", "UDISE Reason": "Documents pending" }),
  ]);
  const by = (sr: string) => views.find((v) => v.srNo === sr)!;

  it("joins by Sr No / GR, never by name (duplicate names stay separate)", () => {
    expect(by("1").height).toBe("130");
    expect(by("2").height).toBe("");
    expect(by("1").udiseStatus).toBe("Updated");
    expect(by("2").udiseReason).toBe("Documents pending");
    expect(by("2").penFound).toBe(true);
    expect(by("1").penFound).toBe(false);
  });
  it("carries UDISE hints, treating NA as blank", () => {
    expect(by("2").udiseHeightHint).toBe("121");
    expect(by("2").udiseWeightHint).toBe("");
  });
  it("flags applicability and admission joins", () => {
    expect(by("3").udiseApplicable).toBe(false);
    expect(by("1").hasAdmission).toBe(true);
    expect(by("4").hasAdmission).toBe(false);
    expect(by("5").grNo).toBe("");
    expect(by("5").hasAdmission).toBe(false);
  });
  it("is sorted by grade", () => {
    expect(views.map((v) => v.className)).toEqual(["Nursery", "2nd Std", "3rd Std", "5th Std", "5th Std", "10th Std"]);
  });
});

describe("udisePendingList", () => {
  const views = buildStudentRecordViews(FEES, ADMS, UDS, [
    rec("1", { "UDISE Status": "Updated" }),
    rec("2", { "UDISE Status": "Not updated", "UDISE Reason": "Aadhaar missing" }),
    rec("6", { "UDISE Status": "Not updated" }),
  ]);
  it("excludes pre-primary and Updated; includes blank status; sorted by class", () => {
    expect(udisePendingList(views).map((v) => v.srNo)).toEqual(["4", "5", "2", "6"]);
  });
  it("filters by reason and by no-reason", () => {
    expect(udisePendingList(views, "Aadhaar missing").map((v) => v.srNo)).toEqual(["2"]);
    expect(udisePendingList(views, NO_REASON_FILTER).map((v) => v.srNo)).toEqual(["4", "5", "6"]);
    expect(udisePendingList(views, "Other")).toEqual([]);
  });
  it("csv has a header, one line per row and no formula injection", () => {
    const csv = udisePendingCsv(udisePendingList(views, "Aadhaar missing"));
    expect(csv.split("\r\n")[0]).toBe("Class,Sr No,Name,GR No,UDISE Status,Reason,Note,PEN in UDISE import");
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});

describe("aadhaarPendingList", () => {
  const rows = aadhaarPendingList(buildStudentRecordViews(FEES, ADMS, UDS, []));
  it("lists blank Aadhaar and missing admissions, but not students who have one", () => {
    expect(rows.map((r) => r.srNo).sort()).toEqual(["2", "3", "4", "5", "6"]);
  });
  it("says explicitly when there is no admission row", () => {
    expect(rows.find((r) => r.srNo === "4")!.statusNote).toMatch(/No admission row found for GR-2026-99/);
    expect(rows.find((r) => r.srNo === "5")!.statusNote).toMatch(/no GR number/);
  });
  it("notes when the UDISE import already has the number", () => {
    expect(rows.find((r) => r.srNo === "2")!.statusNote).toMatch(/Aadhaar present in UDISE import/);
    expect(rows.find((r) => r.srNo === "6")!.statusNote).not.toMatch(/UDISE import/);
  });
  it("is sorted by class, with the Aadhaar text never exported", () => {
    expect(rows.map((r) => r.className)).toEqual(["Nursery", "2nd Std", "3rd Std", "5th Std", "10th Std"]);
    expect(aadhaarPendingCsv(rows)).not.toMatch(/9999|1234/);
  });
  it("pre-primary students still appear (Aadhaar applies to everyone)", () => {
    expect(rows.some((r) => r.className === "Nursery")).toBe(true);
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("l1\nl2")).toBe('"l1\nl2"');
  });
  it("neutralises formulas", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+91 98")).toBe("'+91 98");
    expect(csvCell("@x")).toBe("'@x");
  });
  it("renders nullish as empty and rows with CRLF", () => {
    expect(toCsv(["a", "b"], [["1", null], [2, undefined]])).toBe("a,b\r\n1,\r\n2,\r\n");
  });
});
