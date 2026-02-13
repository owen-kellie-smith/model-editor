import { describe, it, expect,  beforeAll } from "vitest";
import fs from "fs";
import { loadXml } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import { validateModelCore } from "@/domain/model.js";
import { getFunctionsFromLanguage } from "@/domain/language.js";
import { serializeModel } from "@/domain/serialize.js";
import { log } from "@/utils/logger.js"

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
        expect(second.features.dependencies).toEqual(first.features.dependencies);
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

  describe("when model contains duplicate index set identifiers", () => {
    it("throws a 'Duplicate index set' error", () => {
      const text = readFixture("modelDuplicateIndexSet.xml");

      expect(() => {
        validateModelCore(text, "modelDuplicateIndexSet.xml", lang);
      }).toThrow(/Duplicate index set/i);
    });
  });

  describe("when model contains precedents", () => {
    it("calculates variable precedents from formulae", () => {
      const text = readFixture("modelPrecedents.xml");
      const result = validateModelCore(text, "modelPrecedents.xml", lang);
      
      // total_rate has formula: max(base_rate + spread, 0)
      // Expected precedents: BASE_RATE, SPREAD
      // NOT expected: MAX (language function)
      const totalRateDeps = result.features.dependencies.get("TOTAL_RATE");
      
      expect(totalRateDeps).toBeDefined();
      expect(totalRateDeps.size).toBe(2);
      
      // Convert Set to array and extract names
      const depArray = Array.from(totalRateDeps);
      const depNames = depArray.map(d => d.name);
      
      // Check that both variables are present
      expect(depNames.includes("BASE_RATE")).toBe(true);
      expect(depNames.includes("SPREAD")).toBe(true);
      // Check that the function MAX is not present
      expect(depNames.includes("MAX")).toBe(false);

    });
  });

  describe("when model contains dependents", () => {
    it("calculates variable dependents from formulae", () => {
      const text = readFixture("modelPrecedents.xml");
      const result = validateModelCore(text, "modelPrecedents.xml", lang);
      
      // In modelPrecedents.xml:
      // - base_rate = 0.05 (no precedents)
      // - spread = 0.02 (no precedents)
      // - total_rate = max(base_rate + spread, 0) (precedents: base_rate, spread)
      // 
      // Expected dependents (inverse of precedents):
      // - base_rate should have total_rate as a dependent
      // - spread should have total_rate as a dependent
      // - total_rate should have no dependents
      
      expect(result.features.dependents).toBeDefined();
      
      const baseRateDependents = result.features.dependents.get("BASE_RATE");
      expect(baseRateDependents).toBeDefined();
      expect(baseRateDependents.size).toBe(1);
      const baseRateDependentNames = Array.from(baseRateDependents).map(d => d.name);
      expect(baseRateDependentNames.includes("TOTAL_RATE")).toBe(true);
      
      const spreadDependents = result.features.dependents.get("SPREAD");
      expect(spreadDependents).toBeDefined();
      expect(spreadDependents.size).toBe(1);
      const spreadDependentNames = Array.from(spreadDependents).map(d => d.name);
      expect(spreadDependentNames.includes("TOTAL_RATE")).toBe(true);
      
      const totalRateDependents = result.features.dependents.get("TOTAL_RATE");
      expect(totalRateDependents).toBeDefined();
      expect(totalRateDependents.size).toBe(0);
    });
  });

});




