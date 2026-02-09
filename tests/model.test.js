import { describe, it, expect } from "vitest";
import fs from "fs";
import { loadXml } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import path from "path";
import { validateModelCore } from "@/domain/model.js"
import { getFunctionsFromLanguage } from "@/domain/language.js";

describe("validateModelCore", () => {
  describe("when model contains a cycle", () => {
    it("throws an error", () => {
      const fixture = getFixture("language.xml");
      const xml = loadXml(fixture); 
      const lang = getFunctionsFromLanguage(xml, "test");
      const modelFile = getFixture("model.xml")



const text = fs.readFileSync(modelFile, "utf-8");
console.log(text.slice(0, 50));



      expect(() => {
        validateModelCore(text, "cycle.xml", lang)
      }).toThrow(/cycle/i)
    })
  })
})



