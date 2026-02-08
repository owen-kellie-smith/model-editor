import { describe, it, expect } from "vitest";
import fs from "fs";
import { loadXml } from "./xml.js";


import { getFunctionsFromLanguage } from "../docs/src/domain/language.js";


describe("language loading", () => {
  it("reads functions from XML", () => {
    const xml = loadXml("docs/examples/language.xml"); // adjust if path differs
    const lang = getFunctionsFromLanguage(xml, "test");

    expect(lang.functions.size).toBeGreaterThan(0);
  });
});

