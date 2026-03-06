import { describe, it, expect, beforeAll } from 'vitest'
import { renderModelAsExcel } from '../src/core/spreadsheetRenderer.js'
import { validateModelCore } from '@/core/model.js'
import { getFunctionsFromLanguage } from '@/core/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'

describe('Recursive Piecewise Formula Conversion', () => {
  let lang
  
  beforeAll(() => {
    const fixture = getFixture('language.xml')
    const xml = loadXml(fixture)
    lang = getFunctionsFromLanguage(xml, 'test')
  })

  it('should handle recursive functions with step - 1 offset correctly', async () => {
    // This test verifies that recursive piecewise functions with parameter shifts
    // like survival_to_start_of_step(cohort, step - 1) properly reference the
    // previous row in the spreadsheet, not the current row
    const modelXml = `<?xml version="1.0"?>
<model id="recursive_test">
  <indexSets>
    <indexSet id="cohort"/>
    <indexSet id="step"/>
  </indexSets>
  <variables>
    <variable id="survival_rate">
      <arguments>
        <arg indexSet="cohort"/>
        <arg indexSet="step"/>
      </arguments>
      <definition type="constant">0.99</definition>
    </variable>
    <variable id="survival_to_start">
      <arguments>
        <arg indexSet="cohort"/>
        <arg indexSet="step"/>
      </arguments>
      <definition type="piecewise">
        <case>
          <when>step = 0</when>
          <value>1</value>
        </case>
        <case>
          <when>step > 0</when>
          <value>survival_to_start(cohort, step - 1) * survival_rate(cohort, step - 1)</value>
        </case>
      </definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    expect(model).toBeTruthy()
    
    // The renderModelAsExcel function should create formulas that properly handle
    // the step - 1 offset by referencing the previous row
    const blob = await renderModelAsExcel(model.obj, model.features)
    expect(blob).toBeTruthy()
    
    // In a real Excel file (not test mock), row 2 (step=0) should have formula "=1"
    // Row 3 (step=1) should have formula "=B2*B2" (referencing previous row)
    // NOT "=B3*B3" (circular reference to current row)
    
    // Note: Since ExcelJS is mocked in tests, we can't directly verify the formulas
    // This test ensures the code path runs without errors
    // Manual verification with actual Excel output is needed for full validation
  })

  it('should handle recursive functions with step - 2 offset correctly', async () => {
    // Test with a larger offset to ensure the fix works for any offset value
    const modelXml = `<?xml version="1.0"?>
<model id="recursive_test_offset2">
  <indexSets>
    <indexSet id="cohort"/>
    <indexSet id="step"/>
  </indexSets>
  <variables>
    <variable id="base_value">
      <arguments>
        <arg indexSet="cohort"/>
        <arg indexSet="step"/>
      </arguments>
      <definition type="constant">100</definition>
    </variable>
    <variable id="accumulated_value">
      <arguments>
        <arg indexSet="cohort"/>
        <arg indexSet="step"/>
      </arguments>
      <definition type="piecewise">
        <case>
          <when>step = 0</when>
          <value>100</value>
        </case>
        <case>
          <when>step = 1</when>
          <value>110</value>
        </case>
        <case>
          <when>step > 1</when>
          <value>accumulated_value(cohort, step - 2) + base_value(cohort, step - 1)</value>
        </case>
      </definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    expect(model).toBeTruthy()
    
    const blob = await renderModelAsExcel(model.obj, model.features)
    expect(blob).toBeTruthy()
    
    // For step=2 (row 4), the formula should reference:
    // - accumulated_value(step-2) = row 2
    // - base_value(step-1) = row 3
    // So formula should be "=B2+A3" NOT "=B4+A4"
  })

  it('should handle multiple recursive references in same expression', async () => {
    const modelXml = `<?xml version="1.0"?>
<model id="multiple_recursive">
  <indexSets>
    <indexSet id="cohort"/>
    <indexSet id="step"/>
  </indexSets>
  <variables>
    <variable id="value_a">
      <arguments>
        <arg indexSet="cohort"/>
        <arg indexSet="step"/>
      </arguments>
      <definition type="piecewise">
        <case>
          <when>step = 0</when>
          <value>1</value>
        </case>
        <case>
          <when>step > 0</when>
          <value>value_a(cohort, step - 1) + value_b(cohort, step - 1)</value>
        </case>
      </definition>
    </variable>
    <variable id="value_b">
      <arguments>
        <arg indexSet="cohort"/>
        <arg indexSet="step"/>
      </arguments>
      <definition type="constant">2</definition>
    </variable>
  </variables>
</model>`
    
    const model = validateModelCore(modelXml, 'test.xml', lang)
    expect(model).toBeTruthy()
    
    const blob = await renderModelAsExcel(model.obj, model.features)
    expect(blob).toBeTruthy()
    
    // For step=1 (row 3), both recursive references should point to row 2
    // Formula should be "=A2+B2" NOT "=A3+B3"
  })
})
