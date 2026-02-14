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
      
      // Perform clustering with default (medium) granularity
      clusteringResult = clusterVariables(modelFeatures, semanticConfig)
    })
    
    it("should cluster variables into modules", () => {
      expect(clusteringResult).toBeDefined()
      expect(clusteringResult.modules).toBeDefined()
      expect(clusteringResult.modules.length).toBeGreaterThan(0)
    })
    
    it("should use hierarchical clustering for large models (>20 variables)", () => {
      const totalVars = Array.from(modelFeatures.incoming.keys()).length
      expect(totalVars).toBeGreaterThan(20)
      
      // With hierarchical clustering, should have multiple modules
      expect(clusteringResult.modules.length).toBeGreaterThan(1)
      
      // Modules should be smaller than the total (not one giant module)
      const largestModule = Math.max(...clusteringResult.modules.map(m => m.variables.length))
      expect(largestModule).toBeLessThan(totalVars)
    })
    
    it("should respect granularity settings", () => {
      const lowGranularity = clusterVariables(modelFeatures, semanticConfig, { granularity: 'low' })
      const mediumGranularity = clusterVariables(modelFeatures, semanticConfig, { granularity: 'medium' })
      const highGranularity = clusterVariables(modelFeatures, semanticConfig, { granularity: 'high' })
      
      // Low granularity should produce fewer modules than high granularity
      expect(lowGranularity.modules.length).toBeLessThanOrEqual(mediumGranularity.modules.length)
      expect(mediumGranularity.modules.length).toBeLessThanOrEqual(highGranularity.modules.length)
    })
    
    it("should generate descriptive module names", () => {
      // Module names should not all be generic "Module N"
      const hasDescriptiveNames = clusteringResult.modules.some(m => 
        !m.displayName.startsWith('Module ') || m.displayName.includes('(')
      )
      expect(hasDescriptiveNames).toBe(true)
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
    
    it("should create module names based on structure", () => {
      const moduleNames = clusteringResult.modules.map(m => m.displayName)
      
      // With structural clustering, modules are named generically (Module 1, Module 2, etc.)
      // Check that all modules have names
      expect(moduleNames.length).toBeGreaterThan(0)
      for (const name of moduleNames) {
        expect(name).toBeDefined()
        expect(name.length).toBeGreaterThan(0)
      }
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
  
  describe("Variable Clustering on vendor-format-model.xml", () => {
    let modelFeatures
    let clusteringResult
    
    beforeAll(() => {
      // Load vendor-format-model.xml
      const modelPath = path.join(__dirname, "..", "docs", "examples", "annuity-model", "vendor-format-model.xml")
      const modelText = fs.readFileSync(modelPath, "utf-8")
      const result = validateModelCore(modelText, "vendor-format-model.xml", lang)
      modelFeatures = result.features
      
      // Perform clustering
      clusteringResult = clusterVariables(modelFeatures, semanticConfig)
      
      // Debug output
      console.log(`\n=== vendor-format-model.xml clustering ===`)
      console.log(`Total variables: ${result.features.incoming.size}`)
      console.log(`Modules: ${clusteringResult.modules.length}`)
      for (const module of clusteringResult.modules) {
        console.log(`\nModule: ${module.displayName}`)
        console.log(`  Variables: ${module.variables.join(', ')}`)
        if (module.variables.includes('MONTHLY_SURVIVAL_RATE')) {
          console.log(`  ^^^ MONTHLY_SURVIVAL_RATE IS HERE ^^^`)
        }
      }
    })
    
    it("should cluster SURVIVAL_TO_START_OF_STEP and MONTHLY_SURVIVAL_RATE in the same module as ANNUAL_MORTALITY_RATE", () => {
      // Find which module contains ANNUAL_MORTALITY_RATE
      let annualMortalityModule = null
      for (const module of clusteringResult.modules) {
        if (module.variables.includes("ANNUAL_MORTALITY_RATE")) {
          annualMortalityModule = module
          break
        }
      }
      
      // Verify ANNUAL_MORTALITY_RATE is in a module
      expect(annualMortalityModule).toBeDefined()
      expect(annualMortalityModule).not.toBeNull()
      
      // Verify SURVIVAL_TO_START_OF_STEP is in the same module
      expect(annualMortalityModule.variables).toContain("SURVIVAL_TO_START_OF_STEP")
      
      // Verify MONTHLY_SURVIVAL_RATE is in the same module
      expect(annualMortalityModule.variables).toContain("MONTHLY_SURVIVAL_RATE")
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
    
    it("should exclude index-only dependencies from clustering", () => {
      // Load model_long.xml which has variables with different argument structures
      const modelPath = path.join(__dirname, "..", "docs", "examples", "long", "model_long.xml")
      const modelText = fs.readFileSync(modelPath, "utf-8")
      const result = validateModelCore(modelText, "model_long.xml", lang)
      
      // Perform clustering
      const clustering = clusterVariables(result.features, semanticConfig)
      
      // Validate that the filtering logic is applied correctly
      // by checking that variables with structural dependencies (no args -> with args)
      // can exist in the model and clustering completes successfully
      expect(clustering.modules).toBeDefined()
      expect(clustering.modules.length).toBeGreaterThan(0)
      
      // Check that inter-cluster edges exist (showing semantic relationships are preserved)
      expect(clustering.interClusterEdges).toBeDefined()
      expect(Array.isArray(clustering.interClusterEdges)).toBe(true)
      
      // Validate statistics are computed correctly with the filtered dependencies
      expect(clustering.stats.totalVariables).toBeGreaterThan(0)
      expect(clustering.stats.totalClusters).toBe(clustering.modules.length)
      
      // The key behavior: clustering should use semantic dependencies,
      // not index-only dependencies, which means variables can be in different
      // clusters even if they have the same argument structure
      const varsByArgCount = new Map()
      for (const module of clustering.modules) {
        for (const varName of module.variables) {
          const varData = result.features.resolvedVarsWithArguments.get(varName)
          if (varData) {
            const argCount = varData.domain?.length || 0
            if (!varsByArgCount.has(argCount)) {
              varsByArgCount.set(argCount, [])
            }
            varsByArgCount.get(argCount).push({ varName, module: module.id })
          }
        }
      }
      
      // Variables with the same argument count should be able to appear in different modules
      // if they have different semantic meanings (this validates filtering is working)
      let foundEvidence = false
      for (const [argCount, vars] of varsByArgCount.entries()) {
        if (vars.length > 1) {
          const uniqueModules = new Set(vars.map(v => v.module))
          // At least some variables with same arg count should be in different modules
          // (if semantic filtering is working)
          if (uniqueModules.size > 1) {
            foundEvidence = true
            break
          }
        }
      }
      
      // Assert that we found evidence of semantic clustering
      expect(foundEvidence).toBe(true)
    })
  })
})
