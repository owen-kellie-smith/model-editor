import { describe, it, expect, beforeAll } from 'vitest'
import { renderModelAsExcel } from '../src/core/spreadsheetRenderer.js'
import { generateTableLookupFormula, generateTableLookupFormulaAdvanced } from '../src/core/spreadsheetLogic.js'
import { validateModelCore } from '@/core/model.js'
import { getFunctionsFromLanguage } from '@/core/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'

describe('Table Lookup Formula Generation', () => {
  let lang
  
  beforeAll(() => {
    const fixture = getFixture('language.xml')
    const xml = loadXml(fixture)
    lang = getFunctionsFromLanguage(xml, 'test')
  })

  it('should generate correct INDEX/MATCH formula with dynamic ranges for spot_rate table', async () => {
    // This test validates that formulas use dynamic ranges (A:Z instead of $A$1:$B$122)
    // Dynamic ranges allow users to extend tables without breaking formulas
    // Generic A:Z range works for any table regardless of column count
    const modelXml = `<?xml version="1.0"?>
<model id="spot_rate_test">
  <indexSets>
    <indexSet id="step"/>
  </indexSets>
  <tables>
    <table id="spot_rate">
      <rowIndex ref="step"/>
      <columns>
        <column id="rate" dataType="real"/>
      </columns>
    </table>
  </tables>
  <variables>
    <variable id="rate_lookup">
      <arguments>
        <arg indexSet="step"/>
      </arguments>
      <dataType>real</dataType>
      <definition type="table">
        <table ref="spot_rate"/>
        <column ref="rate"/>
      </definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang, { ignoreUnits: true })
    expect(model).toBeTruthy()
    
    // Get the variable XML for direct formula testing
    const varXml = model.obj.model.variables.variable
    
    // Test formula generation directly
    const formula = generateTableLookupFormula(varXml, 2)
    expect(formula).toBeTruthy()
    
    // Verify the formula uses dynamic ranges (A:Z) instead of static ranges ($A$1:$B$122)
    expect(formula).toContain('input_spot_rate!A:Z')
    expect(formula).toContain('input_spot_rate!A:A')
    
    // Verify column reference is quoted to avoid #NAME errors
    expect(formula).toContain('MATCH("rate"')
    
    // Verify the formula does NOT use old static ranges
    expect(formula).not.toContain('$A$1:')
    expect(formula).not.toContain('$122')
    
    // Expected formula pattern:
    // =INDEX(input_spot_rate!A:Z,MATCH($A2,input_spot_rate!A:A,1),MATCH("rate",input_spot_rate!$1:$1,0))
  })

  it('should use dynamic ranges that work with extended tables', async () => {
    // This test validates that dynamic ranges allow tables to grow beyond original dimensions
    // Users can add rows (e.g., steps 121-200) without modifying formulas
    // Generic A:Z range works for any table regardless of column count
    const modelXml = `<?xml version="1.0"?>
<model id="spot_rate_dimensions">
  <indexSets>
    <indexSet id="step"/>
  </indexSets>
  <tables>
    <table id="spot_rate">
      <rowIndex ref="step"/>
      <columns>
        <column id="rate" dataType="real"/>
      </columns>
    </table>
  </tables>
  <variables>
    <variable id="discount_rate">
      <arguments>
        <arg indexSet="step"/>
      </arguments>
      <dataType>real</dataType>
      <definition type="table">
        <table ref="spot_rate"/>
        <column ref="rate"/>
      </definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang, { ignoreUnits: true })
    expect(model).toBeTruthy()
    
    const varXml = model.obj.model.variables.variable
    const formula = generateTableLookupFormula(varXml, 2)
    
    // Verify dynamic ranges that support unlimited table extension
    expect(formula).toBe('INDEX(input_spot_rate!A:Z,MATCH($A2,input_spot_rate!A:A,1),MATCH("rate",input_spot_rate!$1:$1,0))')
    
    // The table can now be extended from 122 rows to any size without formula updates
  })

  it('should handle table lookups with different table references using dynamic ranges', async () => {
    const modelXml = `<?xml version="1.0"?>
<model id="multi_table_test">
  <indexSets>
    <indexSet id="cohort"/>
  </indexSets>
  <tables>
    <table id="cohort_data">
      <rowIndex ref="cohort"/>
      <columns>
        <column id="annual_amount" dataType="real"/>
        <column id="start_age" dataType="real"/>
      </columns>
    </table>
  </tables>
  <variables>
    <variable id="amount">
      <arguments>
        <arg indexSet="cohort"/>
      </arguments>
      <dataType>real</dataType>
      <definition type="table">
        <table ref="cohort_data"/>
        <column ref="annual_amount"/>
      </definition>
    </variable>
    <variable id="age">
      <arguments>
        <arg indexSet="cohort"/>
      </arguments>
      <dataType>real</dataType>
      <definition type="table">
        <table ref="cohort_data"/>
        <column ref="start_age"/>
      </definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang, { ignoreUnits: true })
    expect(model).toBeTruthy()
    
    const vars = Array.isArray(model.obj.model.variables.variable) 
      ? model.obj.model.variables.variable 
      : [model.obj.model.variables.variable]
    
    // Test both variables
    const amountVar = vars.find(v => v.id === 'amount')
    const ageVar = vars.find(v => v.id === 'age')
    
    const amountFormula = generateTableLookupFormula(amountVar, 2)
    const ageFormula = generateTableLookupFormula(ageVar, 2)
    
    // Both formulas should use dynamic ranges (generic A:Z)
    expect(amountFormula).toContain('input_cohort_data!A:Z')
    expect(amountFormula).toContain('MATCH("annual_amount"')
    expect(amountFormula).toContain('input_cohort_data!$1:$1') // Column header matching
    
    expect(ageFormula).toContain('input_cohort_data!A:Z')
    expect(ageFormula).toContain('MATCH("start_age"')
    expect(ageFormula).toContain('input_cohort_data!$1:$1') // Column header matching
  })

  it('should generate advanced formulas with dynamic ranges for tableLookup definition type', () => {
    // Test advanced table lookup (tableLookup type) uses dynamic ranges
    // Generic A:Z range works for any table regardless of column count
    const varXml = {
      id: 'mortality_lookup',
      definition: {
        type: 'tableLookup',
        table: { ref: 'mortality_rate' },
        row: { ref: 'age' },
        columnSelector: { ref: 'gender_column' }
      }
    }
    
    const colIndexMap = new Map([['AGE', 1]])
    const cohortStepVars = ['age']
    
    const formula = generateTableLookupFormulaAdvanced(varXml, 2, colIndexMap, cohortStepVars)
    expect(formula).toBeTruthy()
    
    // Verify dynamic ranges (generic A:Z)
    expect(formula).toContain('input_mortality_rate!A:Z')
    expect(formula).toContain('input_mortality_rate!A:A')
    expect(formula).toContain('input_mortality_rate!$1:$1') // Column header matching
    
    // Verify no static ranges
    expect(formula).not.toContain('$A$1:')
    expect(formula).not.toContain('$90')
  })
})
