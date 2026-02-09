import { describe, it, expect } from "vitest";
import fs from "fs";
import { loadXml } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import path from "path";


import { getFunctionsFromLanguage } from "../docs/src/domain/language.js";


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
  });
});

