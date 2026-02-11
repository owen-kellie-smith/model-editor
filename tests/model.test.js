import { describe, it, expect,  beforeAll } from "vitest";
import fs from "fs";
import { loadXml } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import { validateModelCore } from "@/domain/model.js";
import { getFunctionsFromLanguage } from "@/domain/language.js";
import { serializeModel } from "@/domain/serializeModel.js";
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
      it("preserves model semantics", () => {
        const text = readFixture("model.xml");
        const first = validateModelCore(text, "model.xml", lang);
        const exportedText = serializeModel(first.obj);
        const second = validateModelCore(exportedText, "modelSerialized.xml", lang);
        expect(second.features.indexSets).toEqual(first.features.indexSets);
      });
    });
  });

  describe("when model is MM format", () => {
    describe("round trip through serializer", () => {
      it("preserves model semantics", () => {
        const text = readFixture("toyMM_L1.xml");
        const first = validateModelCore(text, "model.xml", lang);
        const exportedText = serializeModel(first.obj);
        const second = validateModelCore(exportedText, "modelSerialized.xml", lang);
        expect(second.features.indexSets).toEqual(first.features.indexSets);
      });
    });
  });

});




