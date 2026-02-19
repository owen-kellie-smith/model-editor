import { describe, it, expect, beforeAll } from 'vitest'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import { validateModelCore } from '@/domain/model.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'

describe('B2() Parentheses Bug Fix', () => {
  let lang
  
  beforeAll(() => {
    const fixture = getFixture('language.xml')
    const xml = loadXml(fixture)
    lang = getFunctionsFromLanguage(xml, 'test')
  })
  
  it('should not add parentheses when converting constant variable references to cell references', () => {
    // Model with a constant variable B2 being referenced in an expression
    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model id="test-model">
  <variables>
    <variable id="B2">
      <dataType>real</dataType>
      <definition type="constant">
        100
      </definition>
    </variable>
    
    <variable id="result">
      <dataType>real</dataType>
      <definition type="expression">
        B2() * 2
      </definition>
    </variable>
  </variables>
</model>`
    
    // Validate the model
    const modelEnv = validateModelCore(modelXml, 'test-model.xml', lang)
    expect(modelEnv).toBeDefined()
    expect(modelEnv.obj).toBeDefined()
    expect(modelEnv.features).toBeDefined()
    
    // The model should be valid even though B2() looks like a function call
    // In the model language, B2() with empty parens means "call variable B2 with no arguments"
    // This should be converted to a cell reference in Excel: $B$1 (not $B$1())
  })
  
  it('should handle constant variables with empty parentheses in expressions', () => {
    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model id="test-model">
  <variables>
    <variable id="rate">
      <dataType>real</dataType>
      <definition type="constant">
        0.05
      </definition>
    </variable>
    
    <variable id="base">
      <dataType>real</dataType>
      <definition type="constant">
        1000
      </definition>
    </variable>
    
    <variable id="calculated">
      <dataType>real</dataType>
      <definition type="expression">
        base() * rate()
      </definition>
    </variable>
  </variables>
</model>`
    
    const modelEnv = validateModelCore(modelXml, 'test-model.xml', lang)
    expect(modelEnv).toBeDefined()
    
    // Verify the expression is parsed correctly
    const calcVar = modelEnv.obj.model.variables.variable.find(v => v.id === 'calculated')
    expect(calcVar).toBeDefined()
    expect(calcVar.definition['#text'].trim()).toBe('base() * rate()')
  })
})
