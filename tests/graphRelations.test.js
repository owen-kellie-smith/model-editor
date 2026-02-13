import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import { loadXml } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import { validateModelCore } from "@/domain/model.js";
import { getFunctionsFromLanguage } from "@/domain/language.js";
import { getRelations, getGraphOfRelations } from "@/domain/graphRelations.js";

describe("Graph Relations", () => {
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

  describe("getRelations", () => {
    describe("when depth is 0", () => {
      it("returns empty set for non-self-referential variable", () => {
        const relations = getRelations(modelFeatures, "B", 0);
        
        expect(relations).toBeDefined();
        expect(relations.size).toBe(0);
      });
    });

    describe("when depth is 1", () => {
      it("returns immediate incoming and outgoing variables (not including root)", () => {
        // For variable B in the test model:
        // - B = D (so D is incoming to B)
        // - A = B + C (so A is outgoing from B)
        // B itself should NOT be included unless it references itself
        const relations = getRelations(modelFeatures, "B", 1);
        
        expect(relations).toBeDefined();
        expect(relations.size).toBe(2);
        expect(relations.has("B")).toBe(false); // root not included
        expect(relations.has("D")).toBe(true); // incoming
        expect(relations.has("A")).toBe(true); // outgoing
      });
    });

    describe("when depth is 2", () => {
      it("returns variables up to 2 steps away from root", () => {
        // For variable B with depth 2:
        // Depth 1: D (incoming to B), A (outgoing from B)
        // Depth 2: E (incoming to D), C (incoming to A, since A = B + C)
        // B itself is not included
        const relations = getRelations(modelFeatures, "B", 2);
        
        expect(relations).toBeDefined();
        expect(relations.size).toBe(4);
        expect(relations.has("B")).toBe(false); // root not included
        expect(relations.has("D")).toBe(true);
        expect(relations.has("A")).toBe(true);
        expect(relations.has("E")).toBe(true); // incoming to D
        expect(relations.has("C")).toBe(true); // incoming to A
      });
    });

    describe("when depth is high", () => {
      it("returns all connected variables in the component (excluding root)", () => {
        // With high depth, should get all variables in the connected component
        // Starting from B: D, E (chain going back), A, C (chain going forward)
        // B itself is not included
        const relations = getRelations(modelFeatures, "B", 10);
        
        expect(relations).toBeDefined();
        expect(relations.size).toBe(4);
        expect(relations.has("B")).toBe(false); // root not included
        expect(relations.has("D")).toBe(true);
        expect(relations.has("E")).toBe(true);
        expect(relations.has("A")).toBe(true);
        expect(relations.has("C")).toBe(true);
        
        // Should not include variables from other components
        expect(relations.has("F")).toBe(false);
        expect(relations.has("G")).toBe(false);
        expect(relations.has("K")).toBe(false);
      });
    });

    describe("when starting from an isolated variable", () => {
      it("returns empty set regardless of depth", () => {
        const relations = getRelations(modelFeatures, "K", 5);
        
        expect(relations).toBeDefined();
        expect(relations.size).toBe(0);
      });
    });
  });

  describe("getGraphOfRelations", () => {
    describe("when depth is 1 from variable B", () => {
      it("returns variables and their outgoing connections limited to the relation set", () => {
        // From problem statement example:
        // Model: A = B + C; B = D; D = E
        // getGraphOfRelations(model, B, 1) should show:
        // Relations at depth 1 from B: {D, A} (not including B itself)
        // Outgoing edges (limited to relations):
        //   - D -> B (but B is not in relations, so this won't be included in edges)
        //   - A -> nothing in the set
        // Since B is not in the relations, edges referencing it are filtered out
        
        const graph = getGraphOfRelations(modelFeatures, "B", 1);
        
        expect(graph).toBeDefined();
        expect(graph.variables).toBeDefined();
        expect(graph.edges).toBeDefined();
        
        // Should have the same variables as getRelations (D and A, not B)
        expect(graph.variables.size).toBe(2);
        expect(graph.variables.has("B")).toBe(false); // B not included
        expect(graph.variables.has("D")).toBe(true);
        expect(graph.variables.has("A")).toBe(true);
        
        // Check edges - each edge is from a variable to its outgoing connections
        // that are also in the variable set
        expect(graph.edges.has("D")).toBe(true);
        const dOutgoing = graph.edges.get("D");
        expect(dOutgoing.size).toBe(0); // D -> B, but B is not in the set
        
        expect(graph.edges.has("A")).toBe(true);
        const aOutgoing = graph.edges.get("A");
        expect(aOutgoing.size).toBe(0); // A has no outgoing edges in this set
      });
    });

    describe("when depth is 2 from variable B", () => {
      it("returns variables and edges limited to the relation set", () => {
        const graph = getGraphOfRelations(modelFeatures, "B", 2);
        
        expect(graph).toBeDefined();
        expect(graph.variables.size).toBe(4);
        expect(graph.variables.has("B")).toBe(false); // B not included
        expect(graph.variables.has("D")).toBe(true);
        expect(graph.variables.has("A")).toBe(true);
        expect(graph.variables.has("E")).toBe(true);
        expect(graph.variables.has("C")).toBe(true);
        
        // Check key edges (only between variables in the set)
        expect(graph.edges.get("E").has("D")).toBe(true); // E -> D
        expect(graph.edges.get("D").size).toBe(0); // D -> B, but B not in set
        expect(graph.edges.get("C").has("A")).toBe(true); // C -> A
      });
    });

    describe("when starting from an isolated variable", () => {
      it("returns a graph with no variables and no edges", () => {
        const graph = getGraphOfRelations(modelFeatures, "K", 5);
        
        expect(graph).toBeDefined();
        expect(graph.variables.size).toBe(0);
      });
    });
  });
});
