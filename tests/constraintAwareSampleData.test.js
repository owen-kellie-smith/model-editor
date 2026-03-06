import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/core/model.js'
import { getFunctionsFromLanguage } from '@/core/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('Constraint-Aware Sample Data Generation', () => {
  let lang
  
  beforeAll(() => {
    const fixture = getFixture('language.xml')
    const xml = loadXml(fixture)
    lang = getFunctionsFromLanguage(xml, 'test')
  })

  it('should extract columnOf constraints from variables', () => {
    const modelXml = `<?xml version="1.0"?>
<model id="constraint_test">
  <indexSets>
    <indexSet id="cohort"/>
    <indexSet id="age"/>
  </indexSets>
  <tables>
    <table id="cohort_data">
      <rowIndex ref="cohort"/>
      <columns>
        <column id="mortality_table" dataType="string"/>
      </columns>
    </table>
    <table id="mortality_rate">
      <rowIndex ref="age"/>
    </table>
  </tables>
  <variables>
    <variable id="mortality_table">
      <arguments>
        <arg indexSet="cohort"/>
      </arguments>
      <dataType>string</dataType>
      <definition type="table">
        <table ref="cohort_data"/>
        <column ref="mortality_table"/>
      </definition>
      <constraints>
        <mustResolveAs>
          <columnOf table="mortality_rate"/>
        </mustResolveAs>
      </constraints>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    expect(model).toBeTruthy()
    
    // Verify the constraint structure is correct
    const variable = model.obj.model.variables.variable
    expect(variable.id).toBe('mortality_table')
    expect(variable.constraints?.mustResolveAs?.columnOf?.table).toBe('mortality_rate')
    expect(variable.definition?.table?.ref).toBe('cohort_data')
    expect(variable.definition?.column?.ref).toBe('mortality_table')
  })

  it('should handle vendor-format-model.xml with mortality_table constraint', () => {
    const modelPath = getFixture('vendor-format-model.xml')
    const modelXml = fs.readFileSync(modelPath, 'utf-8')
    
    const model = validateModelCore(modelXml, 'vendor-format-model.xml', lang)
    expect(model).toBeTruthy()
    
    // Find the mortality_table variable
    const vars = Array.isArray(model.obj.model.variables.variable)
      ? model.obj.model.variables.variable
      : [model.obj.model.variables.variable]
    
    const mortalityTableVar = vars.find(v => v.id === 'mortality_table')
    expect(mortalityTableVar).toBeTruthy()
    
    // Verify it has the columnOf constraint
    expect(mortalityTableVar.constraints?.mustResolveAs?.columnOf?.table).toBe('mortality_rate')
    
    // Verify it references cohort_data table and mortality_table column
    expect(mortalityTableVar.definition?.table?.ref).toBe('cohort_data')
    expect(mortalityTableVar.definition?.column?.ref).toBe('mortality_table')
  })

  it('should identify tables with columnOf constraints pointing to them', () => {
    const modelXml = `<?xml version="1.0"?>
<model id="multi_constraint_test">
  <indexSets>
    <indexSet id="cohort"/>
    <indexSet id="age"/>
  </indexSets>
  <tables>
    <table id="input_data">
      <rowIndex ref="cohort"/>
      <columns>
        <column id="col_ref_1" dataType="string"/>
        <column id="col_ref_2" dataType="string"/>
        <column id="normal_col" dataType="real"/>
      </columns>
    </table>
    <table id="lookup_table_1">
      <rowIndex ref="age"/>
      <columns>
        <column id="rate_a" dataType="real"/>
        <column id="rate_b" dataType="real"/>
      </columns>
    </table>
    <table id="lookup_table_2">
      <rowIndex ref="age"/>
      <columns>
        <column id="factor_x" dataType="real"/>
        <column id="factor_y" dataType="real"/>
        <column id="factor_z" dataType="real"/>
      </columns>
    </table>
  </tables>
  <variables>
    <variable id="col_ref_1">
      <arguments>
        <arg indexSet="cohort"/>
      </arguments>
      <dataType>string</dataType>
      <definition type="table">
        <table ref="input_data"/>
        <column ref="col_ref_1"/>
      </definition>
      <constraints>
        <mustResolveAs>
          <columnOf table="lookup_table_1"/>
        </mustResolveAs>
      </constraints>
    </variable>
    <variable id="col_ref_2">
      <arguments>
        <arg indexSet="cohort"/>
      </arguments>
      <dataType>string</dataType>
      <definition type="table">
        <table ref="input_data"/>
        <column ref="col_ref_2"/>
      </definition>
      <constraints>
        <mustResolveAs>
          <columnOf table="lookup_table_2"/>
        </mustResolveAs>
      </constraints>
    </variable>
    <variable id="normal_col">
      <arguments>
        <arg indexSet="cohort"/>
      </arguments>
      <dataType>real</dataType>
      <definition type="table">
        <table ref="input_data"/>
        <column ref="normal_col"/>
      </definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    expect(model).toBeTruthy()
    
    // Verify all tables exist
    const tables = Array.isArray(model.obj.model.tables.table)
      ? model.obj.model.tables.table
      : [model.obj.model.tables.table]
    
    expect(tables.length).toBe(3)
    
    // Verify lookup_table_1 has 2 columns
    const lookupTable1 = tables.find(t => t.id === 'lookup_table_1')
    const cols1 = Array.isArray(lookupTable1.columns.column)
      ? lookupTable1.columns.column
      : [lookupTable1.columns.column]
    expect(cols1.map(c => c.id)).toEqual(['rate_a', 'rate_b'])
    
    // Verify lookup_table_2 has 3 columns
    const lookupTable2 = tables.find(t => t.id === 'lookup_table_2')
    const cols2 = Array.isArray(lookupTable2.columns.column)
      ? lookupTable2.columns.column
      : [lookupTable2.columns.column]
    expect(cols2.map(c => c.id)).toEqual(['factor_x', 'factor_y', 'factor_z'])
    
    // Verify constraints are properly set
    const vars = Array.isArray(model.obj.model.variables.variable)
      ? model.obj.model.variables.variable
      : [model.obj.model.variables.variable]
    
    const colRef1 = vars.find(v => v.id === 'col_ref_1')
    expect(colRef1.constraints?.mustResolveAs?.columnOf?.table).toBe('lookup_table_1')
    
    const colRef2 = vars.find(v => v.id === 'col_ref_2')
    expect(colRef2.constraints?.mustResolveAs?.columnOf?.table).toBe('lookup_table_2')
    
    const normalCol = vars.find(v => v.id === 'normal_col')
    expect(normalCol.constraints).toBeFalsy()
  })

  it('should handle unconstrained tables correctly', () => {
    const modelXml = `<?xml version="1.0"?>
<model id="unconstrained_test">
  <indexSets>
    <indexSet id="age"/>
  </indexSets>
  <tables>
    <table id="mortality_rate">
      <rowIndex ref="age" min="17" max="104"/>
      <!-- columns unconstrained - will be dynamically generated -->
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
    
    const table = model.obj.model.tables.table
    expect(table.id).toBe('mortality_rate')
    expect(table.rowIndex.ref).toBe('age')
    expect(table.rowIndex.min).toBe('17')
    expect(table.rowIndex.max).toBe('104')
    
    // Unconstrained table should have no columns defined
    expect(table.columns).toBeFalsy()
  })
})
