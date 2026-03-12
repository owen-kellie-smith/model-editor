import { describe, it, expect } from "vitest";
import fs from "fs";
import { getFixture } from "./helpers/fixtures.ts";
import { validateModelCore } from "@/core/model.js";
import { serializeModel } from "@/core/serialize.js";
import { log } from "@/utils/logger.js"

describe("validateModelCore", () => {

  const readFixture = (name) =>
    fs.readFileSync(getFixture(name), "utf-8");
  describe("when model contains a cycle",()=>{
    it("throws a 'has cycle' error", () => {
      const text = readFixture("modelCircular.xml");

      expect(() => {
        validateModelCore(text, "modelCircular.xml");
      }).toThrow(/Circular/i);
    });
  });

  describe("when model has no cycle",()=>{
    it("does not throw any error", () => {
      const text = readFixture("model.xml");

      expect(() => {
        validateModelCore(text, "model.xml");
      }).not.toThrow();
    });
  });

  describe("when model is MM format and has no cycle",()=>{
    it("does not throw any error", () => {
      const text = readFixture("toyMM_L1.xml");

      expect(() => {
        validateModelCore(text, "toyMM_L1.xml");
      }).not.toThrow();
    });
  });
  
  describe("when model is vendor format", () => {
    describe("round trip through serializer", () => {
      it("preserves model semantics though it changes xml", () => {
        const text = readFixture("model.xml");
        const first = validateModelCore(text, "model.xml");
        const exportedText = serializeModel(first.obj);
        const second = validateModelCore(exportedText, "modelSerialized.xml");
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
        const first = validateModelCore(text, "model.xml");
        const exportedText = serializeModel(first.obj);
        const second = validateModelCore(exportedText, "modelSerialized.xml");
        expect(second.features.indexSets).toEqual(first.features.indexSets);
        expect(text).not.toEqual(exportedText);
      });
    });
  });

  describe("when model contains duplicate variable identifiers", () => {
    it("throws a 'Duplicate variable' error", () => {
      const text = readFixture("modelDuplicateVariable.xml");

      expect(() => {
        validateModelCore(text, "modelDuplicateVariable.xml");
      }).toThrow(/Duplicate variable/i);
    });
  });

  describe("when model contains a variable with same name as a table", () => {
    it("throws a 'conflicts with table' error", () => {
      const text = readFixture("modelVariableTableNameConflict.xml");

      expect(() => {
        validateModelCore(text, "modelVariableTableNameConflict.xml");
      }).toThrow(/conflicts with table/i);
    });
  });

  describe("when model contains duplicate index set identifiers", () => {
    it("throws a 'Duplicate index set' error", () => {
      const text = readFixture("modelDuplicateIndexSet.xml");

      expect(() => {
        validateModelCore(text, "modelDuplicateIndexSet.xml");
      }).toThrow(/Duplicate index set/i);
    });
  });

  describe("when model contains incoming variables", () => {
    it("calculates incoming variables from formulae", () => {
      const text = readFixture("modelPrecedents.xml");
      const result = validateModelCore(text, "modelPrecedents.xml");
      
      // total_rate has formula: max(base_rate + spread, 0)
      // Expected incoming variables: BASE_RATE, SPREAD
      // NOT expected: MAX (standard function)
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
        validateModelCore(text, "modelVariableMissingUnit.xml");
      }).toThrow(/missing a unit/i);
    });
  });

  describe("when model contains a variable whose unit is not declared", () => {
    it("throws an 'not declared' error", () => {
      const text = readFixture("modelVariableUndeclaredUnit.xml");

      expect(() => {
        validateModelCore(text, "modelVariableUndeclaredUnit.xml");
      }).toThrow(/not declared/i);
    });
  });

  describe("when ignoreUnits option is set", () => {
    it("does not throw for a variable missing a unit", () => {
      const text = readFixture("modelVariableMissingUnit.xml");

      expect(() => {
        validateModelCore(text, "modelVariableMissingUnit.xml", null, { ignoreUnits: true });
      }).not.toThrow();
    });

    it("does not throw for a variable with an undeclared unit", () => {
      const text = readFixture("modelVariableUndeclaredUnit.xml");

      expect(() => {
        validateModelCore(text, "modelVariableUndeclaredUnit.xml", null, { ignoreUnits: true });
      }).not.toThrow();
    });
  });

  describe("when model contains outgoing variables", () => {
    it("calculates outgoing variables from formulae", () => {      const text = readFixture("modelPrecedents.xml");
      const result = validateModelCore(text, "modelPrecedents.xml");
      
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

  describe("when model declares custom functions in <functions>", () => {
    it("recognises declared custom functions and does not throw", () => {
      const text = `<?xml version="1.0"?>
<model id="functions-test">
  <indexSets/>
  <units><unit id="1"/></units>
  <functions>
    <function name="MyCustomFunc" arity="1"/>
  </functions>
  <variables>
    <variable id="x">
      <unit>1</unit>
      <definition type="expression">MyCustomFunc(42)</definition>
    </variable>
  </variables>
</model>`;
      expect(() => validateModelCore(text, "functions-test.xml")).not.toThrow();
    });

    it("throws for an unknown function not in standard functions or model functions", () => {
      const text = `<?xml version="1.0"?>
<model id="functions-test">
  <indexSets/>
  <units><unit id="1"/></units>
  <variables>
    <variable id="x">
      <unit>1</unit>
      <definition type="expression">UnknownFunc(42)</definition>
    </variable>
  </variables>
</model>`;
      expect(() => validateModelCore(text, "functions-test.xml")).toThrow(/Missing reference/i);
    });

    it("recognises standard functions (floor, ceil, min, max, sum, if, etc.) without declaration", () => {
      const text = `<?xml version="1.0"?>
<model id="std-functions-test">
  <indexSets/>
  <units><unit id="1"/></units>
  <variables>
    <variable id="a">
      <unit>1</unit>
      <definition type="expression">5</definition>
    </variable>
    <variable id="b">
      <unit>1</unit>
      <definition type="expression">3</definition>
    </variable>
    <variable id="result">
      <unit>1</unit>
      <definition type="expression">max(floor(a), min(b, if(a, b, 0)))</definition>
    </variable>
  </variables>
</model>`;
      expect(() => validateModelCore(text, "std-functions-test.xml")).not.toThrow();
    });
  });

});




