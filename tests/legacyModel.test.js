import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/domain/model.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { renderModelAsSpreadsheet } from '@/domain/spreadsheetRenderer.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('Legacy Model Format', () => {
  let lang
  
  beforeAll(() => {
    const fixture = getFixture('language.xml')
    const xml = loadXml(fixture)
    lang = getFunctionsFromLanguage(xml, 'test')
  })

  it('should load legacy-format-model.xml without circular reference error', () => {
    const modelPath = path.join(process.cwd(), 'docs', 'examples', 'annuity-model', 'legacy-format-model.xml')
    const modelXml = fs.readFileSync(modelPath, 'utf-8')
    
    // This should not throw an error about circular references
    const model = validateModelCore(modelXml, 'legacy-format-model.xml', lang)
    
    expect(model).toBeTruthy()
    expect(model.features.variables).toBeTruthy()
    expect(model.features.variables.length).toBeGreaterThan(0)
  })

  it('should render legacy-format-model.xml as spreadsheet', () => {
    const modelPath = path.join(process.cwd(), 'docs', 'examples', 'annuity-model', 'legacy-format-model.xml')
    const modelXml = fs.readFileSync(modelPath, 'utf-8')
    
    const model = validateModelCore(modelXml, 'legacy-format-model.xml', lang)
    
    // This should not throw a circular dependency error
    const csv = renderModelAsSpreadsheet(model.obj, model.features)
    
    expect(csv).toBeTruthy()
    expect(csv).toContain('Variable ID')
  })

  it('should use uppercase cell references in Excel formulas to avoid #NAME errors in LibreOffice Calc', async () => {
    // LibreOffice Calc treats lowercase cell references (e.g., b2) as named ranges
    // and produces #NAME errors if they don't exist. Uppercase references (e.g., B2)
    // are correctly interpreted as cell references.
    const modelXml = `<?xml version="1.0"?>
<model id="test">
  <variables>
    <variable id="a">
      <definition type="constant">10</definition>
    </variable>
    <variable id="b">
      <definition type="constant">20</definition>
    </variable>
    <variable id="sum">
      <definition type="expression">a + b</definition>
    </variable>
  </variables>
</model>`
    
    const { renderModelAsExcel } = await import('@/domain/spreadsheetRenderer.js')
    const model = validateModelCore(modelXml, 'test.xml', lang)
    const excelBlob = await renderModelAsExcel(model.obj, model.features)
    
    // Read the blob content
    const excelXml = await excelBlob.text()
    
    // Check that all cell references in formulas are uppercase (A-Z column, digit row)
    // This regex matches any Excel formula attribute and checks for uppercase references
    const formulaMatches = excelXml.match(/ss:Formula="=[^"]*"/g)
    if (formulaMatches) {
      for (const formula of formulaMatches) {
        // Verify uppercase column letters (should have [A-Z]\d+, not [a-z]\d+)
        expect(formula).toMatch(/=[^"]*[A-Z]\d+/)
        expect(formula).not.toMatch(/[a-z]\d+/)
      }
    }
  })
})
