/**
 * Tests for spreadsheetLogic.js – pure domain functions that do not require ExcelJS.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import { validateModelCore } from '@/domain/model.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'

import {
  makeRenderContext,
  categorizeVariables,
  analyzeModelDiagnostics,
  getColumnLetter,
  escapeRegex,
  generateFormulaForVariable,
  generateTableLookupFormula,
  convertConstantExpressionToFormula,
  topologicalSort,
  renderSheetAsHtml,
} from '@/domain/spreadsheetLogic.js'

import { buildVariableMap } from '@/domain/renderShared.js'

// ---------------------------------------------------------------------------
// makeRenderContext
// ---------------------------------------------------------------------------
describe('makeRenderContext', () => {
  it('returns cohortId 1 by default', () => {
    expect(makeRenderContext()).toEqual({ cohortId: 1 })
  })

  it('accepts a custom cohortId', () => {
    expect(makeRenderContext({ cohortId: 5 })).toEqual({ cohortId: 5 })
  })
})

// ---------------------------------------------------------------------------
// getColumnLetter
// ---------------------------------------------------------------------------
describe('getColumnLetter', () => {
  it('converts 1 to A', () => expect(getColumnLetter(1)).toBe('A'))
  it('converts 26 to Z', () => expect(getColumnLetter(26)).toBe('Z'))
  it('converts 27 to AA', () => expect(getColumnLetter(27)).toBe('AA'))
  it('converts 52 to AZ', () => expect(getColumnLetter(52)).toBe('AZ'))
  it('converts 53 to BA', () => expect(getColumnLetter(53)).toBe('BA'))
})

// ---------------------------------------------------------------------------
// escapeRegex
// ---------------------------------------------------------------------------
describe('escapeRegex', () => {
  it('escapes dots and plus signs', () => {
    expect(escapeRegex('a.b+c')).toBe('a\\.b\\+c')
  })

  it('leaves plain identifiers unchanged', () => {
    expect(escapeRegex('step_length')).toBe('step_length')
  })

  it('escapes all special regex characters', () => {
    const special = '.*+?^${}()|[]\\'
    const escaped = escapeRegex(special)
    // All of those chars should now appear with a backslash
    expect(() => new RegExp(escaped)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// categorizeVariables
// ---------------------------------------------------------------------------
describe('categorizeVariables', () => {
  it('puts zero-arg constant in constants', () => {
    const variableMap = new Map([
      ['RATE', { id: 'rate', definition: { type: 'constant', '#text': '0.05' } }]
    ])
    const resolved = new Map([['RATE', { domain: [] }]])
    const { constants, cohortOnly, cohortStep, other } = categorizeVariables(variableMap, resolved, 'step')
    expect(constants).toContain('RATE')
    expect(cohortOnly).toHaveLength(0)
    expect(cohortStep).toHaveLength(0)
    expect(other).toHaveLength(0)
  })

  it('puts zero-arg expression in constants', () => {
    const variableMap = new Map([
      ['DERIVED', { id: 'derived', definition: { type: 'expression', '#text': 'rate * 2' } }]
    ])
    const resolved = new Map([['DERIVED', { domain: [] }]])
    const { constants } = categorizeVariables(variableMap, resolved, 'step')
    expect(constants).toContain('DERIVED')
  })

  it('puts cohort-only variable in cohortOnly', () => {
    const variableMap = new Map([
      ['AGE', { id: 'age', definition: { type: 'expression', '#text': '65' } }]
    ])
    const resolved = new Map([['AGE', { domain: ['cohort'] }]])
    const { cohortOnly } = categorizeVariables(variableMap, resolved, 'step')
    expect(cohortOnly).toContain('AGE')
  })

  it('puts single temporal-arg variable in cohortStep', () => {
    const variableMap = new Map([
      ['CASHFLOW', { id: 'cashflow', definition: { type: 'expression', '#text': 'rate' } }]
    ])
    const resolved = new Map([['CASHFLOW', { domain: ['step'] }]])
    const { cohortStep } = categorizeVariables(variableMap, resolved, 'step')
    expect(cohortStep).toContain('CASHFLOW')
  })

  it('puts cohort+temporal variable in cohortStep', () => {
    const variableMap = new Map([
      ['PV', { id: 'pv', definition: { type: 'expression', '#text': 'cf * df' } }]
    ])
    const resolved = new Map([['PV', { domain: ['cohort', 'step'] }]])
    const { cohortStep } = categorizeVariables(variableMap, resolved, 'step')
    expect(cohortStep).toContain('PV')
  })

  it('puts variables with unsupported arg combinations in other', () => {
    const variableMap = new Map([
      ['WEIRD', { id: 'weird', definition: { type: 'expression', '#text': 'x' } }]
    ])
    // Three arguments – doesn't fit any known category
    const resolved = new Map([['WEIRD', { domain: ['cohort', 'step', 'age'] }]])
    const { other } = categorizeVariables(variableMap, resolved, 'step')
    expect(other).toContain('WEIRD')
  })

  it('handles custom temporal index name (month)', () => {
    const variableMap = new Map([
      ['REV', { id: 'rev', definition: { type: 'expression', '#text': 'x' } }]
    ])
    const resolved = new Map([['REV', { domain: ['month'] }]])
    const { cohortStep } = categorizeVariables(variableMap, resolved, 'month')
    expect(cohortStep).toContain('REV')
  })
})

// ---------------------------------------------------------------------------
// topologicalSort
// ---------------------------------------------------------------------------
describe('topologicalSort', () => {
  it('sorts a simple chain A → B → C', () => {
    // B depends on A, C depends on B
    const incoming = new Map([
      ['A', new Set()],
      ['B', new Set([{ name: 'A', shift: 0 }])],
      ['C', new Set([{ name: 'B', shift: 0 }])],
    ])
    const sorted = topologicalSort(incoming, ['A', 'B', 'C'])
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'))
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'))
  })

  it('returns all variable names', () => {
    const incoming = new Map([
      ['X', new Set()],
      ['Y', new Set()],
    ])
    const sorted = topologicalSort(incoming, ['X', 'Y'])
    expect(sorted).toHaveLength(2)
    expect(sorted).toContain('X')
    expect(sorted).toContain('Y')
  })

  it('skips shifted dependencies (lag variables)', () => {
    // C depends on B(step-1) – shift=1 → should NOT create a topo edge
    const incoming = new Map([
      ['B', new Set()],
      ['C', new Set([{ name: 'B', shift: 1 }])],
    ])
    // Should not throw even though B appears as a shifted dep of C
    expect(() => topologicalSort(incoming, ['B', 'C'])).not.toThrow()
  })

  it('throws on a genuine circular dependency', () => {
    const incoming = new Map([
      ['A', new Set([{ name: 'B', shift: 0 }])],
      ['B', new Set([{ name: 'A', shift: 0 }])],
    ])
    expect(() => topologicalSort(incoming, ['A', 'B'])).toThrow(/circular/i)
  })
})

// ---------------------------------------------------------------------------
// generateTableLookupFormula
// ---------------------------------------------------------------------------
describe('generateTableLookupFormula', () => {
  it('returns null when table or column missing', () => {
    expect(generateTableLookupFormula({ definition: {} }, 2)).toBeNull()
    expect(generateTableLookupFormula({ definition: { table: { ref: 'rates' } } }, 2)).toBeNull()
  })

  it('generates INDEX/MATCH formula', () => {
    const varXml = {
      definition: {
        table: { ref: 'rates' },
        column: { ref: 'mort_rate' },
      }
    }
    const formula = generateTableLookupFormula(varXml, 3)
    expect(formula).toContain('input_rates')
    expect(formula).toContain('mort_rate')
    expect(formula).toContain('$A3')
    expect(formula).toMatch(/INDEX/)
    expect(formula).toMatch(/MATCH/)
  })

  it('uses #text fallback when ref is absent', () => {
    const varXml = {
      definition: {
        table: { '#text': 'tbl' },
        column: { '#text': 'col' },
      }
    }
    const formula = generateTableLookupFormula(varXml, 5)
    expect(formula).toContain('input_tbl')
    expect(formula).toContain('col')
  })
})

// ---------------------------------------------------------------------------
// convertConstantExpressionToFormula
// ---------------------------------------------------------------------------
describe('convertConstantExpressionToFormula', () => {
  it('returns null for empty expression', () => {
    expect(convertConstantExpressionToFormula('', 1, new Map(), new Map(), 'step')).toBeNull()
    expect(convertConstantExpressionToFormula(null, 1, new Map(), new Map(), 'step')).toBeNull()
  })

  it('passes through a literal number unchanged', () => {
    const result = convertConstantExpressionToFormula('42', 1, new Map(), new Map(), 'step')
    expect(result).toBe('42')
  })

  it('replaces floor() with INT()', () => {
    const result = convertConstantExpressionToFormula('floor(x / 12)', 1, new Map(), new Map(), 'step')
    expect(result).toContain('INT(')
    expect(result).not.toContain('floor(')
  })

  it('replaces ceiling() with ROUNDUP()', () => {
    const result = convertConstantExpressionToFormula('ceiling(x)', 1, new Map(), new Map(), 'step')
    expect(result).toContain('ROUNDUP(')
    expect(result).not.toContain('ceiling(')
  })

  it('substitutes constant variable references with row addresses', () => {
    const constantRowMap = new Map([['RATE', 1], ['TERM', 2]])
    const variableMap = new Map([
      ['RATE', { id: 'rate', definition: { type: 'constant', '#text': '0.05' } }],
      ['TERM', { id: 'term', definition: { type: 'constant', '#text': '20' } }],
    ])
    const result = convertConstantExpressionToFormula('RATE * TERM', 3, constantRowMap, variableMap, 'step')
    expect(result).toContain('$B$1')
    expect(result).toContain('$B$2')
  })
})

// ---------------------------------------------------------------------------
// generateFormulaForVariable
// ---------------------------------------------------------------------------
describe('generateFormulaForVariable', () => {
  it('returns null for unsupported definition types', () => {
    const varXml = { id: 'x', definition: { type: 'unknown' } }
    const result = generateFormulaForVariable(varXml, 'X', 0, 2, 'B', new Map(), [], [], new Map(), new Map(), 'step')
    expect(result).toBeNull()
  })

  it('delegates to generateTableLookupFormula for type=table', () => {
    const varXml = {
      id: 'lookup_var',
      definition: {
        type: 'table',
        table: { ref: 'tbl' },
        column: { ref: 'col' },
      }
    }
    const result = generateFormulaForVariable(varXml, 'LOOKUP_VAR', 0, 2, 'B', new Map(), [], [], new Map(), new Map(), 'step')
    expect(result).toContain('input_tbl')
  })

  it('returns null for constant def type (constants not in step sheet)', () => {
    const varXml = { id: 'c', definition: { type: 'constant', '#text': '10' } }
    const result = generateFormulaForVariable(varXml, 'C', 0, 2, 'B', new Map(), [], [], new Map(), new Map(), 'step')
    // constant type is not handled – returns null
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// analyzeModelDiagnostics
// ---------------------------------------------------------------------------
describe('analyzeModelDiagnostics', () => {
  it('returns empty diagnostics for empty variable list', () => {
    const d = analyzeModelDiagnostics({ model: {} }, { variables: [] })
    expect(d.totalVariables).toBe(0)
    expect(d.unsupportedFunctions.size).toBe(0)
  })

  it('detects unsupported custom functions', () => {
    const modelObj = {
      model: {
        variables: {
          variable: [{
            id: 'premium',
            definition: { type: 'expression', '#text': 'GetModelPoint(MPF_PREMIUM)' }
          }]
        }
      }
    }
    const modelFeatures = {
      variables: ['PREMIUM'],
      resolvedVarsWithArguments: new Map([['PREMIUM', { domain: [] }]])
    }
    const d = analyzeModelDiagnostics(modelObj, modelFeatures)
    expect(d.unsupportedFunctions.has('GetModelPoint')).toBe(true)
    expect(d.variablesWithCustomFunctions).toBe(1)
  })

  it('detects temporal parameters', () => {
    const modelObj = {
      model: {
        variables: {
          variable: [{
            id: 'val',
            definition: { type: 'expression', '#text': 'prev_val(t-1)' },
            arguments: { arg: [{ indexSet: 't' }] }
          }]
        }
      }
    }
    const modelFeatures = {
      variables: ['VAL'],
      resolvedVarsWithArguments: new Map([['VAL', { domain: ['t'], }]])
    }
    const d = analyzeModelDiagnostics(modelObj, modelFeatures)
    expect(d.temporalParameters.length).toBeGreaterThan(0)
  })

  it('detects complex ternary patterns', () => {
    const modelObj = {
      model: {
        variables: {
          variable: [{
            id: 'cond',
            definition: { type: 'expression', '#text': 'age >= 65 ? 0 : 1' },
            arguments: { arg: [{ indexSet: 'cohort' }] }
          }]
        }
      }
    }
    const modelFeatures = {
      variables: ['COND'],
      resolvedVarsWithArguments: new Map([['COND', { domain: ['cohort'] }]])
    }
    const d = analyzeModelDiagnostics(modelObj, modelFeatures)
    expect(d.complexPatterns.length).toBeGreaterThan(0)
  })

  it('detects table lookup variables', () => {
    const modelObj = {
      model: {
        variables: {
          variable: [{
            id: 'rate',
            definition: {
              type: 'table',
              table: { ref: 'rates' },
              column: { ref: 'mort' }
            },
            arguments: { arg: [{ indexSet: 'cohort' }] }
          }]
        }
      }
    }
    const modelFeatures = {
      variables: ['RATE'],
      resolvedVarsWithArguments: new Map([['RATE', { domain: ['cohort'] }]])
    }
    const d = analyzeModelDiagnostics(modelObj, modelFeatures)
    expect(d.tableLookups).toContain('rate')
  })

  it('handles legacy ModelPointFields format', () => {
    const modelObj = {
      model: {
        ModelPointFields: {
          VariableDefinition: [
            { Name: 'MPF_PREM', Formula: '' }
          ]
        }
      }
    }
    const modelFeatures = {
      variables: ['MPF_PREM'],
      resolvedVarsWithArguments: new Map([['MPF_PREM', { domain: [] }]])
    }
    const d = analyzeModelDiagnostics(modelObj, modelFeatures)
    expect(d.totalVariables).toBe(1)
  })

  it('handles legacy Formulas format', () => {
    const modelObj = {
      model: {
        Formulas: {
          VariableDefinition: [
            { Name: 'ANNUAL_PREM', Formula: 'GetModelPoint(MPF_PREM)' }
          ]
        }
      }
    }
    const modelFeatures = {
      variables: ['ANNUAL_PREM'],
      resolvedVarsWithArguments: new Map([['ANNUAL_PREM', { domain: [] }]])
    }
    const d = analyzeModelDiagnostics(modelObj, modelFeatures)
    expect(d.unsupportedFunctions.has('GetModelPoint')).toBe(true)
  })

  it('handles missing argument definitions (inferred domain)', () => {
    const modelObj = {
      model: {
        variables: {
          variable: [{
            id: 'inferred',
            // No arguments element – domain is inferred by model
            definition: { type: 'expression', '#text': 'cohort_val + 1' }
          }]
        }
      }
    }
    const modelFeatures = {
      variables: ['INFERRED'],
      resolvedVarsWithArguments: new Map([['INFERRED', { domain: ['cohort'] }]])
    }
    const d = analyzeModelDiagnostics(modelObj, modelFeatures)
    expect(d.missingArguments.length).toBeGreaterThan(0)
    expect(d.missingArguments[0].variable).toBe('inferred')
  })
})

// ---------------------------------------------------------------------------
// renderSheetAsHtml
// ---------------------------------------------------------------------------
describe('renderSheetAsHtml', () => {
  it('produces a <details> element containing a <table>', () => {
    const html = renderSheetAsHtml('MySheet', ['id', 'value'], [['A', '1'], ['B', '2']], new Map())
    expect(html).toContain('<details')
    expect(html).toContain('<table')
    expect(html).toContain('MySheet')
    expect(html).toContain('<th>')
  })

  it('escapes HTML in cell values', () => {
    const html = renderSheetAsHtml('S', ['col'], [['<script>alert(1)</script>']], new Map())
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('formats integer columns with int kind', () => {
    // 'step' header is treated as int by default
    const html = renderSheetAsHtml('calc', ['step', 'val'], [['0', '42']], new Map())
    expect(html).toContain('0')
    expect(html).toContain('42')
  })

  it('marks active cohort row', () => {
    const html = renderSheetAsHtml(
      'input_cohort_data',
      ['cohort', 'age'],
      [['1', '30'], ['2', '35']],
      new Map(),
      { activeCohortId: 1 }
    )
    expect(html).toContain('active-cohort')
  })
})
