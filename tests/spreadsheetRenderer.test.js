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
  })
})
