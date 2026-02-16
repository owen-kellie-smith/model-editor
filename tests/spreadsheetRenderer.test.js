import { describe, it, expect, beforeAll } from 'vitest'
import { renderModelAsSpreadsheet } from '../docs/src/domain/spreadsheetRenderer.js'
import { validateModelCore } from '@/domain/model.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { loadXml, loadXmlFromText } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('Spreadsheet Renderer', () => {
  let lang
  
  beforeAll(() => {
    const fixture = getFixture('language.xml')
    const xml = loadXml(fixture)
    lang = getFunctionsFromLanguage(xml, 'test')
  })

  describe('renderModelAsSpreadsheet', () => {
    it('should throw error for invalid model object', () => {
      expect(() => renderModelAsSpreadsheet(null, {})).toThrow('Invalid model object')
      expect(() => renderModelAsSpreadsheet({}, {})).toThrow('Invalid model object')
    })

    it('should throw error for invalid model features', () => {
      const modelObj = { model: {} }
      expect(() => renderModelAsSpreadsheet(modelObj, null)).toThrow('Invalid model features')
      expect(() => renderModelAsSpreadsheet(modelObj, {})).toThrow('Invalid model features')
    })

    it('should render a simple constant model as CSV', () => {
      const modelXml = `<?xml version="1.0"?>
<model id="simple">
  <variables>
    <variable id="XXX">
      <definition type="constant">999</definition>
    </variable>
  </variables>
</model>`
      
      const model = validateModelCore(modelXml, 'test.xml', lang)
      
      const csv = renderModelAsSpreadsheet(model.obj, model.features)
      
      expect(csv).toBeTruthy()
      expect(csv).toContain('Variable ID')
      expect(csv).toContain('Definition Type')
      expect(csv).toContain('XXX')
      expect(csv).toContain('constant')
      expect(csv).toContain('999')
      expect(csv).toContain('INPUT') // No dependencies, so it's an input
    })

    it('should render variables in dependency order', () => {
      const modelXml = `<?xml version="1.0"?>
<model id="dependency_test">
  <variables>
    <variable id="C">
      <definition type="expression">A + B</definition>
    </variable>
    <variable id="A">
      <definition type="constant">10</definition>
    </variable>
    <variable id="B">
      <definition type="constant">20</definition>
    </variable>
  </variables>
</model>`
      
      const model = validateModelCore(modelXml, 'test.xml', lang)
      
      const csv = renderModelAsSpreadsheet(model.obj, model.features)
      const lines = csv.split('\n')
      
      // Find row indices
      const aIndex = lines.findIndex(line => line.startsWith('A,'))
      const bIndex = lines.findIndex(line => line.startsWith('B,'))
      const cIndex = lines.findIndex(line => line.startsWith('C,'))
      
      // A and B should come before C (they can be in any order relative to each other)
      expect(aIndex).toBeLessThan(cIndex)
      expect(bIndex).toBeLessThan(cIndex)
      expect(aIndex).toBeGreaterThan(0) // Not the header
      expect(bIndex).toBeGreaterThan(0)
      expect(cIndex).toBeGreaterThan(0)
    })

    it('should include data types and units when present', () => {
      const modelXml = `<?xml version="1.0"?>
<model id="typed_model">
  <variables>
    <variable id="price">
      <definition type="constant">100.50</definition>
      <dataType>real</dataType>
      <unit>GBP</unit>
    </variable>
  </variables>
</model>`
      
      const model = validateModelCore(modelXml, 'test.xml', lang)
      
      const csv = renderModelAsSpreadsheet(model.obj, model.features)
      
      expect(csv).toContain('price')
      expect(csv).toContain('real')
      expect(csv).toContain('GBP')
    })

    it('should list dependencies for expression variables', () => {
      const modelXml = `<?xml version="1.0"?>
<model id="expr_model">
  <variables>
    <variable id="sum">
      <definition type="expression">x + y</definition>
    </variable>
    <variable id="x">
      <definition type="constant">5</definition>
    </variable>
    <variable id="y">
      <definition type="constant">3</definition>
    </variable>
  </variables>
</model>`
      
      
      const model = validateModelCore(modelXml, 'test.xml', lang)
      
      const csv = renderModelAsSpreadsheet(model.obj, model.features)
      const lines = csv.split('\n')
      
      // Find the sum row
      const sumLine = lines.find(line => line.startsWith('sum,'))
      expect(sumLine).toBeTruthy()
      
      // Should contain dependencies (X and Y in some order)
      expect(sumLine).toMatch(/X.*Y|Y.*X/)
    })

    it('should handle CSV escaping for formulas with commas', () => {
      const modelXml = `<?xml version="1.0"?>
<model id="comma_test">
  <variables>
    <variable id="result">
      <definition type="expression">max(a, b)</definition>
    </variable>
    <variable id="a">
      <definition type="constant">1</definition>
    </variable>
    <variable id="b">
      <definition type="constant">2</definition>
    </variable>
  </variables>
</model>`
      
      const langWithMax = `<?xml version="1.0"?>
<language>
  <functions>
    <function name="max" arity="2"/>
  </functions>
</language>`
      const xmlMax = loadXmlFromText(langWithMax)
      const langMax = getFunctionsFromLanguage(xmlMax, 'test')
      const model = validateModelCore(modelXml, 'test.xml', langMax)
      
      const csv = renderModelAsSpreadsheet(model.obj, model.features)
      
      // Should contain quoted formula due to comma
      expect(csv).toContain('"max(a, b)"')
    })

    it('should work with a model from fixtures', () => {
      const modelPath = path.join(process.cwd(), 'docs', 'examples', 'short', 'shortModel.xml')
      const modelXml = fs.readFileSync(modelPath, 'utf-8')
      
      const model = validateModelCore(modelXml, 'shortModel.xml', lang)
      
      const csv = renderModelAsSpreadsheet(model.obj, model.features)
      
      expect(csv).toBeTruthy()
      expect(csv).toContain('Variable ID')
      // Check for the variable in shortModel.xml
      expect(csv).toContain('XXX')
      expect(csv).toContain('999')
    })

    it('should reflect changes when model formulae are edited', () => {
      // Create two models with different formulas for the same variable IDs
      const modelXml1 = `<?xml version="1.0"?>
<model id="test1">
  <variables>
    <variable id="A">
      <definition type="constant">10</definition>
    </variable>
    <variable id="B">
      <definition type="constant">20</definition>
    </variable>
    <variable id="C">
      <definition type="expression">A + B</definition>
    </variable>
  </variables>
</model>`

      const modelXml2 = `<?xml version="1.0"?>
<model id="test2">
  <variables>
    <variable id="A">
      <definition type="constant">100</definition>
    </variable>
    <variable id="B">
      <definition type="constant">200</definition>
    </variable>
    <variable id="C">
      <definition type="expression">A * B</definition>
    </variable>
  </variables>
</model>`

      const model1 = validateModelCore(modelXml1, 'test1.xml', lang)
      const model2 = validateModelCore(modelXml2, 'test2.xml', lang)

      const csv1 = renderModelAsSpreadsheet(model1.obj, model1.features)
      const csv2 = renderModelAsSpreadsheet(model2.obj, model2.features)

      // CSVs should be different because formulas are different
      expect(csv1).not.toEqual(csv2)
      
      // Check that first model has addition formula
      expect(csv1).toContain('A + B')
      
      // Check that second model has multiplication formula  
      expect(csv2).toContain('A * B')
      
      // Check that constant values are different
      expect(csv1).toContain('10')
      expect(csv1).toContain('20')
      expect(csv2).toContain('100')
      expect(csv2).toContain('200')
    })

    it('should handle models with table definitions including min/max attributes', () => {
      // Note: This test verifies that min/max attributes are correctly parsed from XML.
      // The actual sample value generation using min/max only occurs in Excel rendering
      // (renderModelAsExcel), not in CSV rendering (renderModelAsSpreadsheet).
      // Excel rendering is not tested here due to ExcelJS dependencies in the test environment.
      const modelXml = `<?xml version="1.0"?>
<model id="test_with_minmax">
  <indexSets>
    <indexSet id="cohort">
      <dataType>string</dataType>
    </indexSet>
  </indexSets>
  
  <tables>
    <table id="cohort_data">
      <rowIndex ref="cohort"/>
      <columns>
        <column id="amount" dataType="real" min="10" max="50"/>
        <column id="age" dataType="real" min="55" max="75"/>
        <column id="count" dataType="integer" min="100" max="200"/>
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
        <column ref="amount"/>
      </definition>
    </variable>
  </variables>
</model>`
      
      // Should validate successfully with min/max attributes
      const model = validateModelCore(modelXml, 'test.xml', lang)
      
      expect(model).toBeTruthy()
      expect(model.obj).toBeTruthy()
      expect(model.obj.model).toBeTruthy()
      expect(model.obj.model.tables).toBeTruthy()
      
      // Check that table definitions are parsed correctly
      const tables = Array.isArray(model.obj.model.tables.table) 
        ? model.obj.model.tables.table 
        : [model.obj.model.tables.table]
      
      expect(tables.length).toBeGreaterThan(0)
      const cohortTable = tables.find(t => t.id === 'cohort_data')
      expect(cohortTable).toBeTruthy()
      
      // Check that columns with min/max are present
      const columns = Array.isArray(cohortTable.columns.column) 
        ? cohortTable.columns.column 
        : [cohortTable.columns.column]
      
      expect(columns.length).toBe(3)
      
      const amountCol = columns.find(c => c.id === 'amount')
      expect(amountCol).toBeTruthy()
      expect(amountCol.min).toBe('10')
      expect(amountCol.max).toBe('50')
      
      const ageCol = columns.find(c => c.id === 'age')
      expect(ageCol).toBeTruthy()
      expect(ageCol.min).toBe('55')
      expect(ageCol.max).toBe('75')
      
      const countCol = columns.find(c => c.id === 'count')
      expect(countCol).toBeTruthy()
      expect(countCol.min).toBe('100')
      expect(countCol.max).toBe('200')
      
      // Should render as CSV successfully
      const csv = renderModelAsSpreadsheet(model.obj, model.features)
      expect(csv).toBeTruthy()
      expect(csv).toContain('amount')
    })

    it('should handle edge cases for min/max attributes', () => {
      const modelXml = `<?xml version="1.0"?>
<model id="test_edge_cases">
  <indexSets>
    <indexSet id="cohort">
      <dataType>string</dataType>
    </indexSet>
  </indexSets>
  
  <tables>
    <table id="edge_cases">
      <rowIndex ref="cohort"/>
      <columns>
        <column id="same_value" dataType="real" min="100" max="100"/>
        <column id="invalid_min" dataType="real" min="invalid" max="50"/>
        <column id="string_with_minmax" dataType="string" min="10" max="50"/>
      </columns>
    </table>
  </tables>
  
  <variables>
    <variable id="same_value">
      <arguments>
        <arg indexSet="cohort"/>
      </arguments>
      <dataType>real</dataType>
      <definition type="table">
        <table ref="edge_cases"/>
        <column ref="same_value"/>
      </definition>
    </variable>
  </variables>
</model>`
      
      // Should validate successfully even with edge case min/max values
      const model = validateModelCore(modelXml, 'test.xml', lang)
      
      expect(model).toBeTruthy()
      expect(model.obj).toBeTruthy()
      
      // Check that table definitions are parsed correctly
      const tables = Array.isArray(model.obj.model.tables.table) 
        ? model.obj.model.tables.table 
        : [model.obj.model.tables.table]
      
      const edgeCaseTable = tables.find(t => t.id === 'edge_cases')
      expect(edgeCaseTable).toBeTruthy()
      
      const columns = Array.isArray(edgeCaseTable.columns.column) 
        ? edgeCaseTable.columns.column 
        : [edgeCaseTable.columns.column]
      
      // Check that same min/max is handled
      const sameValueCol = columns.find(c => c.id === 'same_value')
      expect(sameValueCol).toBeTruthy()
      expect(sameValueCol.min).toBe('100')
      expect(sameValueCol.max).toBe('100')
      
      // Check that invalid min is present but will be filtered during parsing
      const invalidMinCol = columns.find(c => c.id === 'invalid_min')
      expect(invalidMinCol).toBeTruthy()
      
      // Check that string columns with min/max don't break
      const stringCol = columns.find(c => c.id === 'string_with_minmax')
      expect(stringCol).toBeTruthy()
      expect(stringCol.dataType).toBe('string')
      
      // Should render as CSV successfully despite edge cases
      const csv = renderModelAsSpreadsheet(model.obj, model.features)
      expect(csv).toBeTruthy()
      expect(csv).toContain('same_value')
    })

    it('should use model-driven min/max for rowIndex to determine sample row count', () => {
      // Test that rowIndex min/max attributes control the number of sample rows generated
      // Note: This test verifies XML parsing only. Actual sample data generation happens
      // in renderModelAsExcel which requires ExcelJS (not available in test environment).
      const modelXml = `<?xml version="1.0"?>
<model id="test_rowindex_minmax">
  <indexSets>
    <indexSet id="age">
      <dataType>integer</dataType>
    </indexSet>
    <indexSet id="step">
      <dataType>integer</dataType>
    </indexSet>
  </indexSets>
  
  <tables>
    <table id="small_range">
      <rowIndex ref="age" min="20" max="25"/>
      <columns>
        <column id="value" dataType="real" min="1.0" max="10.0"/>
      </columns>
    </table>
    
    <table id="large_range">
      <rowIndex ref="step" min="0" max="120"/>
      <columns>
        <column id="rate" dataType="real" min="0.01" max="0.08"/>
      </columns>
    </table>
    
    <table id="no_minmax">
      <rowIndex ref="age"/>
      <columns>
        <column id="other" dataType="real"/>
      </columns>
    </table>
  </tables>
  
  <variables>
    <variable id="value">
      <arguments>
        <arg indexSet="age"/>
      </arguments>
      <dataType>real</dataType>
      <definition type="table">
        <table ref="small_range"/>
        <column ref="value"/>
      </definition>
    </variable>
  </variables>
</model>`
      
      const model = validateModelCore(modelXml, 'test.xml', lang)
      
      expect(model).toBeTruthy()
      expect(model.obj).toBeTruthy()
      expect(model.obj.model.tables).toBeTruthy()
      
      // Check that rowIndex min/max are parsed correctly
      const tables = Array.isArray(model.obj.model.tables.table) 
        ? model.obj.model.tables.table 
        : [model.obj.model.tables.table]
      
      const smallRangeTable = tables.find(t => t.id === 'small_range')
      expect(smallRangeTable).toBeTruthy()
      expect(smallRangeTable.rowIndex).toBeTruthy()
      expect(smallRangeTable.rowIndex.min).toBe('20')
      expect(smallRangeTable.rowIndex.max).toBe('25')
      
      // Verify column min/max are also parsed
      const smallRangeColumns = Array.isArray(smallRangeTable.columns.column)
        ? smallRangeTable.columns.column
        : [smallRangeTable.columns.column]
      const valueCol = smallRangeColumns.find(c => c.id === 'value')
      expect(valueCol).toBeTruthy()
      expect(valueCol.min).toBe('1.0')
      expect(valueCol.max).toBe('10.0')
      
      const largeRangeTable = tables.find(t => t.id === 'large_range')
      expect(largeRangeTable).toBeTruthy()
      expect(largeRangeTable.rowIndex.min).toBe('0')
      expect(largeRangeTable.rowIndex.max).toBe('120')
      
      // Verify column min/max for large range
      const largeRangeColumns = Array.isArray(largeRangeTable.columns.column)
        ? largeRangeTable.columns.column
        : [largeRangeTable.columns.column]
      const rateCol = largeRangeColumns.find(c => c.id === 'rate')
      expect(rateCol).toBeTruthy()
      expect(rateCol.min).toBe('0.01')
      expect(rateCol.max).toBe('0.08')
      
      const noMinMaxTable = tables.find(t => t.id === 'no_minmax')
      expect(noMinMaxTable).toBeTruthy()
      expect(noMinMaxTable.rowIndex.min).toBeUndefined()
      expect(noMinMaxTable.rowIndex.max).toBeUndefined()
      
      // Should render successfully (validates the model is well-formed)
      const csv = renderModelAsSpreadsheet(model.obj, model.features)
      expect(csv).toBeTruthy()
    })
  })
})
