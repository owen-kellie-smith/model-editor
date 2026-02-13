import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import { loadXml } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import { validateModelCore } from "@/domain/model.js";
import { getFunctionsFromLanguage } from "@/domain/language.js";
import { getGraphOfRelations } from "@/domain/graphRelations.js";
import { generateDot } from "@/domain/graphviz.js";

describe("GraphViz DOT Generation", () => {
  let lang;
  let modelFeatures;

  beforeAll(() => {
    // Load language
    const langFixture = getFixture("language.xml");
    const langXml = loadXml(langFixture);
    lang = getFunctionsFromLanguage(langXml, "test");

    // Load graph traversal model
    const modelText = fs.readFileSync(getFixture("modelGraphTraversal.xml"), "utf-8");
    const result = validateModelCore(modelText, "modelGraphTraversal.xml", lang);
    modelFeatures = result.features;
  });

  describe("generateDot", () => {
    it("generates valid DOT format with digraph declaration", () => {
      const graph = getGraphOfRelations(modelFeatures, "B", 1);
      const dot = generateDot(graph, "B");
      
      expect(typeof dot).toBe("string");
      expect(dot.includes("digraph dependencies {")).toBe(true);
      expect(dot.includes("}")).toBe(true);
    });

    it("highlights the root variable with filled color", () => {
      const graph = getGraphOfRelations(modelFeatures, "B", 1);
      const dot = generateDot(graph, "B");
      
      expect(dot.includes('"B" [style=filled, fillcolor=lightblue]')).toBe(true);
    });

    it("generates correct edges for depth 1 from B", () => {
      // Model: A = B + C; B = D; D = E
      // Relations at depth 1 from B: {B, D, A}
      // Expected edges: D -> B, B -> A
      const graph = getGraphOfRelations(modelFeatures, "B", 1);
      const dot = generateDot(graph, "B");
      
      expect(dot.includes('"D" -> "B"')).toBe(true);
      expect(dot.includes('"B" -> "A"')).toBe(true);
      expect(dot.includes('"E" -> "D"')).toBe(false); // E is not in depth 1
    });

    it("generates correct edges for depth 2 from B", () => {
      // Model: A = B + C; B = D; D = E
      // Relations at depth 2 from B: {B, D, A, E, C}
      // Expected edges: E -> D, D -> B, B -> A, C -> A
      const graph = getGraphOfRelations(modelFeatures, "B", 2);
      const dot = generateDot(graph, "B");
      
      expect(dot.includes('"E" -> "D"')).toBe(true);
      expect(dot.includes('"D" -> "B"')).toBe(true);
      expect(dot.includes('"B" -> "A"')).toBe(true);
      expect(dot.includes('"C" -> "A"')).toBe(true);
    });

    it("generates DOT with rankdir=LR for left-to-right layout", () => {
      const graph = getGraphOfRelations(modelFeatures, "B", 1);
      const dot = generateDot(graph, "B");
      
      expect(dot.includes("rankdir=LR")).toBe(true);
    });

    it("generates DOT with box-shaped nodes", () => {
      const graph = getGraphOfRelations(modelFeatures, "B", 1);
      const dot = generateDot(graph, "B");
      
      expect(dot.includes("node [shape=box]")).toBe(true);
    });

    it("handles isolated variable with no edges", () => {
      const graph = getGraphOfRelations(modelFeatures, "K", 5);
      const dot = generateDot(graph, "K");
      
      expect(dot.includes("digraph dependencies {")).toBe(true);
      expect(dot.includes('"K" [style=filled, fillcolor=lightblue]')).toBe(true);
      expect(dot.includes("}")).toBe(true);
      
      // Count arrow occurrences - should be 0 for isolated variable
      const arrowCount = (dot.match(/->/g) || []).length;
      expect(arrowCount).toBe(0);
    });

    it("generates DOT that is syntactically valid", () => {
      const graph = getGraphOfRelations(modelFeatures, "B", 2);
      const dot = generateDot(graph, "B");
      
      // Basic syntax checks
      expect(dot.startsWith("digraph dependencies {")).toBe(true);
      expect(dot.endsWith("}")).toBe(true);
      
      // Check that all lines with arrows have proper format
      const lines = dot.split("\n");
      for (const line of lines) {
        if (line.includes("->")) {
          // Should match pattern: "VAR1" -> "VAR2";
          expect(line).toMatch(/^\s*"[^"]+"\s*->\s*"[^"]+";$/);
        }
      }
    });
  });
});
