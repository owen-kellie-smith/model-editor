import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/domain/model.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { convertExpressionToFormula } from '@/domain/spreadsheetRenderer.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('Spreadsheet Formula Conversion', () => {
  let lang
  
  beforeAll(() => {
    const fixture = getFixture('language.xml')
    const xml = loadXml(fixture)
    lang = getFunctionsFromLanguage(xml, 'test')
  })

  it('should handle models with cohort-only variables referenced in cohort-step formulas', () => {
    // Test with the annuity model which has:
    // - current_age(cohort) - a cohort-only variable
    // - attained_age(cohort, step) with expression: current_age(cohort) + step * step_length
    // Using path.join for cross-platform compatibility
    const modelPath = path.join(process.cwd(), 'docs', 'examples', 'annuity-model', 'vendor-format-model.xml')
    
    // Skip test if file doesn't exist (e.g., in CI environments without example files)
    if (!fs.existsSync(modelPath)) {
      console.warn(`Skipping test: ${modelPath} not found`)
      return
    }
    
    const modelXml = fs.readFileSync(modelPath, 'utf-8')
    
    const model = validateModelCore(modelXml, 'vendor-format-model.xml', lang)
    
    // Verify model loaded successfully
    expect(model).toBeTruthy()
    expect(model.features.variables).toBeTruthy()
    
    // Check that we have the expected variables
    const variableNames = model.features.variables.map(v => v.toUpperCase())
    expect(variableNames).toContain('CURRENT_AGE')
    expect(variableNames).toContain('ATTAINED_AGE')
    
    // Verify that current_age is categorized as cohort-only
    const resolvedVarsWithArguments = model.features.resolvedVarsWithArguments
    const currentAgeResolved = resolvedVarsWithArguments.get('CURRENT_AGE')
    expect(currentAgeResolved).toBeTruthy()
    expect(currentAgeResolved.domain).toEqual(['cohort'])
    
    // Verify that attained_age is categorized as cohort-step
    const attainedAgeResolved = resolvedVarsWithArguments.get('ATTAINED_AGE')
    expect(attainedAgeResolved).toBeTruthy()
    expect(attainedAgeResolved.domain).toEqual(['cohort', 'step'])
  })

  it('should handle simple model with function calls in expressions', () => {
    // Create a test model with cohort and cohort-step variables
    const modelXml = `<?xml version="1.0"?>
<model id="test_model">
  <indexSets>
    <indexSet id="cohort"/>
    <indexSet id="step"/>
  </indexSets>
  <variables>
    <variable id="base_value">
      <arguments>
        <arg indexSet="cohort"/>
      </arguments>
      <definition type="constant">100</definition>
    </variable>
    <variable id="multiplier">
      <definition type="constant">2</definition>
    </variable>
    <variable id="calculated_value">
      <arguments>
        <arg indexSet="cohort"/>
        <arg indexSet="step"/>
      </arguments>
      <definition type="expression">base_value(cohort) * multiplier</definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    
    // Verify model loaded successfully
    expect(model).toBeTruthy()
    expect(model.features.variables).toBeTruthy()
    
    // Check that we have the expected variables
    const variableNames = model.features.variables.map(v => v.toUpperCase())
    expect(variableNames).toContain('BASE_VALUE')
    expect(variableNames).toContain('MULTIPLIER')
    expect(variableNames).toContain('CALCULATED_VALUE')
    
    // Verify categorization
    const resolvedVarsWithArguments = model.features.resolvedVarsWithArguments
    const baseValueResolved = resolvedVarsWithArguments.get('BASE_VALUE')
    expect(baseValueResolved.domain).toEqual(['cohort'])
    
    const calculatedValueResolved = resolvedVarsWithArguments.get('CALCULATED_VALUE')
    expect(calculatedValueResolved.domain).toEqual(['cohort', 'step'])
  })

  it('should handle step-only variables referenced in cohort-step formulas', () => {
    // Test with a simplified annuity model structure
    // - discount_factor(step) - a step-only variable
    // - cashflow(cohort, step) - a cohort-step variable
    // - discounted_cashflow(cohort, step) = cashflow(cohort, step) * discount_factor(step)
    const modelXml = `<?xml version="1.0"?>
<model id="test_step_only">
  <indexSets>
    <indexSet id="cohort"/>
    <indexSet id="step"/>
  </indexSets>
  <variables>
    <variable id="rate">
      <definition type="constant">0.05</definition>
    </variable>
    <variable id="discount_factor">
      <arguments>
        <arg indexSet="step"/>
      </arguments>
      <definition type="expression">(1 + rate) ^ (- step)</definition>
    </variable>
    <variable id="cashflow">
      <arguments>
        <arg indexSet="cohort"/>
        <arg indexSet="step"/>
      </arguments>
      <definition type="constant">100</definition>
    </variable>
    <variable id="discounted_cashflow">
      <arguments>
        <arg indexSet="cohort"/>
        <arg indexSet="step"/>
      </arguments>
      <definition type="expression">cashflow(cohort, step) * discount_factor(step)</definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    
    // Verify model loaded successfully
    expect(model).toBeTruthy()
    expect(model.features.variables).toBeTruthy()
    
    // Check that we have the expected variables
    const variableNames = model.features.variables.map(v => v.toUpperCase())
    expect(variableNames).toContain('DISCOUNT_FACTOR')
    expect(variableNames).toContain('CASHFLOW')
    expect(variableNames).toContain('DISCOUNTED_CASHFLOW')
    
    // Verify categorization
    const resolvedVarsWithArguments = model.features.resolvedVarsWithArguments
    
    // discount_factor should be step-only
    const discountFactorResolved = resolvedVarsWithArguments.get('DISCOUNT_FACTOR')
    expect(discountFactorResolved).toBeTruthy()
    expect(discountFactorResolved.domain).toEqual(['step'])
    
    // cashflow should be cohort-step
    const cashflowResolved = resolvedVarsWithArguments.get('CASHFLOW')
    expect(cashflowResolved).toBeTruthy()
    expect(cashflowResolved.domain).toEqual(['cohort', 'step'])
    
    // discounted_cashflow should be cohort-step
    const discountedCashflowResolved = resolvedVarsWithArguments.get('DISCOUNTED_CASHFLOW')
    expect(discountedCashflowResolved).toBeTruthy()
    expect(discountedCashflowResolved.domain).toEqual(['cohort', 'step'])
  })

  it('should convert variable(month) to a cell reference, not leave it as a function call', () => {
    // This tests the fix for the #NAME? error in restaurant/airline models.
    // When a formula contains monthly_food_revenue(month), the renderer must replace
    // it with a cell reference like B2, not leave it as monthly_food_revenue(month).

    // Set up: monthly_food_revenue is in cohortStepVars, mapped to column index 2 (col B)
    const colIndexMap = new Map([['MONTHLY_FOOD_REVENUE', 2]])
    const cohortStepVars = ['MONTHLY_FOOD_REVENUE']
    const constantVars = []
    const variableMap = new Map()
    const currentRow = 2

    // Expression that references monthly_food_revenue with a month argument
    const expression = 'monthly_food_revenue(month) * 0.3'
    const result = convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap)

    // Should replace monthly_food_revenue(month) with B2
    expect(result).toBe('B2 * 0.3')
    expect(result).not.toContain('monthly_food_revenue')
  })

  it('should convert variable(year) and variable(period) to cell references', () => {
    // Additional temporal index argument names should also be handled
    const colIndexMap = new Map([['ANNUAL_REVENUE', 2], ['TOTAL_COST', 3]])
    const cohortStepVars = ['ANNUAL_REVENUE', 'TOTAL_COST']
    const constantVars = []
    const variableMap = new Map()
    const currentRow = 3

    const expression = 'annual_revenue(year) - total_cost(period)'
    const result = convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap)

    expect(result).toBe('B3 - C3')
    expect(result).not.toContain('annual_revenue')
    expect(result).not.toContain('total_cost')
  })

  it('should replace bare temporal index "month" in formula conditions with column A reference', () => {
    // Regression test: when a formula uses `month` as a bare identifier (e.g. in a condition
    // like `month = 0`), it must be replaced with A${currentRow} so the exported spreadsheet
    // does not contain an unresolved name like `month`.
    const colIndexMap = new Map()
    const cohortStepVars = []
    const constantVars = []
    const variableMap = new Map()
    const currentRow = 2

    const expression = 'month = 0'
    const result = convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap)

    expect(result).toBe('A2 = 0')
    expect(result).not.toContain('month')
  })

  it('should replace bare temporal indices (year, period, quarter, week, day) with column A reference', () => {
    // All standard temporal index names must be replaced, not just "step" and "month"
    const colIndexMap = new Map()
    const cohortStepVars = []
    const constantVars = []
    const variableMap = new Map()
    const currentRow = 3

    const temporalNames = ['year', 'period', 'quarter', 'week', 'day']
    for (const name of temporalNames) {
      const result = convertExpressionToFormula(`${name} = 0`, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap)
      expect(result).toBe('A3 = 0')
      expect(result).not.toContain(name)
    }
  })

  it('should not replace MONTH() or YEAR() Excel function names when followed by parentheses', () => {
    // The replacement must not break Excel built-in functions like MONTH(date) or YEAR(date)
    const colIndexMap = new Map()
    const cohortStepVars = []
    const constantVars = []
    const variableMap = new Map()
    const currentRow = 2

    // MONTH() and YEAR() are valid Excel functions; they must not be replaced
    const expression = 'MONTH(A1) + YEAR(A1)'
    const result = convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap)

    expect(result).toContain('MONTH(A1)')
    expect(result).toContain('YEAR(A1)')
  })
})
