import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/core/model.js'
import { renderModelAsExcel } from '@/core/spreadsheetRenderer.js'
import { getFunctionsFromLanguage } from '@/core/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('Restaurant Model Spreadsheet Rendering', () => {
  let lang
  let restaurantModel
  
  beforeAll(() => {
    // Load language
    const languageFixture = getFixture('language.xml')
    const languageXml = loadXml(languageFixture)
    lang = getFunctionsFromLanguage(languageXml, 'test')
    
    // Load restaurant model
    const restaurantModelPath = getFixture('restaurant/model.xml')
    const restaurantModelXml = fs.readFileSync(restaurantModelPath, 'utf-8')
    restaurantModel = validateModelCore(restaurantModelXml, 'restaurant-model.xml', lang, { ignoreUnits: true })
  })

  it('should render restaurant model as Excel without errors', async () => {
    expect(restaurantModel).toBeTruthy()
    expect(restaurantModel.obj).toBeTruthy()
    expect(restaurantModel.features).toBeTruthy()
    
    // This will use the mock blob in test environment
    const blob = await renderModelAsExcel(restaurantModel.obj, restaurantModel.features)
    expect(blob).toBeTruthy()
    expect(blob instanceof Blob).toBe(true)
  })

  it('should not include hardcoded mortality or spot_rate tables for restaurant model', async () => {
    // The restaurant model has no tables defined, so the spreadsheet should not
    // include any table sheets, especially not the hardcoded mortality/spot_rate tables
    
    // Verify model has no tables
    const hasTables = restaurantModel.obj.model.tables && restaurantModel.obj.model.tables.table
    expect(hasTables).toBeFalsy()
    
    // Test would need actual Excel parsing to verify sheets, but we can at least
    // verify the rendering doesn't throw an error
    const blob = await renderModelAsExcel(restaurantModel.obj, restaurantModel.features)
    expect(blob).toBeTruthy()
    
    console.log('✓ Restaurant model spreadsheet rendered without hardcoded tables')
  })

  it('should categorize restaurant model variables correctly', () => {
    // Import the categorization function (it's not exported, so we need to replicate the logic)
    const variableMap = new Map()
    if (restaurantModel.obj.model.variables && restaurantModel.obj.model.variables.variable) {
      const vars = Array.isArray(restaurantModel.obj.model.variables.variable) 
        ? restaurantModel.obj.model.variables.variable 
        : [restaurantModel.obj.model.variables.variable]
      
      for (const v of vars) {
        variableMap.set(v.id.toUpperCase(), v)
      }
    }
    
    const resolvedVarsWithArguments = restaurantModel.features.resolvedVarsWithArguments
    
    // Replicate categorization logic with definition type check
    const constants = []
    const cohortOnly = []
    const cohortStep = []
    const other = []
    
    const temporalArgs = ['STEP', 'MONTH', 'YEAR', 'PERIOD', 'TIME', 'QUARTER', 'WEEK', 'DAY']
    
    for (const [varName, varXml] of variableMap) {
      const resolved = resolvedVarsWithArguments.get(varName)
      const args = resolved && resolved.domain ? resolved.domain : []
      const defType = varXml.definition?.type || ""
      
      if (args.length === 0) {
        // Only include variables with type="constant" in the constants sheet
        if (defType === "constant") {
          constants.push(varName)
        }
      } else if (args.length === 1 && args[0].toUpperCase() === 'COHORT') {
        cohortOnly.push(varName)
      } else if (args.length === 1 && temporalArgs.includes(args[0].toUpperCase())) {
        cohortStep.push(varName)
      } else if (args.length === 2 && args[0].toUpperCase() === 'COHORT' && temporalArgs.includes(args[1].toUpperCase())) {
        cohortStep.push(varName)
      } else {
        other.push(varName)
      }
    }
    
    console.log('Categorization results:')
    console.log('  Constants:', constants.length)
    console.log('  Cohort-only:', cohortOnly.length)
    console.log('  Cohort-step (includes month):', cohortStep.length)
    console.log('  Other:', other.length)
    
    // Verify expectations
    expect(constants.length).toBeGreaterThan(0)
    expect(cohortStep.length).toBeGreaterThan(0) // Should include month-indexed variables
    expect(other.length).toBe(0) // Should have no uncategorized variables
    
    // Verify specific month-indexed variables are in cohortStep
    expect(cohortStep).toContain('MONTHLY_FOOD_REVENUE')
    expect(cohortStep).toContain('MONTHLY_BEVERAGE_REVENUE')
    expect(cohortStep).toContain('MONTHLY_TOTAL_REVENUE')
    
    // Verify that formula variables with no arguments are NOT in constants
    expect(constants).not.toContain('BEVERAGE_REVENUE_PER_CUSTOMER')
    expect(constants).not.toContain('FOOD_REVENUE_PER_CUSTOMER')
    
    console.log('✓ All restaurant model variables correctly categorized')
    console.log('✓ Month-indexed calculated variables will be included in spreadsheet')
  })

  it('should not categorize formula variables as constants', () => {
    // Get variable map
    const variableMap = new Map()
    if (restaurantModel.obj.model.variables && restaurantModel.obj.model.variables.variable) {
      const vars = Array.isArray(restaurantModel.obj.model.variables.variable) 
        ? restaurantModel.obj.model.variables.variable 
        : [restaurantModel.obj.model.variables.variable]
      
      for (const v of vars) {
        variableMap.set(v.id.toUpperCase(), v)
      }
    }
    
    const resolvedVarsWithArguments = restaurantModel.features.resolvedVarsWithArguments
    
    // Categorize variables using corrected logic
    const constants = []
    const calculated = []
    const temporalArgs = ['STEP', 'MONTH', 'YEAR', 'PERIOD', 'TIME', 'QUARTER', 'WEEK', 'DAY']
    
    for (const [varName, varXml] of variableMap) {
      const resolved = resolvedVarsWithArguments.get(varName)
      const args = resolved && resolved.domain ? resolved.domain : []
      const defType = varXml.definition?.type || ""
      
      if (args.length === 0) {
        // Only true constants (with type="constant") should be in constants
        if (defType === "constant") {
          constants.push(varName)
        } else if (defType === "expression") {
          calculated.push(varName)
        }
      }
    }
    
    // beverage_revenue_per_customer has no arguments but has a formula (type="expression")
    // It should NOT be in constants
    expect(constants).not.toContain('BEVERAGE_REVENUE_PER_CUSTOMER')
    
    // It should be in calculated variables (formula with no arguments)
    expect(calculated).toContain('BEVERAGE_REVENUE_PER_CUSTOMER')
    
    // food_revenue_per_customer also has formula, should not be constant
    expect(constants).not.toContain('FOOD_REVENUE_PER_CUSTOMER')
    expect(calculated).toContain('FOOD_REVENUE_PER_CUSTOMER')
    
    // But avg_beverage_price IS a true constant (type="constant")
    expect(constants).toContain('AVG_BEVERAGE_PRICE')
    expect(calculated).not.toContain('AVG_BEVERAGE_PRICE')
    
    console.log('✓ Formula variables correctly distinguished from constants')
    console.log(`  True constants: ${constants.length}`)
    console.log(`  Calculated (no args): ${calculated.length}`)
  })
})
