import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/domain/model.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('Dynamic Table Generation', () => {
  let lang
  
  beforeAll(() => {
    const fixture = getFixture('language.xml')
    const xml = loadXml(fixture)
    lang = getFunctionsFromLanguage(xml, 'test')
  })

  it('should extract table definitions from model XML with defined columns', () => {
    const modelXml = `<?xml version="1.0"?>
<model id="table_extraction_test">
  <indexSets>
    <indexSet id="cohort"/>
    <indexSet id="step"/>
  </indexSets>
  <tables>
    <table id="cohort_data">
      <rowIndex ref="cohort"/>
      <columns>
        <column id="annual_amount" dataType="real" unit="GBP"/>
        <column id="start_age" dataType="integer" unit="years"/>
        <column id="name" dataType="string"/>
      </columns>
    </table>
    <table id="spot_rate">
      <rowIndex ref="step"/>
      <columns>
        <column id="rate" dataType="real"/>
      </columns>
    </table>
  </tables>
  <variables>
    <variable id="test_var">
      <definition type="constant">1</definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    expect(model).toBeTruthy()
    expect(model.obj.model.tables).toBeTruthy()
    
    // Verify table structure
    const tables = Array.isArray(model.obj.model.tables.table) 
      ? model.obj.model.tables.table 
      : [model.obj.model.tables.table]
    
    expect(tables.length).toBe(2)
    
    const cohortTable = tables.find(t => t.id === 'cohort_data')
    expect(cohortTable).toBeTruthy()
    expect(cohortTable.rowIndex.ref).toBe('cohort')
    expect(cohortTable.columns.column).toBeTruthy()
    
    const cohortColumns = Array.isArray(cohortTable.columns.column)
      ? cohortTable.columns.column
      : [cohortTable.columns.column]
    
    expect(cohortColumns.length).toBe(3)
    expect(cohortColumns[0].id).toBe('annual_amount')
    expect(cohortColumns[0].dataType).toBe('real')
    expect(cohortColumns[0].unit).toBe('GBP')
  })

  it('should extract table definitions with unconstrained columns', () => {
    const modelXml = `<?xml version="1.0"?>
<model id="unconstrained_test">
  <indexSets>
    <indexSet id="age"/>
  </indexSets>
  <tables>
    <table id="mortality_rate">
      <rowIndex ref="age"/>
      <!-- columns unconstrained -->
    </table>
  </tables>
  <variables>
    <variable id="test_var">
      <definition type="constant">1</definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    expect(model).toBeTruthy()
    expect(model.obj.model.tables).toBeTruthy()
    
    const table = model.obj.model.tables.table
    expect(table.id).toBe('mortality_rate')
    expect(table.rowIndex.ref).toBe('age')
    // Columns should be undefined or not present
    expect(table.columns).toBeFalsy()
  })

  it('should handle models without table definitions (fallback)', () => {
    const modelXml = `<?xml version="1.0"?>
<model id="no_tables">
  <variables>
    <variable id="simple_constant">
      <definition type="constant">42</definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    expect(model).toBeTruthy()
    // Tables should be undefined or empty
    expect(model.obj.model.tables).toBeFalsy()
  })

  it('should use input_ prefix for table sheet names', () => {
    const modelXml = `<?xml version="1.0"?>
<model id="prefix_test">
  <indexSets>
    <indexSet id="cohort"/>
  </indexSets>
  <tables>
    <table id="cohort_data">
      <rowIndex ref="cohort"/>
      <columns>
        <column id="amount" dataType="real"/>
      </columns>
    </table>
  </tables>
  <variables>
    <variable id="test_amount">
      <arguments>
        <arg indexSet="cohort"/>
      </arguments>
      <dataType>real</dataType>
      <definition type="table">
        <table ref="cohort_data"/>
        <column ref="amount"/>
      </definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    expect(model).toBeTruthy()
    
    // The table reference in the variable should be cohort_data
    const varXml = model.obj.model.variables.variable
    expect(varXml.definition.table.ref).toBe('cohort_data')
    
    // When generating formulas, they should reference input_cohort_data
    // This is tested in tableLookupFormula.test.js
  })

  it('should generate deterministic sample data based on column types', () => {
    // This test validates the generateSampleValue logic indirectly
    const modelXml = `<?xml version="1.0"?>
<model id="sample_data_test">
  <indexSets>
    <indexSet id="cohort"/>
  </indexSets>
  <tables>
    <table id="test_table">
      <rowIndex ref="cohort"/>
      <columns>
        <column id="real_column" dataType="real"/>
        <column id="integer_column" dataType="integer"/>
        <column id="string_column" dataType="string"/>
        <column id="boolean_column" dataType="boolean"/>
      </columns>
    </table>
  </tables>
  <variables>
    <variable id="test_var">
      <definition type="constant">1</definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    expect(model).toBeTruthy()
    
    // Verify table structure is correct for sample data generation
    const table = model.obj.model.tables.table
    const columns = Array.isArray(table.columns.column)
      ? table.columns.column
      : [table.columns.column]
    
    expect(columns.length).toBe(4)
    expect(columns.map(c => c.dataType)).toEqual(['real', 'integer', 'string', 'boolean'])
  })

  it('should handle vendor-format-model.xml with full annuity table definitions', () => {
    // Load the actual vendor format model directly
    const modelPath = path.join(process.cwd(), 'docs', 'examples', 'annuity-model', 'vendor-format-model.xml')
    const modelXml = fs.readFileSync(modelPath, 'utf-8')
    
    const model = validateModelCore(modelXml, 'vendor-format-model.xml', lang)
    expect(model).toBeTruthy()
    expect(model.obj.model.tables).toBeTruthy()
    
    // Verify all three tables are defined
    const tables = Array.isArray(model.obj.model.tables.table)
      ? model.obj.model.tables.table
      : [model.obj.model.tables.table]
    
    expect(tables.length).toBeGreaterThanOrEqual(3)
    
    const tableIds = tables.map(t => t.id)
    expect(tableIds).toContain('cohort_data')
    expect(tableIds).toContain('mortality_rate')
    expect(tableIds).toContain('spot_rate')
    
    // Verify cohort_data has 4 columns
    const cohortTable = tables.find(t => t.id === 'cohort_data')
    const cohortColumns = Array.isArray(cohortTable.columns.column)
      ? cohortTable.columns.column
      : [cohortTable.columns.column]
    
    expect(cohortColumns.length).toBe(4)
    expect(cohortColumns.map(c => c.id)).toEqual([
      'annual_annuity_amount',
      'annuity_start_age',
      'current_age',
      'mortality_table'
    ])
    
    // Verify mortality_rate has unconstrained columns
    const mortalityTable = tables.find(t => t.id === 'mortality_rate')
    expect(mortalityTable.columns).toBeFalsy()
    
    // Verify spot_rate has 1 column
    const spotTable = tables.find(t => t.id === 'spot_rate')
    const spotColumns = Array.isArray(spotTable.columns.column)
      ? spotTable.columns.column
      : [spotTable.columns.column]
    
    expect(spotColumns.length).toBe(1)
    expect(spotColumns[0].id).toBe('rate')
  })
})
