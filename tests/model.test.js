import { describe, it, expect,  beforeAll } from "vitest";
import fs from "fs";
import { loadXml } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import { validateModelCore, splitTopLevelAddends, isPureVariableCall, buildUnitCompatibilityChecker } from "@/core/model.js";
import { getFunctionsFromLanguage, getUnitEquivalencesFromLanguage } from "@/core/language.js";
import { serializeModel } from "@/core/serialize.js";
import { log } from "@/utils/logger.js"

// ---------------------------------------------------------------------------
// Low-level helper unit tests
// ---------------------------------------------------------------------------

describe("splitTopLevelAddends", () => {
  it("returns single element for expression with no addition", () => {
    expect(splitTopLevelAddends("A * B")).toEqual(["A * B"]);
  });

  it("splits a simple sum", () => {
    expect(splitTopLevelAddends("A + B")).toEqual(["A", "+ B"]);
  });

  it("splits subtraction", () => {
    expect(splitTopLevelAddends("A - B")).toEqual(["A", "- B"]);
  });

  it("does not split + inside parentheses", () => {
    expect(splitTopLevelAddends("(1 + r) ^ n")).toEqual(["(1 + r) ^ n"]);
  });

  it("handles leading unary minus", () => {
    expect(splitTopLevelAddends("-A + B")).toEqual(["-A", "+ B"]);
  });

  it("handles function-call arguments containing +", () => {
    // The + inside max(...) is at depth 1
    expect(splitTopLevelAddends("max(a + b, 0)")).toEqual(["max(a + b, 0)"]);
  });
});

describe("isPureVariableCall", () => {
  it("accepts a plain identifier", () => {
    expect(isPureVariableCall("step_length")).toBe(true);
  });

  it("accepts an identifier with argument list", () => {
    expect(isPureVariableCall("current_age(cohort)")).toBe(true);
  });

  it("accepts a term with leading sign", () => {
    expect(isPureVariableCall("+ annual_annuity_amount(cohort)")).toBe(true);
    expect(isPureVariableCall("-annual_annuity_amount(cohort)")).toBe(true);
  });

  it("rejects a product term", () => {
    expect(isPureVariableCall("step * step_length")).toBe(false);
  });

  it("rejects a numeric literal", () => {
    expect(isPureVariableCall("42")).toBe(false);
    expect(isPureVariableCall("+ 0")).toBe(false);
  });

  it("rejects a comparison expression", () => {
    expect(isPureVariableCall("attained_age(cohort, step) >= annuity_start_age(cohort)")).toBe(false);
  });
});

describe("buildUnitCompatibilityChecker", () => {
  it("treats identical units as compatible", () => {
    const { areCompatible } = buildUnitCompatibilityChecker(new Map(), []);
    expect(areCompatible("GBP", "GBP")).toBe(true);
  });

  it("treats different units with no rules as incompatible", () => {
    const { areCompatible } = buildUnitCompatibilityChecker(new Map(), []);
    expect(areCompatible("GBP", "years")).toBe(false);
  });

  it("treats units linked by a rule as compatible", () => {
    const { areCompatible } = buildUnitCompatibilityChecker(new Map(), [["DAYS", "S"]]);
    expect(areCompatible("DAYS", "S")).toBe(true);
  });

  it("transitively connects units through a chain of rules", () => {
    // years → days → s
    const pairs = [["DAYS", "S"], ["YEARS", "DAYS"]];
    const { areCompatible } = buildUnitCompatibilityChecker(new Map(), pairs);
    expect(areCompatible("YEARS", "S")).toBe(true);
  });

  it("groups units sharing the same dimension attribute", () => {
    const unitsMap = new Map([
      ["PERCENT", { id: "PERCENT", dimension: "rate" }],
      ["BPS",     { id: "BPS",     dimension: "rate" }],
    ]);
    const { areCompatible } = buildUnitCompatibilityChecker(unitsMap, []);
    expect(areCompatible("PERCENT", "BPS")).toBe(true);
    expect(areCompatible("PERCENT", "GBP")).toBe(false);
  });
});

describe("getUnitEquivalencesFromLanguage", () => {
  let xmlDoc;
  beforeAll(() => {
    xmlDoc = loadXml(getFixture("language.xml"));
  });

  it("returns an array of [unitA, unitB] pairs from <unitRules>", () => {
    const pairs = getUnitEquivalencesFromLanguage(xmlDoc);
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("includes a rule linking days to s (seconds)", () => {
    const pairs = getUnitEquivalencesFromLanguage(xmlDoc);
    const found = pairs.some(([a, b]) =>
      (a === "DAYS" && b === "S") || (a === "S" && b === "DAYS")
    );
    expect(found).toBe(true);
  });

  it("includes the years→days rule", () => {
    const pairs = getUnitEquivalencesFromLanguage(xmlDoc);
    const found = pairs.some(([a, b]) =>
      (a === "YEARS" && b === "DAYS") || (a === "DAYS" && b === "YEARS")
    );
    expect(found).toBe(true);
  });
});

describe("validateModelCore", () => {
  let lang;

  beforeAll(() => {
    const fixture = getFixture("language.xml");
    const xml = loadXml(fixture);
    lang = getFunctionsFromLanguage(xml, "test");
  });

  const readFixture = (name) =>
    fs.readFileSync(getFixture(name), "utf-8");
  describe("when model contains a cycle",()=>{
    it("throws a 'has cycle' error", () => {
      const text = readFixture("modelCircular.xml");

      expect(() => {
        validateModelCore(text, "modelCircular.xml", lang);
      }).toThrow(/Circular/i);
    });
  });

  describe("when model has no cycle",()=>{
    it("does not throw any error", () => {
      const text = readFixture("model.xml");

      expect(() => {
        validateModelCore(text, "model.xml", lang);
      }).not.toThrow();
    });
  });

  describe("when model is MM format and has no cycle",()=>{
    it("does not throw any error", () => {
      const text = readFixture("toyMM_L1.xml");

      expect(() => {
        validateModelCore(text, "toyMM_L1.xml", lang);
      }).not.toThrow();
    });
  });
  
  describe("when model is vendor format", () => {
    describe("round trip through serializer", () => {
      it("preserves model semantics though it changes xml", () => {
        const text = readFixture("model.xml");
        const first = validateModelCore(text, "model.xml", lang);
        const exportedText = serializeModel(first.obj);
        const second = validateModelCore(exportedText, "modelSerialized.xml", lang);
        expect(second.features.indexSets).toEqual(first.features.indexSets);
        expect(second.features.variables).toEqual(first.features.variables);
        expect(second.features.resolvedVarsWithArguments).toEqual(first.features.resolvedVarsWithArguments);
        expect(second.features.incoming).toEqual(first.features.incoming);
        expect(second.features.outgoing).toEqual(first.features.outgoing);
        expect(text).not.toEqual(exportedText);
      });
    });
  });

  describe("when model is MM format", () => {
    describe("round trip through serializer", () => {
      it("preserves model semantics though it changes xml", () => {
        const text = readFixture("toyMM_L1.xml");
        const first = validateModelCore(text, "model.xml", lang);
        const exportedText = serializeModel(first.obj);
        const second = validateModelCore(exportedText, "modelSerialized.xml", lang);
        expect(second.features.indexSets).toEqual(first.features.indexSets);
        expect(text).not.toEqual(exportedText);
      });
    });
  });

  describe("when model contains duplicate variable identifiers", () => {
    it("throws a 'Duplicate variable' error", () => {
      const text = readFixture("modelDuplicateVariable.xml");

      expect(() => {
        validateModelCore(text, "modelDuplicateVariable.xml", lang);
      }).toThrow(/Duplicate variable/i);
    });
  });

  describe("when model contains a variable with same name as a table", () => {
    it("throws a 'conflicts with table' error", () => {
      const text = readFixture("modelVariableTableNameConflict.xml");

      expect(() => {
        validateModelCore(text, "modelVariableTableNameConflict.xml", lang);
      }).toThrow(/conflicts with table/i);
    });
  });

  describe("when model contains duplicate index set identifiers", () => {
    it("throws a 'Duplicate index set' error", () => {
      const text = readFixture("modelDuplicateIndexSet.xml");

      expect(() => {
        validateModelCore(text, "modelDuplicateIndexSet.xml", lang);
      }).toThrow(/Duplicate index set/i);
    });
  });

  describe("when model contains incoming variables", () => {
    it("calculates incoming variables from formulae", () => {
      const text = readFixture("modelPrecedents.xml");
      const result = validateModelCore(text, "modelPrecedents.xml", lang);
      
      // total_rate has formula: max(base_rate + spread, 0)
      // Expected incoming variables: BASE_RATE, SPREAD
      // NOT expected: MAX (language function)
      const totalRateIncoming = result.features.incoming.get("TOTAL_RATE");
      
      expect(totalRateIncoming).toBeDefined();
      expect(totalRateIncoming.size).toBe(2);
      
      // Convert Set to array and extract names
      const incomingArray = Array.from(totalRateIncoming);
      const incomingNames = incomingArray.map(d => d.name);
      
      // Check that both variables are present
      expect(incomingNames.includes("BASE_RATE")).toBe(true);
      expect(incomingNames.includes("SPREAD")).toBe(true);
      // Check that the function MAX is not present
      expect(incomingNames.includes("MAX")).toBe(false);

    });
  });

  describe("when model contains a variable with no unit", () => {
    it("throws a 'missing a unit' error", () => {
      const text = readFixture("modelVariableMissingUnit.xml");

      expect(() => {
        validateModelCore(text, "modelVariableMissingUnit.xml", lang);
      }).toThrow(/missing a unit/i);
    });
  });

  describe("when model contains a variable whose unit is not declared", () => {
    it("throws an 'not declared' error", () => {
      const text = readFixture("modelVariableUndeclaredUnit.xml");

      expect(() => {
        validateModelCore(text, "modelVariableUndeclaredUnit.xml", lang);
      }).toThrow(/not declared/i);
    });
  });

  describe("when ignoreUnits option is set", () => {
    it("does not throw for a variable missing a unit", () => {
      const text = readFixture("modelVariableMissingUnit.xml");

      expect(() => {
        validateModelCore(text, "modelVariableMissingUnit.xml", lang, { ignoreUnits: true });
      }).not.toThrow();
    });

    it("does not throw for a variable with an undeclared unit", () => {
      const text = readFixture("modelVariableUndeclaredUnit.xml");

      expect(() => {
        validateModelCore(text, "modelVariableUndeclaredUnit.xml", lang, { ignoreUnits: true });
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Dimensional consistency (additive expression unit checking)
  // ---------------------------------------------------------------------------

  describe("additive unit consistency", () => {
    it("throws when two pure-variable-call addends have incompatible units", () => {
      const text = readFixture("modelUnitMismatch.xml");

      expect(() => {
        validateModelCore(text, "modelUnitMismatch.xml", lang);
      }).toThrow(/unit mismatch in addition/i);
    });

    it("accepts addition of units that are equivalent via language.xml rules (years + days → both time)", () => {
      const text = readFixture("modelUnitEquivalent.xml");

      expect(() => {
        validateModelCore(text, "modelUnitEquivalent.xml", lang);
      }).not.toThrow();
    });

    it("accepts addition of units that share the same model-level dimension attribute", () => {
      const text = readFixture("modelUnitDimensionAttr.xml");

      expect(() => {
        validateModelCore(text, "modelUnitDimensionAttr.xml", lang);
      }).not.toThrow();
    });

    it("does not throw for incompatible addends when ignoreUnits is set", () => {
      const text = readFixture("modelUnitMismatch.xml");

      expect(() => {
        validateModelCore(text, "modelUnitMismatch.xml", lang, { ignoreUnits: true });
      }).not.toThrow();
    });

    it("accepts expressions where product terms appear alongside variable calls (no spurious errors)", () => {
      // current_age(cohort) + step * step_length — step * step_length is not a pure
      // var call so only one var-call addend is found → no check is triggered.
      const text = readFixture("model.xml");

      expect(() => {
        validateModelCore(text, "model.xml", lang);
      }).not.toThrow();
    });
  });

  describe("when model contains outgoing variables", () => {
    it("calculates outgoing variables from formulae", () => {      const text = readFixture("modelPrecedents.xml");
      const result = validateModelCore(text, "modelPrecedents.xml", lang);
      
      // In modelPrecedents.xml:
      // - base_rate = 0.05 (no incoming variables)
      // - spread = 0.02 (no incoming variables)
      // - total_rate = max(base_rate + spread, 0) (incoming: base_rate, spread)
      // 
      // Expected outgoing variables (inverse of incoming):
      // - base_rate should have total_rate as an outgoing variable
      // - spread should have total_rate as an outgoing variable
      // - total_rate should have no outgoing variables
      
      expect(result.features.outgoing).toBeDefined();
      
      const baseRateOutgoing = result.features.outgoing.get("BASE_RATE");
      expect(baseRateOutgoing).toBeDefined();
      expect(baseRateOutgoing.size).toBe(1);
      const baseRateOutgoingNames = Array.from(baseRateOutgoing).map(d => d.name);
      expect(baseRateOutgoingNames.includes("TOTAL_RATE")).toBe(true);
      
      const spreadOutgoing = result.features.outgoing.get("SPREAD");
      expect(spreadOutgoing).toBeDefined();
      expect(spreadOutgoing.size).toBe(1);
      const spreadOutgoingNames = Array.from(spreadOutgoing).map(d => d.name);
      expect(spreadOutgoingNames.includes("TOTAL_RATE")).toBe(true);
      
      const totalRateOutgoing = result.features.outgoing.get("TOTAL_RATE");
      expect(totalRateOutgoing).toBeDefined();
      expect(totalRateOutgoing.size).toBe(0);
    });
  });

});




