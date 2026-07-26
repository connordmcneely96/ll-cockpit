import { describe, it, expect } from "vitest";
import {
  hasEngineeringValues,
  extractCitedDocs,
  countCitationMarkers,
  evaluateGrounding,
  FORMULA_KEYWORDS_RE,
  VALUE_WITH_UNIT_RE,
} from "./grounding";

describe("FORMULA_KEYWORDS_RE — the previously-dead forms now match", () => {
  it("matches `=` formula forms", () => {
    expect(FORMULA_KEYWORDS_RE.test("t = PD / (2(SE + PY))")).toBe(true);
    expect(FORMULA_KEYWORDS_RE.test("P = F / A")).toBe(true);
  });
  it("matches bare Greek stress symbols", () => {
    expect(FORMULA_KEYWORDS_RE.test("σ_c")).toBe(true);
    expect(FORMULA_KEYWORDS_RE.test("τ_max")).toBe(true);
  });
  it("matches subscript identifiers that already worked", () => {
    expect(FORMULA_KEYWORDS_RE.test("NPSH")).toBe(true);
    expect(FORMULA_KEYWORDS_RE.test("L_10 bearing life")).toBe(true);
  });
  it("does NOT match ordinary prose", () => {
    expect(FORMULA_KEYWORDS_RE.test("the value is set")).toBe(false);
    expect(FORMULA_KEYWORDS_RE.test("as we discussed")).toBe(false);
  });
});

describe("hasEngineeringValues", () => {
  it("true for a value with a unit", () => {
    expect(hasEngineeringValues("allowable stress is 20000 psi")).toBe(true);
    expect(VALUE_WITH_UNIT_RE.test("20000 psi")).toBe(true);
  });
  it("true for a formula", () => {
    expect(hasEngineeringValues("t = PD / (2(SE + PY))")).toBe(true);
  });
  it("false for plain prose", () => {
    expect(hasEngineeringValues("as we discussed earlier")).toBe(false);
  });
});

describe("extractCitedDocs", () => {
  it("parses [doc §section] citations and dedupes", () => {
    expect(extractCitedDocs("per [B31.3_piping §304.1.2]")).toEqual(["B31.3_piping"]);
    expect(
      extractCitedDocs("[B31.3_piping §304.1.2] and again [B31.3_piping §305]"),
    ).toEqual(["B31.3_piping"]);
  });
  it("returns [] when there are no citations", () => {
    expect(extractCitedDocs("no citation here")).toEqual([]);
  });
});

describe("evaluateGrounding", () => {
  it("rule 1: insufficient-sources answer is not rejected even with 0 sources", () => {
    const r = evaluateGrounding({
      answerText: "Insufficient sources: the provided chunks do not cover this question.",
      sources: [],
      isInsufficient: true,
    });
    expect(r.rejected).toBe(false);
    expect(r.reject_reason).toBeNull();
  });

  it("rule 2: plain prose with no values and 0 sources is not rejected", () => {
    const r = evaluateGrounding({
      answerText: "That depends on the application; please clarify the design intent.",
      sources: [],
      isInsufficient: false,
    });
    expect(r.rejected).toBe(false);
    expect(r.reject_reason).toBeNull();
  });

  it("rule 3: values with 0 sources → REJECTED (the outage case)", () => {
    const r = evaluateGrounding({
      answerText: "t = PD / (2(SE + PY))",
      sources: [],
      isInsufficient: false,
    });
    expect(r.rejected).toBe(true);
    expect(r.reject_reason).toContain("no sources were retrieved");
  });

  it("rule 4: values + sources but zero citations → REJECTED", () => {
    const r = evaluateGrounding({
      answerText: "The wall thickness is 12.5 mm for this service.",
      sources: [{ doc: "B31.3_piping" }],
      isInsufficient: false,
    });
    expect(r.rejected).toBe(true);
    expect(r.reject_reason).toContain("without any [doc §section] citation");
  });

  it("grounded: cited doc is in the retrieved set → NOT rejected", () => {
    const r = evaluateGrounding({
      answerText: "Use t = PD / (2(SE + PY)) [B31.3_piping §304.1.2].",
      sources: [{ doc: "B31.3_piping" }],
      isInsufficient: false,
    });
    expect(r.rejected).toBe(false);
    expect(r.reject_reason).toBeNull();
  });

  it("rule 5: cited doc absent from retrieved sources → REJECTED, names the doc", () => {
    const r = evaluateGrounding({
      answerText: "Fatigue limit is σ_e per [MIL_HDBK_5 §3.2].",
      sources: [{ doc: "B31.3_piping" }],
      isInsufficient: false,
    });
    expect(r.rejected).toBe(true);
    expect(r.reject_reason).toContain("MIL_HDBK_5");
  });

  it("rule 5: multiple citations, only the unknown one is named", () => {
    const r = evaluateGrounding({
      answerText:
        "Thickness t = PD/(2SE) [B31.3_piping §304.1.2]; fatigue σ_e [MIL_HDBK_5 §3.2].",
      sources: [{ doc: "B31.3_piping" }],
      isInsufficient: false,
    });
    expect(r.rejected).toBe(true);
    expect(r.reject_reason).toContain("MIL_HDBK_5");
    expect(r.reject_reason).not.toContain("B31.3_piping");
  });
});

describe("citation parsing — both shapes and multi-doc groups (S1a-GUARD-FIX)", () => {
  it("REGRESSION PIN: the real doc= string the model emits", () => {
    const s = "[doc=pump_hydraulic_design §6, pump_shaft_mechanical_design §(c)]";
    expect(extractCitedDocs(s)).toEqual([
      "pump_hydraulic_design",
      "pump_shaft_mechanical_design",
    ]);
    expect(countCitationMarkers(s)).toBe(1);
  });

  it("bare form parses and counts", () => {
    expect(extractCitedDocs("[B31.3_piping §304.1.2]")).toEqual(["B31.3_piping"]);
    expect(countCitationMarkers("[B31.3_piping §304.1.2]")).toBe(1);
  });

  it("section-only form is a marker but names no doc", () => {
    expect(extractCitedDocs("[§304.1.1]")).toEqual([]);
    expect(countCitationMarkers("[§304.1.1]")).toBe(1);
  });

  it("mixed bare + doc= citations → both docs, two markers", () => {
    const s = "see [B31.3_piping §304.1.2] and [doc=pump_hydraulic_design §6]";
    expect(extractCitedDocs(s)).toEqual(["B31.3_piping", "pump_hydraulic_design"]);
    expect(countCitationMarkers(s)).toBe(2);
  });

  it("no brackets at all → no docs, no markers", () => {
    expect(extractCitedDocs("plain prose without citations")).toEqual([]);
    expect(countCitationMarkers("plain prose without citations")).toBe(0);
  });
});

describe("evaluateGrounding — doc= citations are grounded (the production bug)", () => {
  it("GROUNDED: values + doc= citation whose doc is retrieved → NOT rejected", () => {
    const r = evaluateGrounding({
      answerText: "Wall thickness t = PD / (2(SE + PY)) [doc=B31.3_piping §304.1.2].",
      sources: [{ doc: "B31.3_piping" }],
      isInsufficient: false,
    });
    expect(r.rejected).toBe(false);
    expect(r.reject_reason).toBeNull();
  });

  it("FABRICATED: values + doc= citation naming a doc not retrieved → REJECTED (rule 5)", () => {
    const r = evaluateGrounding({
      answerText: "Fatigue limit σ_e is governed by [doc=MIL_HDBK_5 §3.2].",
      sources: [{ doc: "B31.3_piping" }],
      isInsufficient: false,
    });
    expect(r.rejected).toBe(true);
    expect(r.reject_reason).toContain("MIL_HDBK_5");
  });

  it("NO CITATIONS: values + prose with zero brackets + sources present → REJECTED (rule 4)", () => {
    const r = evaluateGrounding({
      answerText: "The required wall thickness is 12.5 mm for this line.",
      sources: [{ doc: "B31.3_piping" }],
      isInsufficient: false,
    });
    expect(r.rejected).toBe(true);
    expect(r.reject_reason).toContain("without any [doc §section] citation");
  });
});
