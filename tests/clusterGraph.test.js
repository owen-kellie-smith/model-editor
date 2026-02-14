import { describe, it, expect, beforeAll } from "vitest"
import fs from "fs"
import path from "path"
import { loadXml } from "./helpers/xml.js"
import { getFixture } from "./helpers/fixtures.ts"
import { validateModelCore } from "@/domain/model.js"
import { getFunctionsFromLanguage } from "@/domain/language.js"
import { parseSemanticConfig } from "@/analysis/semantic_config_parser.js"
import { clusterVariables, generateClusterDot } from "@/analysis/variable_clustering.js"

describe("Cluster Graph", () => {
  let lang
  let semanticConfig
  
  beforeAll(() => {
    // Load language from docs/examples (has more functions)
    const langPath = path.join(__dirname, "..", "docs", "examples", "language.xml")
    const langXml = loadXml(langPath)
    lang = getFunctionsFromLanguage(langXml, "test")
    
    // Load semantic configuration
    const configPath = path.join(__dirname, "..", "docs", "src", "analysis", "semantic-configs", "annuity-finance-semantic-config.xml")
    const configText = fs.readFileSync(configPath, "utf-8")
    semanticConfig = parseSemanticConfig(configText)
  })
  
  describe("Semantic Config Parser", () => {
    it("should parse keywords correctly", () => {
      expect(semanticConfig.keywords).toBeDefined()
      expect(semanticConfig.keywords.size).toBeGreaterThan(0)
      
      // Check temporal keyword exists
      expect(semanticConfig.keywords.has("temporal")).toBe(true)
      const temporalPatterns = semanticConfig.keywords.get("temporal")
      expect(temporalPatterns).toContain("step")
      expect(temporalPatterns).toContain("age")
    })
    
    it("should parse domains correctly", () => {
      expect(semanticConfig.domains).toBeDefined()
      expect(semanticConfig.domains.length).toBe(17)
      
      // Check domain structure
      const temporalDomain = semanticConfig.domains.find(d => d.keywordId === "temporal")
      expect(temporalDomain).toBeDefined()
      expect(temporalDomain.displayName).toBe("Time & Duration")
      expect(temporalDomain.patterns).toBeDefined()
    })
    
    it("should parse clustering parameters correctly", () => {
      expect(semanticConfig.parameters).toBeDefined()
      expect(semanticConfig.parameters.minClusterSize).toBe(3)
      expect(semanticConfig.parameters.maxClusterSize).toBe(50)
      expect(semanticConfig.parameters.semanticThreshold).toBe(0.3)
    })
    
    it("should validate parameter ranges", () => {
      const invalidConfig = `<?xml version="1.0"?>
        <semanticConfig>
          <keywords>
            <keyword id="test">
              <patterns><pattern>test</pattern></patterns>
            </keyword>
          </keywords>
          <domains>
            <domain keywordId="test" displayName="Test"/>
          </domains>
          <clusteringParameters>
            <minClusterSize>-1</minClusterSize>
          </clusteringParameters>
        </semanticConfig>`
      
      expect(() => parseSemanticConfig(invalidConfig)).toThrow(/positive integer/)
    })
    
    it("should throw error for missing keyword reference", () => {
      const invalidConfig = `<?xml version="1.0"?>
        <semanticConfig>
          <keywords>
            <keyword id="test">
              <patterns><pattern>test</pattern></patterns>
            </keyword>
          </keywords>
          <domains>
            <domain keywordId="nonexistent" displayName="Test"/>
          </domains>
        </semanticConfig>`
      
      expect(() => parseSemanticConfig(invalidConfig)).toThrow(/unknown keyword/)
    })
  })
  
  describe("Variable Clustering on model_long.xml", () => {
    let modelFeatures
    let clusteringResult
    
    beforeAll(() => {
      // Load model_long.xml
      const modelPath = path.join(__dirname, "..", "docs", "examples", "long", "model_long.xml")
      const modelText = fs.readFileSync(modelPath, "utf-8")
      const result = validateModelCore(modelText, "model_long.xml", lang)
      modelFeatures = result.features
      
      // Perform clustering
      clusteringResult = clusterVariables(modelFeatures, semanticConfig)
    })
    
    it("should cluster variables into modules", () => {
      expect(clusteringResult).toBeDefined()
      expect(clusteringResult.modules).toBeDefined()
      expect(clusteringResult.modules.length).toBeGreaterThan(0)
    })
    
    it("should generate statistics", () => {
      expect(clusteringResult.stats).toBeDefined()
      expect(clusteringResult.stats.totalVariables).toBeGreaterThan(0)
      expect(clusteringResult.stats.totalClusters).toBe(clusteringResult.modules.length)
      expect(clusteringResult.stats.avgClusterSize).toBeDefined()
    })
    
    it("should assign each variable to exactly one module", () => {
      const allVars = Array.from(modelFeatures.incoming.keys())
      const assignedVars = new Set()
      
      for (const module of clusteringResult.modules) {
        for (const varName of module.variables) {
          expect(assignedVars.has(varName)).toBe(false) // No duplicates
          assignedVars.add(varName)
        }
      }
      
      expect(assignedVars.size).toBe(allVars.length)
    })
    
    it("should create semantically meaningful module names", () => {
      const moduleNames = clusteringResult.modules.map(m => m.displayName)
      
      // Check for some expected domain names
      const expectedDomains = [
        "Time & Duration",
        "Demographics",
        "Economic Rates",
        "Mortality & Survival",
        "Cashflows"
      ]
      
      // At least some of these domains should exist if model has related variables
      const foundDomains = expectedDomains.filter(name => moduleNames.includes(name))
      expect(foundDomains.length).toBeGreaterThan(0)
    })
    
    it("should calculate inter-module edges", () => {
      expect(clusteringResult.interClusterEdges).toBeDefined()
      expect(Array.isArray(clusteringResult.interClusterEdges)).toBe(true)
      
      // Each edge should have from and to properties
      for (const edge of clusteringResult.interClusterEdges) {
        expect(edge.from).toBeDefined()
        expect(edge.to).toBeDefined()
        expect(edge.from).not.toBe(edge.to) // No self-loops
      }
    })
    
    it("should generate valid DOT format", () => {
      const dot = generateClusterDot(clusteringResult)
      
      expect(dot).toBeDefined()
      expect(dot).toContain("digraph ClusterGraph")
      expect(dot).toContain("rankdir=LR")
      
      // Check that modules appear in the DOT
      for (const module of clusteringResult.modules.slice(0, 3)) {
        expect(dot).toContain(module.id)
      }
    })
  })
  
  describe("Variable Clustering on legacy-format-model.xml", () => {
    let modelFeatures
    let clusteringResult
    
    beforeAll(() => {
      // Load legacy-format-model.xml
      const modelPath = path.join(__dirname, "..", "docs", "examples", "annuity-model", "legacy-format-model.xml")
      const modelText = fs.readFileSync(modelPath, "utf-8")
      const result = validateModelCore(modelText, "legacy-format-model.xml", lang)
      modelFeatures = result.features
      
      // Perform clustering
      clusteringResult = clusterVariables(modelFeatures, semanticConfig)
    })
    
    it("should work with legacy format models", () => {
      expect(clusteringResult).toBeDefined()
      expect(clusteringResult.modules).toBeDefined()
      expect(clusteringResult.modules.length).toBeGreaterThan(0)
    })
    
    it("should assign all variables to modules", () => {
      const allVars = Array.from(modelFeatures.incoming.keys())
      const assignedVars = new Set()
      
      for (const module of clusteringResult.modules) {
        for (const varName of module.variables) {
          assignedVars.add(varName)
        }
      }
      
      expect(assignedVars.size).toBe(allVars.length)
    })
    
    it("should generate statistics for legacy model", () => {
      expect(clusteringResult.stats.totalVariables).toBeGreaterThan(0)
      expect(clusteringResult.stats.totalClusters).toBeGreaterThan(0)
    })
  })
  
  describe("Model-Agnostic Clustering", () => {
    it("should produce deterministic results", () => {
      // Load a model
      const modelPath = path.join(__dirname, "..", "docs", "examples", "annuity-model", "legacy-format-model.xml")
      const modelText = fs.readFileSync(modelPath, "utf-8")
      const result = validateModelCore(modelText, "legacy-format-model.xml", lang)
      
      // Cluster twice
      const clustering1 = clusterVariables(result.features, semanticConfig)
      const clustering2 = clusterVariables(result.features, semanticConfig)
      
      // Results should be identical
      expect(clustering1.modules.length).toBe(clustering2.modules.length)
      expect(clustering1.stats.totalVariables).toBe(clustering2.stats.totalVariables)
      
      // Check module contents are the same
      for (let i = 0; i < clustering1.modules.length; i++) {
        const module1 = clustering1.modules[i]
        const module2 = clustering2.modules[i]
        expect(module1.id).toBe(module2.id)
        expect(module1.variables).toEqual(module2.variables)
      }
    })
    
    it("should not hard-code variable names", () => {
      // The clustering algorithm should work based on patterns, not hard-coded names
      // This is validated by the fact that it works on different models
      const modelPath1 = path.join(__dirname, "..", "docs", "examples", "long", "model_long.xml")
      const modelPath2 = path.join(__dirname, "..", "docs", "examples", "annuity-model", "legacy-format-model.xml")
      
      const model1Text = fs.readFileSync(modelPath1, "utf-8")
      const model2Text = fs.readFileSync(modelPath2, "utf-8")
      
      const result1 = validateModelCore(model1Text, "model_long.xml", lang)
      const result2 = validateModelCore(model2Text, "legacy-format-model.xml", lang)
      
      // Both should cluster successfully
      const clustering1 = clusterVariables(result1.features, semanticConfig)
      const clustering2 = clusterVariables(result2.features, semanticConfig)
      
      expect(clustering1.modules.length).toBeGreaterThan(0)
      expect(clustering2.modules.length).toBeGreaterThan(0)
    })
  })
})
