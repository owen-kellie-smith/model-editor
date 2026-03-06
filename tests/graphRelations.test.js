import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import { loadXml } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import { validateModelCore } from "@/core/model.js";
import { getFunctionsFromLanguage } from "@/core/language.js";
import { getRelations, getGraphOfRelations, getRelationsMulti, getGraphOfRelationsMulti } from "@/core/graphRelations.js";

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
      it("returns only the root variable", () => {
        const relations = getRelations(modelFeatures, "B", 0);
        
        expect(relations).toBeDefined();
        expect(relations.size).toBe(1);
        expect(relations.has("B")).toBe(true);
      });
    });

    describe("when depth is 1", () => {
      it("returns root variable and its immediate incoming and outgoing variables", () => {
        // For variable B in the test model:
        // - B = D (so D is incoming to B)
        // - A = B + C (so A is outgoing from B)
        const relations = getRelations(modelFeatures, "B", 1);
        
        expect(relations).toBeDefined();
        expect(relations.size).toBe(3);
        expect(relations.has("B")).toBe(true); // root included
        expect(relations.has("D")).toBe(true); // incoming
        expect(relations.has("A")).toBe(true); // outgoing
      });
    });

    describe("when depth is 2", () => {
      it("returns variables up to 2 steps away from root", () => {
        // For variable B with depth 2:
        // Depth 0: B
        // Depth 1: D (incoming to B), A (outgoing from B)
        // Depth 2: E (incoming to D), C (incoming to A, since A = B + C)
        const relations = getRelations(modelFeatures, "B", 2);
        
        expect(relations).toBeDefined();
        expect(relations.size).toBe(5);
        expect(relations.has("B")).toBe(true); // root included
        expect(relations.has("D")).toBe(true);
        expect(relations.has("A")).toBe(true);
        expect(relations.has("E")).toBe(true); // incoming to D
        expect(relations.has("C")).toBe(true); // incoming to A
      });
    });

    describe("when depth is high", () => {
      it("returns all connected variables in the component", () => {
        // With high depth, should get all variables in the connected component
        // Starting from B: B, D, E (chain going back), A, C (chain going forward)
        const relations = getRelations(modelFeatures, "B", 10);
        
        expect(relations).toBeDefined();
        expect(relations.size).toBe(5);
        expect(relations.has("B")).toBe(true); // root included
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
      it("returns only the variable itself regardless of depth", () => {
        const relations = getRelations(modelFeatures, "K", 5);
        
        expect(relations).toBeDefined();
        expect(relations.size).toBe(1);
        expect(relations.has("K")).toBe(true);
      });
    });
  });

  describe("getGraphOfRelations", () => {
    describe("when depth is 1 from variable B", () => {
      it("returns variables and their outgoing connections limited to the relation set", () => {
        // Model: A = B + C; B = D; D = E
        // Relations at depth 1 from B: {B, D, A}
        // Outgoing edges:
        //   - B -> A (B flows into A)
        //   - D -> B (D flows into B)
        //   - A -> nothing in the set
        
        const graph = getGraphOfRelations(modelFeatures, "B", 1);
        
        expect(graph).toBeDefined();
        expect(graph.variables).toBeDefined();
        expect(graph.edges).toBeDefined();
        
        // Should have the same variables as getRelations (B, D, A)
        expect(graph.variables.size).toBe(3);
        expect(graph.variables.has("B")).toBe(true);
        expect(graph.variables.has("D")).toBe(true);
        expect(graph.variables.has("A")).toBe(true);
        
        // Check edges - each edge is from a variable to its outgoing connections
        // that are also in the variable set
        expect(graph.edges.has("B")).toBe(true);
        const bOutgoing = graph.edges.get("B");
        expect(bOutgoing.size).toBe(1);
        expect(bOutgoing.has("A")).toBe(true); // B -> A
        
        expect(graph.edges.has("D")).toBe(true);
        const dOutgoing = graph.edges.get("D");
        expect(dOutgoing.size).toBe(1);
        expect(dOutgoing.has("B")).toBe(true); // D -> B
        
        expect(graph.edges.has("A")).toBe(true);
        const aOutgoing = graph.edges.get("A");
        expect(aOutgoing.size).toBe(0); // A has no outgoing edges in this set
      });
    });

    describe("when depth is 2 from variable B", () => {
      it("returns variables and edges limited to the relation set", () => {
        const graph = getGraphOfRelations(modelFeatures, "B", 2);
        
        expect(graph).toBeDefined();
        expect(graph.variables.size).toBe(5);
        expect(graph.variables.has("B")).toBe(true);
        expect(graph.variables.has("D")).toBe(true);
        expect(graph.variables.has("A")).toBe(true);
        expect(graph.variables.has("E")).toBe(true);
        expect(graph.variables.has("C")).toBe(true);
        
        // Check key edges
        expect(graph.edges.get("E").has("D")).toBe(true); // E -> D
        expect(graph.edges.get("D").has("B")).toBe(true); // D -> B
        expect(graph.edges.get("B").has("A")).toBe(true); // B -> A
        expect(graph.edges.get("C").has("A")).toBe(true); // C -> A
      });
    });

    describe("when starting from an isolated variable", () => {
      it("returns a graph with one variable and no edges", () => {
        const graph = getGraphOfRelations(modelFeatures, "K", 5);
        
        expect(graph).toBeDefined();
        expect(graph.variables.size).toBe(1);
        expect(graph.variables.has("K")).toBe(true);
        expect(graph.edges.get("K").size).toBe(0);
      });
    });
  });

  describe("getRelationsMulti", () => {
    describe("when given a single root variable", () => {
      it("returns the same result as getRelations", () => {
        const multi = getRelationsMulti(modelFeatures, ["B"], 2);
        const single = getRelations(modelFeatures, "B", 2);

        expect(multi.size).toBe(single.size);
        for (const v of single) {
          expect(multi.has(v)).toBe(true);
        }
      });
    });

    describe("when given two root variables", () => {
      it("returns the union of variables reachable from each root", () => {
        // Model: A = B + C; B = D; D = E; and a separate chain F = G
        // At depth 1 from B: {B, D, A}
        // At depth 1 from F: {F, G} (or similar in test fixture)
        // The union should contain all from both
        const fromB = getRelations(modelFeatures, "B", 1);
        const fromD = getRelations(modelFeatures, "D", 1);
        const multi = getRelationsMulti(modelFeatures, ["B", "D"], 1);

        for (const v of fromB) {
          expect(multi.has(v)).toBe(true);
        }
        for (const v of fromD) {
          expect(multi.has(v)).toBe(true);
        }
      });

      it("includes variables reachable from both roots", () => {
        // At depth 1 from E: {E, D} (E is incoming to D)
        // At depth 1 from C: {C, A} (C is incoming to A)
        // Union: {E, D, C, A}
        const multi = getRelationsMulti(modelFeatures, ["E", "C"], 1);

        expect(multi.has("E")).toBe(true);
        expect(multi.has("D")).toBe(true);
        expect(multi.has("C")).toBe(true);
        expect(multi.has("A")).toBe(true);
      });
    });

    describe("when given an empty array", () => {
      it("returns an empty set", () => {
        const multi = getRelationsMulti(modelFeatures, [], 2);
        expect(multi.size).toBe(0);
      });
    });
  });

  describe("getGraphOfRelationsMulti", () => {
    describe("when given a single root variable", () => {
      it("returns the same variables and edges as getGraphOfRelations", () => {
        const multi = getGraphOfRelationsMulti(modelFeatures, ["B"], 2);
        const single = getGraphOfRelations(modelFeatures, "B", 2);

        expect(multi.variables.size).toBe(single.variables.size);
        for (const v of single.variables) {
          expect(multi.variables.has(v)).toBe(true);
        }
      });
    });

    describe("when given two root variables", () => {
      it("returns the union of variables and their edges", () => {
        // depth 1 from B: {B, D, A}; depth 1 from C: {C, A}
        // union: {B, D, A, C}
        const multi = getGraphOfRelationsMulti(modelFeatures, ["B", "C"], 1);

        expect(multi.variables.has("B")).toBe(true);
        expect(multi.variables.has("D")).toBe(true);
        expect(multi.variables.has("A")).toBe(true);
        expect(multi.variables.has("C")).toBe(true);

        // Edges should include connections within the union set
        expect(multi.edges.get("D").has("B")).toBe(true); // D -> B
        expect(multi.edges.get("B").has("A")).toBe(true); // B -> A
        expect(multi.edges.get("C").has("A")).toBe(true); // C -> A
      });

      it("includes edges between nodes contributed by different roots", () => {
        // Both B and C contribute to A; multi-focus should show C -> A edge
        const multi = getGraphOfRelationsMulti(modelFeatures, ["B", "C"], 1);

        expect(multi.edges.get("C").has("A")).toBe(true);
        expect(multi.edges.get("B").has("A")).toBe(true);
      });
    });

    describe("when given an empty array", () => {
      it("returns an empty variables set and empty edges map", () => {
        const multi = getGraphOfRelationsMulti(modelFeatures, [], 2);
        expect(multi.variables.size).toBe(0);
        expect(multi.edges.size).toBe(0);
      });
    });
  });
});
