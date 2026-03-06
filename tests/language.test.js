import { describe, it, expect } from "vitest";
import fs from "fs";
import { loadXml, loadXmlFromText } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import { getObjectFromXML } from "@/utils/helpers.js";
import { serializeLanguage  } from "@/core/serialize.js";
import path from "path";


import { getFunctionsFromLanguage } from "../src/core/language.js";


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

