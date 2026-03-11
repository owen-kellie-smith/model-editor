import { describe, it, expect } from 'vitest'
import { getUnrenderableFunctionNames } from '@/core/renderShared.js'
import { validateModelCore } from '@/core/model.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'

// ── Helper: build a minimal valid model XML string ─────────────────────────

function makeModelXml({ functions = '', variables = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model id="test-model">
  <indexSets>
    <indexSet id="t" role="temporal">
      <dataType>integer</dataType>
      <min>0</min><max>2</max>
    </indexSet>
  </indexSets>
  <units><unit id="GBP"/></units>
  ${functions ? `<functions>${functions}</functions>` : ''}
  <variables>
    ${variables}
  </variables>
</model>`
}

function singleVar(id, expr) {
  return `<variable id="${id}">
    <unit>1</unit>
    <definition type="expression">${expr}</definition>
  </variable>`
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('getUnrenderableFunctionNames', () => {
  it('returns empty array when model has no custom functions', () => {
    const xml = makeModelXml({
      variables: singleVar('X', 'floor(2.5) + 1'),
    })
    const { obj } = validateModelCore(xml, 'test', null, { ignoreUnits: true })
    expect(getUnrenderableFunctionNames(obj)).toEqual([])
  })

  it('returns empty array when model uses only standard built-in functions', () => {
    const xml = makeModelXml({
      variables: singleVar('X', 'min(1, max(0, floor(2.5)))'),
    })
    const { obj } = validateModelCore(xml, 'test', null, { ignoreUnits: true })
    expect(getUnrenderableFunctionNames(obj)).toEqual([])
  })

  it('returns empty array when custom function has a definition', () => {
    const xml = makeModelXml({
      functions: '<function name="MyFunc" arity="1"><definition type="expression">#text</definition></function>',
      variables: singleVar('X', 'MyFunc(1)'),
    })
    const { obj } = validateModelCore(xml, 'test', null, { ignoreUnits: true })
    expect(getUnrenderableFunctionNames(obj)).toEqual([])
  })

  it('returns function name when custom function has no definition and is used', () => {
    const xml = makeModelXml({
      functions: '<function name="GetModelPoint" arity="1"/>',
      variables: singleVar('X', 'GetModelPoint(1)'),
    })
    const { obj } = validateModelCore(xml, 'test', null, { ignoreUnits: true })
    expect(getUnrenderableFunctionNames(obj)).toEqual(['GETMODELPOINT'])
  })

  it('does not return a custom function that is declared but never called', () => {
    const xml = makeModelXml({
      functions: '<function name="Orphan" arity="0"/>',
      variables: singleVar('X', '42'),
    })
    const { obj } = validateModelCore(xml, 'test', null, { ignoreUnits: true })
    expect(getUnrenderableFunctionNames(obj)).toEqual([])
  })

  it('returns multiple unrenderable functions sorted alphabetically', () => {
    const xml = makeModelXml({
      functions: `
        <function name="GetDouble" minArgs="2"/>
        <function name="GetRate" arity="1"/>
      `,
      variables: `
        ${singleVar('A', 'GetDouble(x, 1)')}
        ${singleVar('B', 'GetRate(2)')}
        ${singleVar('X', '1')}
      `,
    })
    const { obj } = validateModelCore(xml, 'test', null, { ignoreUnits: true })
    const result = getUnrenderableFunctionNames(obj)
    expect(result).toEqual(['GETDOUBLE', 'GETRATE'])
  })

  it('detects unrenderable function used in a piecewise when clause', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model id="test-model">
  <indexSets>
    <indexSet id="t" role="temporal">
      <dataType>integer</dataType><min>0</min><max>2</max>
    </indexSet>
  </indexSets>
  <units/>
  <functions>
    <function name="VendorCheck" arity="1"/>
  </functions>
  <variables>
    <variable id="X">
      <unit>1</unit>
      <definition type="piecewise">
        <case>
          <when>VendorCheck(t) = 1</when>
          <value>1</value>
        </case>
        <case>
          <when>1 = 1</when>
          <value>0</value>
        </case>
      </definition>
    </variable>
  </variables>
</model>`
    const { obj } = validateModelCore(xml, 'test', null, { ignoreUnits: true })
    expect(getUnrenderableFunctionNames(obj)).toEqual(['VENDORCHECK'])
  })

  it('detects unrenderable function used in a piecewise value clause', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model id="test-model">
  <indexSets>
    <indexSet id="t" role="temporal">
      <dataType>integer</dataType><min>0</min><max>2</max>
    </indexSet>
  </indexSets>
  <units/>
  <functions>
    <function name="VendorValue" arity="1"/>
  </functions>
  <variables>
    <variable id="X">
      <unit>1</unit>
      <definition type="piecewise">
        <case>
          <when>t = 0</when>
          <value>VendorValue(t)</value>
        </case>
        <case>
          <when>1 = 1</when>
          <value>0</value>
        </case>
      </definition>
    </variable>
  </variables>
</model>`
    const { obj } = validateModelCore(xml, 'test', null, { ignoreUnits: true })
    expect(getUnrenderableFunctionNames(obj)).toEqual(['VENDORVALUE'])
  })

  it('handles the legacy toyMM_L1 fixture – detects all three vendor functions', () => {
    const xml = fs.readFileSync(getFixture('toyMM_L1.xml'), 'utf-8')
    const { obj } = validateModelCore(xml, 'toyMM_L1.xml', null, { ignoreUnits: true })
    const result = getUnrenderableFunctionNames(obj)
    expect(result).toContain('GETMODELPOINT')
    expect(result).toContain('GETDOUBLETABLEVALUE')
    expect(result).toContain('GETMULTIULTMORTRATE')
  })
})
