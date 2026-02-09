import { describe, it, expect } from "vitest";
import fs from "fs";
import { loadXml } from "./xml.js";
import path from "path";


import { getFunctionsFromLanguage } from "../docs/src/domain/language.js";


describe("language loading", () => {
  it("reads functions from XML", () => {
    const fixture = path.join(__dirname, "fixtures", "language.xml");
    const xml = loadXml(fixture); // adjust if path differs
    const lang = getFunctionsFromLanguage(xml, "test");

    expect(lang.functions.size).toBeGreaterThan(0);
  });
});

