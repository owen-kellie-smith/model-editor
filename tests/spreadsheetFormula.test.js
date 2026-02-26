import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/domain/model.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { convertExpressionToFormula, generatePiecewiseFormula } from '@/domain/spreadsheetRenderer.js'
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

  it('should convert variable(month - 1) to the previous row cell reference', () => {
    // Regression test for airline model outstanding_debt rendering bug.
    // outstanding_debt(month - 1) was rendered as O3(A3 - 1) instead of O2
    // because Pattern 3b matched bare variable name before the offset argument was resolved.
    const colIndexMap = new Map([['OUTSTANDING_DEBT', 15]]) // col O
    const cohortStepVars = ['OUTSTANDING_DEBT']
    const constantVars = []
    const variableMap = new Map()
    const currentRow = 3 // step=1, row 3

    const expression = 'MAX(0, outstanding_debt(month - 1) - 100)'
    const result = convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap)

    // outstanding_debt(month - 1) at row 3 should become O2 (previous row)
    expect(result).toContain('O2')
    expect(result).not.toContain('O3(')
    expect(result).not.toContain('outstanding_debt')
  })

  it('should not replace a variable name that is a prefix of another variable name', () => {
    // Regression test for airline model outstanding_debt rendering bug.
    // monthly_net_profit_after_interest(month - 1) was incorrectly rendered as
    // M3_after_interest(A3 - 1) because monthly_net_profit (col M) was matched as
    // a prefix of monthly_net_profit_after_interest before the full name could be matched.
    // col M = 13 for monthly_net_profit, col Q = 17 for monthly_net_profit_after_interest
    const colIndexMap = new Map([
      ['OUTSTANDING_DEBT', 15],            // col O
      ['MONTHLY_NET_PROFIT', 13],          // col M
      ['MONTHLY_NET_PROFIT_AFTER_INTEREST', 17], // col Q
    ])
    const cohortStepVars = ['OUTSTANDING_DEBT', 'MONTHLY_NET_PROFIT', 'MONTHLY_NET_PROFIT_AFTER_INTEREST']
    const constantVars = []
    const variableMap = new Map()
    const currentRow = 3 // step=1, row 3

    const expression = 'MAX(0, outstanding_debt(month - 1) - monthly_net_profit_after_interest(month - 1))'
    const result = convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap)

    // outstanding_debt(month - 1) at row 3 -> O2, monthly_net_profit_after_interest(month - 1) -> Q2
    expect(result).toBe('MAX(0, O2 - Q2)')
    expect(result).not.toContain('monthly_net_profit')
    expect(result).not.toContain('outstanding_debt')
    // monthly_net_profit (col M) must NOT have replaced the prefix of monthly_net_profit_after_interest
    expect(result).not.toContain('M3')
  })

  it('should convert variable(0) with literal integer index to the correct row reference', () => {
    // Regression test: cumulative_net_income piecewise value for month=0 is net_income(0).
    // This was rendered as L2(0) instead of L2 because Pattern 3b only matches named
    // identifiers, leaving the literal (0) behind after Pattern 4 replaced the variable name.
    const colIndexMap = new Map([['NET_INCOME', 12]]) // col L
    const cohortStepVars = ['NET_INCOME']
    const constantVars = []
    const variableMap = new Map()
    const currentRow = 2

    const result = convertExpressionToFormula('net_income(0)', currentRow, colIndexMap, cohortStepVars, constantVars, variableMap)

    // net_income(0) means index=0 which is row 2
    expect(result).toBe('L2')
    expect(result).not.toContain('net_income')
    expect(result).not.toContain('(0)')
  })

  it('should convert variable(N) with literal integer to row N+2', () => {
    const colIndexMap = new Map([['NET_INCOME', 12]]) // col L
    const cohortStepVars = ['NET_INCOME']
    const constantVars = []
    const variableMap = new Map()
    const currentRow = 5

    // net_income(2) means index=2 which is row 4
    const result = convertExpressionToFormula('net_income(2)', currentRow, colIndexMap, cohortStepVars, constantVars, variableMap)
    expect(result).toBe('L4')
    expect(result).not.toContain('net_income')
  })

  it('should render cumulative_net_income(month=0) formula correctly using actual Dividends.xml', () => {
    // Integration regression test: load the actual Dividends.xml airline model and verify
    // that the piecewise month=0 case "net_income(0)" converts to a plain cell ref, not "L2(0)".
    const dividendsModelPath = path.join(process.cwd(), 'docs', 'examples', 'airline-model', 'Dividends.xml')
    const langPath = path.join(process.cwd(), 'docs', 'examples', 'language.xml')
    if (!fs.existsSync(dividendsModelPath) || !fs.existsSync(langPath)) {
      console.warn('Skipping test: Dividends.xml or language.xml not found')
      return
    }

    // Load the full language.xml (includes sin/cos used by Dividends.xml)
    const langXml = loadXml(langPath)
    const dividendsLang = getFunctionsFromLanguage(langXml, 'test')

    const dividendsXml = fs.readFileSync(dividendsModelPath, 'utf-8')
    const model = validateModelCore(dividendsXml, 'Dividends.xml', dividendsLang)
    expect(model).toBeTruthy()

    // Build variable map from model XML
    const variableMap = new Map()
    const vars = Array.isArray(model.obj.model.variables.variable)
      ? model.obj.model.variables.variable
      : [model.obj.model.variables.variable]
    for (const v of vars) {
      variableMap.set(v.id.toUpperCase(), v)
    }

    // Replicate the categorization the renderer uses
    const temporalArgs = ['STEP', 'MONTH', 'YEAR', 'PERIOD', 'TIME', 'QUARTER', 'WEEK', 'DAY']
    const constantVars = []
    const cohortStepVars = []
    for (const [varName, varXml] of variableMap) {
      const resolved = model.features.resolvedVarsWithArguments.get(varName)
      const args = resolved && resolved.domain ? resolved.domain : []
      const defType = varXml.definition?.type || ''
      if (args.length === 0 && (defType === 'constant' || defType === 'expression')) {
        constantVars.push(varName)
      } else if (args.length === 1 && temporalArgs.includes(args[0].toUpperCase())) {
        cohortStepVars.push(varName)
      }
    }

    // Build colIndexMap exactly as addCohortStepSheet does: column A is step, vars start at B (index 2)
    const colIndexMap = new Map()
    let colIdx = 1
    for (const varName of cohortStepVars) {
      colIndexMap.set(varName, colIdx + 1)
      colIdx++
    }

    // Verify net_income is in the cohort-step sheet and has a column assigned
    expect(cohortStepVars).toContain('NET_INCOME')
    const netIncomeCol = colIndexMap.get('NET_INCOME')
    expect(netIncomeCol).toBeDefined()

    // Extract the month=0 piecewise value from cumulative_net_income - it should be "net_income(0)"
    const cniVar = variableMap.get('CUMULATIVE_NET_INCOME')
    expect(cniVar).toBeDefined()
    expect(cniVar.definition.type).toBe('piecewise')
    const cases = Array.isArray(cniVar.definition.case) ? cniVar.definition.case : [cniVar.definition.case]
    const month0Case = cases.find(c => {
      const when = c.when?.['#text'] || c.when || ''
      return /month\s*=\s*0/.test(when)
    })
    expect(month0Case).toBeDefined()
    const month0Value = month0Case.value?.['#text'] || month0Case.value || ''
    expect(month0Value.trim()).toContain('net_income(0)')

    // This is the regression: net_income(0) at step=0 (row 2) must convert to a bare cell ref
    const result = convertExpressionToFormula(month0Value.trim(), 2, colIndexMap, cohortStepVars, constantVars, variableMap)

    expect(result).not.toContain('(0)')
    expect(result).not.toContain('net_income')
    // Should be a plain cell reference like "B2" or "C2" etc. (column letter + row 2)
    expect(result).toMatch(/^[A-Z]+2$/)
  })

  it('should clamp variable(month - N) to row 2 when offset exceeds current row', () => {
    const colIndexMap = new Map([['OUTSTANDING_DEBT', 15]])
    const cohortStepVars = ['OUTSTANDING_DEBT']
    const constantVars = []
    const variableMap = new Map()
    const currentRow = 2 // step=0, row 2

    const expression = 'outstanding_debt(month - 1)'
    const result = convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap)

    // Row 2 - 1 = 1 which is the header row, so clamp to row 2
    expect(result).toBe('O2')
    expect(result).not.toContain('outstanding_debt')
  })


})
