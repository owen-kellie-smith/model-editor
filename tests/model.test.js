import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import { loadXml } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import { validateModelCore } from "@/domain/model.js";
import { getFunctionsFromLanguage } from "@/domain/language.js";

describe("validateModelCore", () => {
  let lang;

  beforeAll(() => {
    const fixture = getFixture("language.xml");
    const xml = loadXml(fixture);
    lang = getFunctionsFromLanguage(xml, "test");
  });

  const readFixture = (name) =>
    fs.readFileSync(getFixture(name), "utf-8");

  it("throws when model contains a cycle", () => {
    const text = readFixture("modelCircular.xml");

    expect(() => {
      validateModelCore(text, "cycle.xml", lang);
    }).toThrow(/Circular/i);
  });

  it("does not throw when model has no cycle", () => {
    const text = readFixture("model.xml");

    expect(() => {
      validateModelCore(text, "cycle.xml", lang);
    }).not.toThrow();
  });
});




