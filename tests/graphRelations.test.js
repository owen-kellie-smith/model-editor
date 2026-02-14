import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
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

  describe("Index-only dependency filtering", () => {
    let indexModelFeatures;

    beforeAll(() => {
      // Load model with indexed and non-indexed variables
      const modelText = fs.readFileSync(getFixture("modelIndexOnlyDependencies.xml"), "utf-8");
      const result = validateModelCore(modelText, "modelIndexOnlyDependencies.xml", lang);
      indexModelFeatures = result.features;
    });

    describe("getRelations with indexed variables", () => {
      it("returns all connected variables regardless of index structure", () => {
        // MONTHLY_SURVIVAL_RATE depends on both ANNUAL_MORTALITY_RATE (semantic) and STEP_LENGTH (index-only)
        // getRelations should return all dependencies for completeness
        const relations = getRelations(indexModelFeatures, "MONTHLY_SURVIVAL_RATE", 1);
        
        expect(relations).toBeDefined();
        expect(relations.has("MONTHLY_SURVIVAL_RATE")).toBe(true);
        expect(relations.has("ANNUAL_MORTALITY_RATE")).toBe(true); // semantic dependency (same domain)
        expect(relations.has("STEP_LENGTH")).toBe(true); // index-only dependency (different domain)
        expect(relations.has("SURVIVAL_TO_START_OF_STEP")).toBe(true); // outgoing
      });
    });

    describe("getGraphOfRelations with indexed variables", () => {
      it("filters out index-only dependencies but keeps semantic dependencies", () => {
        // MONTHLY_SURVIVAL_RATE(cohort, step) depends on:
        // - ANNUAL_MORTALITY_RATE(cohort, step) - KEEP (same domain: both have [cohort, step])
        // - STEP_LENGTH (no indices) - FILTER (different domain: [cohort, step] vs [])
        const graph = getGraphOfRelations(indexModelFeatures, "MONTHLY_SURVIVAL_RATE", 1);
        
        expect(graph).toBeDefined();
        expect(graph.variables.has("MONTHLY_SURVIVAL_RATE")).toBe(true);
        expect(graph.variables.has("ANNUAL_MORTALITY_RATE")).toBe(true);
        expect(graph.variables.has("STEP_LENGTH")).toBe(true); // included in variables
        
        // Check edges from ANNUAL_MORTALITY_RATE
        const annualMortalityEdges = graph.edges.get("ANNUAL_MORTALITY_RATE");
        expect(annualMortalityEdges.has("MONTHLY_SURVIVAL_RATE")).toBe(true); // semantic dependency
        
        // Check edges from STEP_LENGTH - should NOT flow to MONTHLY_SURVIVAL_RATE
        const stepLengthEdges = graph.edges.get("STEP_LENGTH");
        expect(stepLengthEdges.has("MONTHLY_SURVIVAL_RATE")).toBe(false); // index-only, filtered out
      });

      it("keeps semantic dependencies between variables with same domain", () => {
        // Test the mortality chain: ANNUAL_MORTALITY_RATE -> MONTHLY_SURVIVAL_RATE -> SURVIVAL_TO_START_OF_STEP
        // All have domain [cohort, step], so all edges should be kept
        const graph = getGraphOfRelations(indexModelFeatures, "MONTHLY_SURVIVAL_RATE", 2);
        
        expect(graph.variables.has("ANNUAL_MORTALITY_RATE")).toBe(true);
        expect(graph.variables.has("MONTHLY_SURVIVAL_RATE")).toBe(true);
        expect(graph.variables.has("SURVIVAL_TO_START_OF_STEP")).toBe(true);
        
        // All three should have edges between them (semantic dependencies)
        expect(graph.edges.get("ANNUAL_MORTALITY_RATE").has("MONTHLY_SURVIVAL_RATE")).toBe(true);
        expect(graph.edges.get("MONTHLY_SURVIVAL_RATE").has("SURVIVAL_TO_START_OF_STEP")).toBe(true);
      });

      it("keeps semantic dependencies between non-indexed variables", () => {
        // CONSTANT_B depends on CONSTANT_A (both have domain [])
        // Both have same domain length (0), so it's a semantic dependency
        const graph = getGraphOfRelations(indexModelFeatures, "CONSTANT_B", 1);
        
        expect(graph.variables.has("CONSTANT_B")).toBe(true);
        expect(graph.variables.has("CONSTANT_A")).toBe(true);
        
        // Should have edge from CONSTANT_A to CONSTANT_B (semantic dependency)
        expect(graph.edges.get("CONSTANT_A").has("CONSTANT_B")).toBe(true);
      });

      it("filters out edges between variables with different domain dimensions", () => {
        // TIME_VALUE(step) depends on STEP_LENGTH (no indices)
        // Different domain lengths: [step] vs [] -> index-only dependency
        const graph = getGraphOfRelations(indexModelFeatures, "TIME_VALUE", 1);
        
        expect(graph.variables.has("TIME_VALUE")).toBe(true);
        expect(graph.variables.has("STEP_LENGTH")).toBe(true);
        
        // Should NOT have edge from STEP_LENGTH to TIME_VALUE (index-only)
        expect(graph.edges.get("STEP_LENGTH").has("TIME_VALUE")).toBe(false);
      });

      it("separates mortality variables from time constants in clustering", () => {
        // Start from MONTHLY_SURVIVAL_RATE with high depth
        // Should group with ANNUAL_MORTALITY_RATE and SURVIVAL_TO_START_OF_STEP (semantic)
        // Should NOT be strongly connected to STEP_LENGTH (index-only)
        const graph = getGraphOfRelations(indexModelFeatures, "MONTHLY_SURVIVAL_RATE", 5);
        
        // Mortality-related variables should be included
        expect(graph.variables.has("MONTHLY_SURVIVAL_RATE")).toBe(true);
        expect(graph.variables.has("ANNUAL_MORTALITY_RATE")).toBe(true);
        expect(graph.variables.has("SURVIVAL_TO_START_OF_STEP")).toBe(true);
        
        // STEP_LENGTH might be included via other paths, but edges should be filtered
        if (graph.variables.has("STEP_LENGTH")) {
          const stepLengthEdges = graph.edges.get("STEP_LENGTH");
          // STEP_LENGTH should not have edges to any mortality variables
          expect(stepLengthEdges.has("MONTHLY_SURVIVAL_RATE")).toBe(false);
          expect(stepLengthEdges.has("ANNUAL_MORTALITY_RATE")).toBe(false);
          expect(stepLengthEdges.has("SURVIVAL_TO_START_OF_STEP")).toBe(false);
        }
      });
    });

    describe("clustering with vendor-format-model", () => {
      let vendorModelFeatures;

      beforeAll(() => {
        // Load vendor-format-model.xml for clustering test
        const modelPath = path.join(__dirname, "..", "docs", "examples", "annuity-model", "vendor-format-model.xml");
        const modelText = fs.readFileSync(modelPath, "utf-8");
        const result = validateModelCore(modelText, "vendor-format-model.xml", lang);
        vendorModelFeatures = result.features;
      });

      it("clusters mortality variables together and separates them from time constants", () => {
        // Test with CASHFLOW as root at depth 3
        // CASHFLOW -> SURVIVAL_TO_START_OF_STEP -> MONTHLY_SURVIVAL_RATE -> ANNUAL_MORTALITY_RATE
        const graph = getGraphOfRelations(vendorModelFeatures, "CASHFLOW", 3);
        
        // Verify mortality and survival variables are included
        expect(graph.variables.has("MONTHLY_SURVIVAL_RATE")).toBe(true);
        expect(graph.variables.has("SURVIVAL_TO_START_OF_STEP")).toBe(true);
        expect(graph.variables.has("ANNUAL_MORTALITY_RATE")).toBe(true);
        
        // Verify STEP_LENGTH is in the graph (structural constant)
        expect(graph.variables.has("STEP_LENGTH")).toBe(true);
        
        // Check domains to understand clustering:
        // - monthly_survival_rate has domain (cohort, step)
        // - survival_to_start_of_step has domain (cohort, step) 
        // - annual_mortality_rate has domain (cohort, step)
        // - step_length has no domain (empty)
        const monthlySurvival = vendorModelFeatures.resolvedVarsWithArguments.get("MONTHLY_SURVIVAL_RATE");
        const survivalToStart = vendorModelFeatures.resolvedVarsWithArguments.get("SURVIVAL_TO_START_OF_STEP");
        const annualMortality = vendorModelFeatures.resolvedVarsWithArguments.get("ANNUAL_MORTALITY_RATE");
        const stepLength = vendorModelFeatures.resolvedVarsWithArguments.get("STEP_LENGTH");
        
        expect(monthlySurvival.domain).toEqual(["cohort", "step"]);
        expect(survivalToStart.domain).toEqual(["cohort", "step"]);
        expect(annualMortality.domain).toEqual(["cohort", "step"]);
        expect(stepLength.domain).toEqual([]);
        
        // Verify semantic edges exist between mortality variables (same domain)
        // monthly_survival_rate depends on annual_mortality_rate
        const annualMortalityEdges = graph.edges.get("ANNUAL_MORTALITY_RATE");
        expect(annualMortalityEdges.has("MONTHLY_SURVIVAL_RATE")).toBe(true);
        
        // survival_to_start_of_step depends on monthly_survival_rate
        const monthlySurvivalEdges = graph.edges.get("MONTHLY_SURVIVAL_RATE");
        expect(monthlySurvivalEdges.has("SURVIVAL_TO_START_OF_STEP")).toBe(true);
        
        // Verify index-only edges are filtered out (different domain lengths)
        // step_length should NOT have edges to mortality variables
        const stepLengthEdges = graph.edges.get("STEP_LENGTH");
        expect(stepLengthEdges.has("MONTHLY_SURVIVAL_RATE")).toBe(false);
        expect(stepLengthEdges.has("SURVIVAL_TO_START_OF_STEP")).toBe(false);
        expect(stepLengthEdges.has("ANNUAL_MORTALITY_RATE")).toBe(false);
        
        // This demonstrates that mortality variables cluster together by semantic domain
        // rather than being scattered with time constants like step_length
      });
    });
  });
});
