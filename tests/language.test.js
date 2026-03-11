import { describe, it, expect } from "vitest";
import fs from "fs";
import { loadXml, loadXmlFromText } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import { getObjectFromXML } from "@/utils/helpers.js";
import { serializeLanguage  } from "@/core/serialize.js";
import path from "path";


import { getFunctionsFromLanguage, getFunctionsFromModelObj, standardFunctions } from "../src/core/language.js";


describe("language loading", () => {
  describe("when XML is valid", () => {
    describe("when XML has functions with names and arity", () => {
      it("reads functions from XML", () => {
        const fixture = getFixture("language.xml");
        const xml = loadXml(fixture); 
        const lang = getFunctionsFromLanguage(xml, "test");
        expect(lang.functions.size)
          .toBeGreaterThan(0);
      });
    });
    describe("when XML has a function with no name", () => {
      it("throws an error", () => {
        const fixture = getFixture("languageNoName.xml");
        const xml = loadXml(fixture); 
        expect(() => getFunctionsFromLanguage(xml, "test"))
          .toThrow(/function without name/i);
      });
    });
    describe("when XML has a function with non-numeric arity", () => {
      it("throws an error", () => {
        const fixture = getFixture("languageNaNArity.xml");
        const xml = loadXml(fixture); 
        expect(() => getFunctionsFromLanguage(xml, "test"))
          .toThrow(/Invalid function/i);
      });
    });
    describe("when vendor format language is loaded and exported", () => {
      it("preserves language functions though it changes xml", () => {
        const fixture = getFixture("language.xml");
        const xml = loadXml(fixture); 
        const obj = getObjectFromXML(xml);
        const xml2Text = serializeLanguage(obj);
        const xml2 = loadXmlFromText(xml2Text);
        expect(xml2).not.toEqual(xml);
        const lang = getFunctionsFromLanguage(xml, "test");
        const lang2 = getFunctionsFromLanguage(xml2, "test");
        expect(lang2).toEqual(lang);
      });
    });
  });
});

describe("standardFunctions", () => {
  it("is a Map", () => {
    expect(standardFunctions).toBeInstanceOf(Map);
  });

  it("includes core numeric functions", () => {
    expect(standardFunctions.has("FLOOR")).toBe(true);
    expect(standardFunctions.has("CEIL")).toBe(true);
    expect(standardFunctions.has("ABS")).toBe(true);
    expect(standardFunctions.has("SQRT")).toBe(true);
    expect(standardFunctions.has("LOG")).toBe(true);
    expect(standardFunctions.has("EXP")).toBe(true);
  });

  it("includes trigonometric functions", () => {
    expect(standardFunctions.has("SIN")).toBe(true);
    expect(standardFunctions.has("COS")).toBe(true);
    expect(standardFunctions.has("TAN")).toBe(true);
    expect(standardFunctions.has("ASIN")).toBe(true);
    expect(standardFunctions.has("ACOS")).toBe(true);
    expect(standardFunctions.has("ATAN")).toBe(true);
  });

  it("includes aggregate functions min, max, and sum over an index", () => {
    expect(standardFunctions.has("MIN")).toBe(true);
    expect(standardFunctions.has("MAX")).toBe(true);
    expect(standardFunctions.has("SUM")).toBe(true);
  });

  it("includes conditional if", () => {
    expect(standardFunctions.has("IF")).toBe(true);
  });
});

describe("getFunctionsFromModelObj", () => {
  it("returns standard functions when model has no <functions> section", () => {
    const obj = { model: { id: "test" } };
    const lang = getFunctionsFromModelObj(obj);
    expect(lang.functions).toBeInstanceOf(Map);
    expect(lang.functions.has("FLOOR")).toBe(true);
    expect(lang.functions.has("SUM")).toBe(true);
  });

  it("merges model-declared functions with standard functions", () => {
    const obj = {
      model: {
        functions: {
          function: { name: "GetModelPoint", arity: "1" }
        }
      }
    };
    const lang = getFunctionsFromModelObj(obj);
    expect(lang.functions.has("GETMODELPOINT")).toBe(true);
    expect(lang.functions.has("FLOOR")).toBe(true); // standard still present
  });

  it("handles an array of model-declared functions", () => {
    const obj = {
      model: {
        functions: {
          function: [
            { name: "FuncA", arity: "1" },
            { name: "FuncB", minArgs: "2" }
          ]
        }
      }
    };
    const lang = getFunctionsFromModelObj(obj);
    expect(lang.functions.has("FUNCA")).toBe(true);
    expect(lang.functions.has("FUNCB")).toBe(true);
  });

  it("throws when a declared function has no name", () => {
    const obj = {
      model: {
        functions: {
          function: { arity: "1" }  // no name
        }
      }
    };
    expect(() => getFunctionsFromModelObj(obj)).toThrow(/function without name/i);
  });

  it("stores an optional definition on the function entry", () => {
    const definition = { type: "expression", "#text": "x * 2" };
    const obj = {
      model: {
        functions: {
          function: { name: "MyFunc", arity: "1", definition }
        }
      }
    };
    const lang = getFunctionsFromModelObj(obj);
    expect(lang.functions.get("MYFUNC").definition).toEqual(definition);
  });
});

