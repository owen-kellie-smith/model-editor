/**
 * Spreadsheet domain logic – pure functions with no ExcelJS dependency.
 *
 * These functions handle formula generation, expression conversion, model
 * evaluation for preview, and HTML rendering of preview tables.  They are
 * separated from the ExcelJS-based renderer (spreadsheetRenderer.js) so that
 * they can be unit-tested without the ExcelJS library being present.
 */

import { asArray } from '../utils/helpers.js'
import {
  buildVariableMap,
  buildDataTypeMap,
  kindFromDataType,
  getTemporalIndexSetId,
  getStepRange,
  getDefinitionText,
  getDefinitionType,
  buildInputConfigData,
  buildTableSheetsData,
} from './renderShared.js'

// ── Render context ─────────────────────────────────────────────────────────

export function makeRenderContext({ cohortId = 1 } = {}) {
  return { cohortId }
}

// ── Variable categorisation ────────────────────────────────────────────────

/**
 * Categorize variables by their argument structure.
 * @param {Map} variableMap - case-insensitive id → varXml
 * @param {Map} resolvedVarsWithArguments - id → { domain: string[] }
 * @param {string} temporalIndexSetId - id of the temporal index set
 * @returns {{ constants: string[], cohortOnly: string[], cohortStep: string[], other: string[] }}
 */
export function categorizeVariables(variableMap, resolvedVarsWithArguments, temporalIndexSetId) {
  const constants = []
  const cohortOnly = []
  const cohortStep = []
  const other = []
  const temporalArg = String(temporalIndexSetId ?? 'step').toUpperCase()
  for (const [varName, varXml] of variableMap) {
    const resolved = resolvedVarsWithArguments.get(varName)
    const args = resolved && resolved.domain ? resolved.domain : []
    const defType = getDefinitionType(varXml)

    if (args.length === 0) {
      if (defType === "constant" || defType === "expression") {
        constants.push(varName)
      }
    } else if (args.length === 1 && args[0].toUpperCase() === 'COHORT') {
      cohortOnly.push(varName)
    } else if (args.length === 1 && args[0].toUpperCase() === temporalArg) {
      cohortStep.push(varName)
    } else if (args.length === 2 && args[0].toUpperCase() === 'COHORT' && args[1].toUpperCase() === temporalArg) {
      cohortStep.push(varName)
    } else {
      other.push(varName)
    }
  }

  return { constants, cohortOnly, cohortStep, other }
}

// ── Model diagnostics ──────────────────────────────────────────────────────

/**
 * Analyze model for potential spreadsheet rendering issues.
 * @param {Object} modelObj - The model object
 * @param {Object} modelFeatures - The model features
 * @returns {Object} Diagnostic results with categories of issues
 */
export function analyzeModelDiagnostics(modelObj, modelFeatures) {
  const diagnostics = {
    unsupportedFunctions: new Map(),
    temporalParameters: [],
    missingArguments: [],
    complexPatterns: [],
    tableLookups: [],
    totalVariables: 0,
    variablesWithCustomFunctions: 0,
    variablesWithTemporalParams: 0
  }

  const unsupportedFunctionNames = [
    'GetModelPoint',
    'GetDoubleTableValue',
    'GetMultiUltMortRate',
    'ProjectionTerm'
  ]

  const varNames = modelFeatures?.variables || []
  if (varNames.length === 0) {
    return diagnostics
  }

  const variableMap = new Map()

  if (modelObj?.model?.variables?.variable) {
    const modernVars = Array.isArray(modelObj.model.variables.variable)
      ? modelObj.model.variables.variable
      : [modelObj.model.variables.variable]
    for (const varXml of modernVars) {
      const id = (varXml.id || '').toUpperCase()
      if (id) variableMap.set(id, varXml)
    }
  }

  if (modelObj?.model?.ModelPointFields) {
    for (const v of asArray(modelObj.model.ModelPointFields.VariableDefinition)) {
      const name = (v.Name || '').toUpperCase()
      if (name) {
        variableMap.set(name, {
          id: name,
          definition: { type: 'expression', '#text': v.Formula || '' }
        })
      }
    }
  }

  if (modelObj?.model?.Formulas) {
    for (const v of asArray(modelObj.model.Formulas.VariableDefinition)) {
      const name = (v.Name || '').toUpperCase()
      if (name) {
        variableMap.set(name, {
          id: name,
          definition: { type: 'expression', '#text': v.Formula || '' }
        })
      }
    }
  }

  diagnostics.totalVariables = varNames.length

  for (const varName of varNames) {
    const varXml = variableMap.get(varName.toUpperCase())
    if (!varXml) continue

    const displayName = varXml.id || varName
    const defType = getDefinitionType(varXml)
    const expression = getDefinitionText(varXml)

    if (!expression && defType !== 'table') continue

    let hasCustomFunction = false
    for (const funcName of unsupportedFunctionNames) {
      const pattern = new RegExp(`\\b${funcName}\\s*\\(`, 'i')
      if (pattern.test(expression)) {
        if (!diagnostics.unsupportedFunctions.has(funcName)) {
          diagnostics.unsupportedFunctions.set(funcName, [])
        }
        diagnostics.unsupportedFunctions.get(funcName).push(displayName)
        hasCustomFunction = true
      }
    }
    if (hasCustomFunction) {
      diagnostics.variablesWithCustomFunctions++
    }

    const temporalPattern = /\(t\)|\(t[\-\+]\d*\)/gi
    if (temporalPattern.test(expression)) {
      diagnostics.temporalParameters.push({
        variable: displayName,
        expression: expression.substring(0, 100)
      })
      diagnostics.variablesWithTemporalParams++
    }

    const resolved = modelFeatures?.resolvedVarsWithArguments?.get(varName.toUpperCase())
    if (defType === 'expression' && resolved && resolved.domain && resolved.domain.length > 0) {
      const hasExplicitArgs = varXml.arguments && varXml.arguments.arg
      if (!hasExplicitArgs) {
        diagnostics.missingArguments.push({
          variable: displayName,
          inferredDomain: resolved.domain.join(', ')
        })
      }
    }

    const hasTernary = /\?[^:]*:/.test(expression)
    const hasComparison = /[<>]=?|[!=]=/.test(expression)
    if (hasTernary || hasComparison) {
      diagnostics.complexPatterns.push({
        variable: displayName,
        pattern: hasTernary ? 'ternary operator' : 'comparison operator',
        expression: expression.substring(0, 100)
      })
    }

    if (defType === 'table' || defType === 'tableLookup') {
      diagnostics.tableLookups.push(displayName)
    }
  }

  return diagnostics
}

// ── Column letter utility ──────────────────────────────────────────────────

/**
 * Convert a 1-based column index to an Excel column letter (1=A, 26=Z, 27=AA, …).
 * @param {number} index
 * @returns {string}
 */
export function getColumnLetter(index) {
  let letter = ''
  while (index > 0) {
    const remainder = (index - 1) % 26
    letter = String.fromCharCode(65 + remainder) + letter
    index = Math.floor((index - 1) / 26)
  }
  return letter
}

// ── Formula-generation utilities ───────────────────────────────────────────

/**
 * Escapes special regex characters in a string for use in RegExp.
 * @param {string} str
 * @returns {string}
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Generate Excel formula for a variable based on its definition type.
 */
export function generateFormulaForVariable(varXml, varName, step, currentRow, colLetter, colIndexMap, cohortStepVars, constantVars, variableMap, cohortVarColMap, temporalId) {
  const defType = getDefinitionType(varXml)
  const expression = getDefinitionText(varXml)

  if (defType === 'expression') {
    return convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, step, cohortVarColMap, temporalId)
  } else if (defType === 'table') {
    return generateTableLookupFormula(varXml, currentRow)
  } else if (defType === 'tableLookup') {
    return generateTableLookupFormulaAdvanced(varXml, currentRow, colIndexMap, cohortStepVars)
  } else if (defType === 'piecewise') {
    return generatePiecewiseFormula(varXml, step, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, cohortVarColMap, temporalId)
  }

  return null
}

/**
 * Generate Excel INDEX/MATCH formula for a table lookup variable (type="table").
 */
export function generateTableLookupFormula(varXml, currentRow) {
  const tableDef = varXml.definition
  if (!tableDef || !tableDef.table || !tableDef.column) {
    return null
  }

  const tableRef = tableDef.table.ref || tableDef.table['#text'] || ''
  const columnRef = tableDef.column.ref || tableDef.column['#text'] || ''

  if (!tableRef || !columnRef) {
    return null
  }

  const maxCol = 'Z'
  return `INDEX(input_${tableRef}!A:${maxCol},MATCH($A${currentRow},input_${tableRef}!A:A,1),MATCH("${columnRef}",input_${tableRef}!$1:$1,0))`
}

/**
 * Generate Excel formula for an advanced table lookup variable (type="tableLookup").
 */
export function generateTableLookupFormulaAdvanced(varXml, currentRow, colIndexMap, cohortStepVars) {
  const tableDef = varXml.definition
  if (!tableDef || !tableDef.table) {
    return null
  }

  const tableRef = tableDef.table.ref || tableDef.table['#text'] || ''
  const rowRef = tableDef.row?.ref || tableDef.row?.['#text'] || ''
  const columnSelector = tableDef.columnSelector?.ref || tableDef.columnSelector?.['#text'] || ''

  if (!tableRef) {
    return null
  }

  const maxCol = 'Z'

  if (rowRef && columnSelector) {
    const rowVarUpper = rowRef.toUpperCase()
    const rowColIndex = colIndexMap.get(rowVarUpper)
    const rowCell = rowColIndex ? `${getColumnLetter(rowColIndex)}${currentRow}` : rowRef

    return `INDEX(input_${tableRef}!A:${maxCol},MATCH(${rowCell},input_${tableRef}!A:A,1),MATCH(calc_cohort!$E$2,input_${tableRef}!$1:$1,0))`
  }

  return null
}

/**
 * Generate an Excel nested-IF formula for a piecewise-defined variable.
 */
export function generatePiecewiseFormula(
  varXml,
  step,
  currentRow,
  colIndexMap,
  cohortStepVars,
  constantVars,
  variableMap,
  cohortVarColMap,
  temporalId
) {
  const MAX_NEST = 20

  const definition = varXml.definition
  if (!definition || !definition.case) return null

  const cases = Array.isArray(definition.case)
    ? definition.case
    : [definition.case]

  if (cases.length === 0) return null

  const pairs = []
  let elseExpr = '0'

  for (const c of cases) {
    const whenRaw =
      c.when?.['#text'] ?? (typeof c.when === 'string' ? c.when : '')
    const valueRaw =
      c.value?.['#text'] ?? (typeof c.value === 'string' ? c.value : '')

    const whenText = String(whenRaw).trim()
    const valueText = String(valueRaw).trim()

    const valueFormula =
      convertExpressionToFormula(
        valueText,
        currentRow,
        colIndexMap,
        cohortStepVars,
        constantVars,
        variableMap,
        step,
        cohortVarColMap,
        temporalId
      ) ?? valueText

    if (!whenText) {
      elseExpr = valueFormula || elseExpr
      continue
    }

    const condFormula =
      convertExpressionToFormula(
        whenText,
        currentRow,
        colIndexMap,
        cohortStepVars,
        constantVars,
        variableMap,
        step,
        cohortVarColMap,
        temporalId
      )

    if (condFormula) {
      pairs.push([condFormula, valueFormula])
    }
  }

  if (pairs.length === 0) return elseExpr || null

  if (pairs.length > MAX_NEST) {
    throw new Error(
      `Piecewise definition for variable "${varXml.id}" has ${pairs.length} cases. ` +
      `Maximum supported for spreadsheet export is ${MAX_NEST}.`
    )
  }

  let formula = elseExpr || '0'
  for (let i = pairs.length - 1; i >= 0; i--) {
    const [cond, val] = pairs[i]
    formula = `IF(${cond},${val},${formula})`
  }

  return formula
}

/**
 * Convert a model expression to an Excel formula string for use in the
 * cohort-step sheet.
 */
export function convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, step, cohortVarColMap, temporalId) {
  if (!expression || typeof expression !== 'string') {
    return null
  }

  let formula = expression.trim()
  const tId = String(temporalId ?? 'step')
  const tEsc = escapeRegex(tId)
  const idxPat = (tId.toLowerCase() === 'step') ? tEsc : `(?:${tEsc}|step)`

  formula = formula.replace(/\bfloor\s*\(/gi, 'INT(')
  formula = formula.replace(/\bceiling\s*\(/gi, 'ROUNDUP(')
  formula = formula.replace(/\bROUNDUP\s*\(([^)]+)\)/g, 'ROUNDUP($1,0)')
  formula = formula.replace(/\bmax\s*\(/gi, 'MAX(')
  formula = formula.replace(/\bmin\s*\(/gi, 'MIN(')

  const ternaryMatch = formula.match(/(.+?)\s*\?\s*(.+?)\s*:\s*(.+)/)
  if (ternaryMatch) {
    const condition = ternaryMatch[1].trim()
    const trueValue = ternaryMatch[2].trim()
    const falseValue = ternaryMatch[3].trim()
    formula = `IF(${condition},${trueValue},${falseValue})`
  }

  if (cohortVarColMap) {
    for (const [varName, colLetter] of cohortVarColMap) {
      const escapedVarName = escapeRegex(varName)
      const patternWithCohort = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*\\)`, 'gi')
      formula = formula.replace(patternWithCohort, `calc_cohort!${colLetter}$2`)
    }
  }

  for (const varName of cohortStepVars) {
    const colIndex = colIndexMap.get(varName)
    if (colIndex) {
      const colLetter = getColumnLetter(colIndex)
      const escapedVarName = escapeRegex(varName)

      const patternWithOffset = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*,\\s*${tEsc}\\s*-\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternWithOffset, (match, offset) => {
        const targetRow = currentRow - parseInt(offset, 10)
        if (targetRow < 2) return `${colLetter}2`
        return `${colLetter}${targetRow}`
      })

      const patternWithForwardOffset = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*,\\s*${tEsc}\\s*\\+\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternWithForwardOffset, (match, offset) => {
        return `${colLetter}${currentRow + parseInt(offset, 10)}`
      })

      const patternSingleArgWithOffset = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*${tEsc}\\s*-\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternSingleArgWithOffset, (match, offset) => {
        const targetRow = currentRow - parseInt(offset, 10)
        if (targetRow < 2) return `${colLetter}2`
        return `${colLetter}${targetRow}`
      })

      const patternSingleArgWithForwardOffset = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*${tEsc}\\s*\\+\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternSingleArgWithForwardOffset, (match, offset) => {
        return `${colLetter}${currentRow + parseInt(offset, 10)}`
      })

      const patternIntegerArg = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternIntegerArg, (match, intArg) => {
        const n = parseInt(intArg, 10)
        const inferredMin =
          (typeof step === 'number' && !Number.isNaN(step))
            ? (step - (currentRow - 2))
            : 0
        const targetRow = 2 + (n - inferredMin)
        if (targetRow < 2) return `${colLetter}2`
        return `${colLetter}${targetRow}`
      })

      const patternStepOnly = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*${tEsc}\\s*\\)`, 'gi')
      formula = formula.replace(patternStepOnly, `${colLetter}${currentRow}`)

      const patternCohortStep = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*,\\s*${tEsc}\\s*\\)`, 'gi')
      formula = formula.replace(patternCohortStep, `${colLetter}${currentRow}`)

      const patternSingleNamedArg = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*[a-zA-Z_][a-zA-Z0-9_]*\\s*\\)`, 'gi')
      formula = formula.replace(patternSingleNamedArg, `${colLetter}${currentRow}`)

      const pattern2 = new RegExp(`\\b${escapedVarName}\\b(?:\\(\\))?`, 'gi')
      formula = formula.replace(pattern2, `${colLetter}${currentRow}`)
    }
  }

  const constantRowMap = new Map()
  let constantRow = 1
  for (const constVar of constantVars) {
    constantRowMap.set(constVar, constantRow)
    constantRow++
  }

  for (const constVar of constantVars) {
    const constVarXml = variableMap.get(constVar)
    if (constVarXml) {
      const escapedConstVar = escapeRegex(constVar)
      const pattern = new RegExp(`\\b${escapedConstVar}\\b(?:\\(\\))?`, 'gi')
      const constRowNum = constantRowMap.get(constVar) || 1
      formula = formula.replace(pattern, `constant!$B$${constRowNum}`)
    }
  }

  formula = formula.replace(new RegExp(`\\b${tEsc}\\b(?!\\s*\\()`, 'gi'), `A${currentRow}`)

  if (tId.toLowerCase() !== 'step') {
    formula = formula.replace(/\bstep\b(?!\s*\()/gi, `A${currentRow}`)
  }

  return formula || null
}

/**
 * Convert a constant-sheet expression to an Excel formula that references other
 * constant rows by their $B$N address.
 */
export function convertConstantExpressionToFormula(expression, currentRow, constantRowMap, variableMap, temporalId) {
  if (!expression || typeof expression !== 'string') {
    return null
  }

  let formula = expression.trim()
  const tId = String(temporalId ?? 'step')
  const tEsc = escapeRegex(tId)
  const idxPat = (tId.toLowerCase() === 'step') ? tEsc : `(?:${tEsc}|step)`

  formula = formula.replace(/\bfloor\s*\(/gi, 'INT(')
  formula = formula.replace(/\bceiling\s*\(/gi, 'ROUNDUP(')
  formula = formula.replace(/\bROUNDUP\s*\(([^)]+)\)/g, 'ROUNDUP($1,0)')
  formula = formula.replace(/\bmax\s*\(/gi, 'MAX(')
  formula = formula.replace(/\bmin\s*\(/gi, 'MIN(')

  const sortedConstants = Array.from(constantRowMap.entries()).sort((a, b) => a[1] - b[1])

  for (const [constVarName, constRowNum] of sortedConstants) {
    const constVarXml = variableMap.get(constVarName)
    if (constVarXml) {
      const escapedConstVar = escapeRegex(constVarName)
      const pattern = new RegExp(`\\b${escapedConstVar}\\b(?:\\(\\))?`, 'gi')
      formula = formula.replace(pattern, `$B$${constRowNum}`)
    }
  }

  return formula || null
}

// ── Topological sort ───────────────────────────────────────────────────────

/**
 * Topologically sort variable names by their dependency graph.
 * @param {Map<string, Set>} incoming - variable name → Set of dependency objects {name, shift}
 * @param {string[]} variableNames
 * @returns {string[]} names in dependency order
 */
export function topologicalSort(incoming, variableNames) {
  const sorted = []
  const visited = new Set()
  const visiting = new Set()

  function visit(varName) {
    if (visited.has(varName)) return
    if (visiting.has(varName)) {
      throw new Error(`Circular dependency detected involving ${varName}`)
    }

    visiting.add(varName)

    const deps = incoming.get(varName) || new Set()
    for (const dep of deps) {
      const depName = typeof dep === "object" && dep.name ? dep.name : dep
      const depShift = typeof dep === "object" && dep.shift !== undefined ? dep.shift : 0
      if (depShift === 0) {
        visit(depName)
      }
    }

    visiting.delete(varName)
    visited.add(varName)
    sorted.push(varName)
  }

  for (const varName of variableNames) {
    visit(varName)
  }

  return sorted
}

// ── Preview evaluation ─────────────────────────────────────────────────────

/**
 * Evaluate "constant sheet" values for HTML preview.
 */
export function evaluateConstantsForPreview(modelObj, modelFeatures, variableMap, categorized, temporalId) {
  const allVarIds = Array.from(variableMap.values())
    .map(v => v.id)
    .sort((a, b) => b.length - a.length)

  const cache = new Map()

  function fmt(v) {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') {
      if (!isFinite(v)) return ''
      if (Number.isInteger(v)) return String(v)
      return String(Math.round(v * 1e6) / 1e6)
    }
    return String(v)
  }

  function numStr(v) {
    return (v !== null && v !== undefined) ? String(v) : '0'
  }

  function evalVar(varId) {
    const key = String(varId ?? '')
    if (!key) return null
    if (cache.has(key)) return cache.get(key)
    cache.set(key, null)
    const varXml = variableMap.get(key.toUpperCase())
    if (!varXml) return null
    const result = evalVarImpl(varXml)
    cache.set(key, result)
    return result
  }

  function evalVarImpl(varXml) {
    switch (getDefinitionType(varXml)) {
      case 'constant':   return evalArith(getDefinitionText(varXml))
      case 'expression': return evalExpr(getDefinitionText(varXml))
      default:           return null
    }
  }

  function evalArith(expr) {
    if (!expr) return null
    const e = String(expr).trim()
    if (!e) return null
    try {
      if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(e))
        return Function('"use strict"; return (' + e + ')')()
    } catch (_) {}
    return null
  }

  function evalExpr(expr) {
    if (!expr || typeof expr !== 'string') return null
    let e = expr.trim()

    const tId = String(temporalId ?? 'step')
    const tEsc = escapeRegex(tId)
    e = e.replace(new RegExp(`\\b${tEsc}\\b`, 'gi'), '0')
    if (tId.toLowerCase() !== 'step') e = e.replace(/\bstep\b/gi, '0')

    for (const varId of allVarIds) {
      const esc = escapeRegex(varId)
      e = e.replace(
        new RegExp(`\\b${esc}\\b(?:\\(\\))?`, 'gi'),
        () => numStr(evalVar(varId))
      )
    }

    e = e
      .replace(/\bfloor\s*\(/gi,   'Math.floor(')
      .replace(/\bceiling\s*\(/gi, 'Math.ceil(')
      .replace(/\bceil\s*\(/gi,    'Math.ceil(')
      .replace(/\bround\s*\(/gi,   'Math.round(')
      .replace(/\bexp\s*\(/gi,     'Math.exp(')
      .replace(/\blog\s*\(/gi,     'Math.log(')
      .replace(/\bsin\s*\(/gi,     'Math.sin(')
      .replace(/\bcos\s*\(/gi,     'Math.cos(')
      .replace(/\bpow\s*\(/gi,     'Math.pow(')
      .replace(/\babs\s*\(/gi,     'Math.abs(')
      .replace(/\bmin\s*\(/gi,     'Math.min(')
      .replace(/\bmax\s*\(/gi,     'Math.max(')
      .replace(/\bint\s*\(/gi,     'Math.trunc(')

    e = e.replace(/\^/g, '**')
    e = e.replace(/(?<![!<>=])=(?!=)/g, '===')

    try {
      const val = new Function('"use strict"; return (' + e + ')')()
      if (typeof val === 'number' && isFinite(val)) return val
      if (typeof val === 'boolean') return val ? 1 : 0
    } catch (_) {}
    return null
  }

  const rows = categorized.constants
    .filter(varName => variableMap.has(varName))
    .map(varName => {
      const varXml = variableMap.get(varName)
      const defType = getDefinitionType(varXml)
      const raw = getDefinitionText(varXml)

      let rendered = raw
      if (defType === 'constant' || defType === 'expression') {
        const v = evalVar(varXml.id)
        if (v !== null && v !== undefined) rendered = fmt(v)
      }

      return [varXml.id, rendered]
    })

  return rows
}

/**
 * Evaluate model variables numerically for HTML preview.
 * Returns row data for the cohort and cohort-step sheets.
 */
export function evaluateModelForPreview(modelObj, modelFeatures, ctx) {
  const temporalId = getTemporalIndexSetId(modelObj) ?? 'step'

  const tableData = {}
  for (const { name, headers, dataRows } of buildTableSheetsData(modelObj)) {
    tableData[name.replace(/^input_/, '')] = { headers, rows: dataRows }
  }

  const variableMap = buildVariableMap(modelObj)
  const dataTypeById = buildDataTypeMap(variableMap)
  const { resolvedVarsWithArguments } = modelFeatures
  const categorized = categorizeVariables(variableMap, resolvedVarsWithArguments, temporalId)
  const { min: stepMin, max: stepMax } = getStepRange(modelObj, temporalId)
  const cohortId = ctx.cohortId

  const allVarIds = Array.from(variableMap.values())
    .map(v => v.id)
    .sort((a, b) => b.length - a.length)

  const cache = new Map()

  function evalVar(varId, cohort, step) {
    const key = `${varId}:${cohort ?? '_'}:${step ?? '_'}`
    if (cache.has(key)) return cache.get(key)
    cache.set(key, null)
    const varXml = variableMap.get(varId.toUpperCase())
    if (!varXml) return null
    const result = evalVarImpl(varXml, cohort, step)
    cache.set(key, result)
    return result
  }

  function evalVarImpl(varXml, cohort, step) {
    switch (getDefinitionType(varXml)) {
      case 'constant':    return evalArith(getDefinitionText(varXml))
      case 'expression':  return evalExpr(getDefinitionText(varXml), cohort, step)
      case 'table':       return evalTableDef(varXml, cohort, step)
      case 'tableLookup': return evalTableLookupDef(varXml, cohort, step)
      case 'piecewise':   return evalPiecewiseDef(varXml, cohort, step)
      default:            return null
    }
  }

  function evalArith(expr) {
    if (!expr) return null
    const e = String(expr).trim()
    if (!e) return null
    try {
      if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(e))
        return Function('"use strict"; return (' + e + ')')()
    } catch (_) {}
    return null
  }

  function evalExpr(expr, cohort, step) {
    const tId = String(temporalId ?? 'step')
    const tEsc = escapeRegex(tId)
    const idxPat = (tId.toLowerCase() === 'step') ? tEsc : `(?:${tEsc}|step)`
    if (!expr || typeof expr !== 'string') return null
    let e = expr.trim()

    for (const varId of allVarIds) {
      const esc = escapeRegex(varId)
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*cohort\\s*,\\s*${idxPat}\\s*-\\s*(\\d+)\\s*\\)`, 'gi'),
        (_, n) => numStr(evalVar(varId, cohort, (step ?? 0) - +n))
      )
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*cohort\\s*,\\s*${idxPat}\\s*\\+\\s*(\\d+)\\s*\\)`, 'gi'),
        (_, n) => numStr(evalVar(varId, cohort, (step ?? 0) + +n))
      )
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*cohort\\s*,\\s*${idxPat}\\s*\\)`, 'gi'),
        () => numStr(evalVar(varId, cohort, step))
      )
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*cohort\\s*\\)`, 'gi'),
        () => numStr(evalVar(varId, cohort, null))
      )
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*(\\d+)\\s*\\)`, 'gi'),
        (_, n) => numStr(evalVar(varId, cohort, +n))
      )
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*${idxPat}\\s*-\\s*(\\d+)\\s*\\)`, 'gi'),
        (_, n) => numStr(evalVar(varId, cohort, (step ?? 0) - +n))
      )
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*${idxPat}\\s*\\+\\s*(\\d+)\\s*\\)`, 'gi'),
        (_, n) => numStr(evalVar(varId, cohort, (step ?? 0) + +n))
      )
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*${idxPat}\\s*\\)`, 'gi'),
        () => numStr(evalVar(varId, cohort, step))
      )
      e = e.replace(
        new RegExp(`\\b${esc}\\b(?:\\(\\))?`, 'gi'),
        () => numStr(evalVar(varId, null, null))
      )
    }

    if (step !== null && step !== undefined)
      e = e.replace(new RegExp(`\\b${tEsc}\\b`, 'gi'), String(step))

    if (tId.toLowerCase() !== 'step') {
      e = e.replace(/\bstep\b/gi, String(step))
    }

    e = e
      .replace(/\bfloor\s*\(/gi,   'Math.floor(')
      .replace(/\bceiling\s*\(/gi, 'Math.ceil(')
      .replace(/\bceil\s*\(/gi,    'Math.ceil(')
      .replace(/\bround\s*\(/gi,   'Math.round(')
      .replace(/\bexp\s*\(/gi,     'Math.exp(')
      .replace(/\blog\s*\(/gi,     'Math.log(')
      .replace(/\bsin\s*\(/gi,     'Math.sin(')
      .replace(/\bcos\s*\(/gi,     'Math.cos(')
      .replace(/\bpow\s*\(/gi,     'Math.pow(')
      .replace(/\babs\s*\(/gi,     'Math.abs(')
      .replace(/\bmin\s*\(/gi,     'Math.min(')
      .replace(/\bmax\s*\(/gi,     'Math.max(')
      .replace(/\bint\s*\(/gi,     'Math.trunc(')

    e = e.replace(/\^/g, '**')
    e = e.replace(/(?<![!<>=])=(?!=)/g, '===')

    try {
      const val = new Function('"use strict"; return (' + e + ')')()
      if (typeof val === 'number' && isFinite(val)) return val
      if (typeof val === 'boolean') return val ? 1 : 0
    } catch (_) {}
    return null
  }

  function evalTableDef(varXml, cohort, step) {
    const def = varXml.definition
    const tableRef  = def?.table?.ref  || def?.table?.['#text']  || ''
    const columnRef = def?.column?.ref || def?.column?.['#text'] || ''
    if (!tableRef || !columnRef) return null

    const tbl = tableData[tableRef]
    if (!tbl) return null

    const colIdx = tbl.headers.indexOf(columnRef)
    if (colIdx === -1) return null

    const args = resolvedVarsWithArguments.get(varXml.id.toUpperCase())?.domain ?? []
    const hasCohort   = args.some(a => a.toLowerCase() === 'cohort')
    const hasTemporal = args.some(a => a.toLowerCase() !== 'cohort')

    if (hasCohort && !hasTemporal) {
      const row = tbl.rows.find(r => r[0] === cohort)
      return row ? row[colIdx] : null
    }
    if (hasTemporal && !hasCohort) {
      let match = null
      for (const row of tbl.rows) {
        if (row[0] <= step) match = row
        else break
      }
      return match ? match[colIdx] : null
    }
    return null
  }

  function evalTableLookupDef(varXml, cohort, step) {
    const def = varXml.definition
    const tableRef  = def?.table?.ref          || def?.table?.['#text']          || ''
    const rowRef    = def?.row?.ref            || def?.row?.['#text']            || ''
    const colSelRef = def?.columnSelector?.ref || def?.columnSelector?.['#text'] || ''
    if (!tableRef) return null

    const tbl = tableData[tableRef]
    if (!tbl) return null

    const rowKey = rowRef ? evalVar(rowRef, cohort, step) : step
    if (rowKey === null) return null

    let match = null
    for (const row of tbl.rows) {
      if (row[0] <= rowKey) match = row
      else break
    }
    if (!match) return null

    if (colSelRef) {
      const colName = evalVar(colSelRef, cohort, null)
      if (colName === null) return null
      const colIdx = tbl.headers.indexOf(String(colName))
      return colIdx !== -1 ? match[colIdx] : null
    }
    return match.length > 1 ? match[1] : null
  }

  function evalPiecewiseDef(varXml, cohort, step) {
    for (const c of asArray(varXml.definition?.case)) {
      const whenText  = c.when?.['#text']  ?? String(c.when  ?? '')
      const valueText = c.value?.['#text'] ?? String(c.value ?? '')
      if (evalExpr(whenText, cohort, step)) {
        return evalExpr(valueText, cohort, step)
      }
    }
    return null
  }

  function fmt(v) {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') {
      if (!isFinite(v)) return ''
      if (Number.isInteger(v)) return String(v)
      return String(Math.round(v * 1e6) / 1e6)
    }
    return String(v)
  }

  function numStr(v) {
    return (v !== null && v !== undefined) ? String(v) : '0'
  }

  const cohortHeaders = [
    'cohort',
    ...categorized.cohortOnly.map(n => variableMap.get(n)?.id ?? n)
  ]
  const cohortRow = [String(cohortId)]
  for (const varName of categorized.cohortOnly) {
    const varXml = variableMap.get(varName)
    cohortRow.push(varXml ? fmt(evalVar(varXml.id, cohortId, null)) : '')
  }

  const stepHeaders = [
    temporalId,
    ...categorized.cohortStep.map(n => variableMap.get(n)?.id ?? n)
  ]
  const stepRows = []
  for (let s = stepMin; s <= stepMax; s++) {
    const row = [String(s)]
    for (const varName of categorized.cohortStep) {
      const varXml = variableMap.get(varName)
      row.push(varXml ? fmt(evalVar(varXml.id, cohortId, s)) : '')
    }
    stepRows.push(row)
  }

  return { cohortHeaders, cohortRows: [cohortRow], stepHeaders, stepRows }
}

// ── HTML rendering ─────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Render a single sheet as an HTML <details>/<table> block.
 * @param {string} name - Sheet name
 * @param {string[]} headers - Column headers
 * @param {any[][]} rows - Data rows
 * @param {Map|Object} dataTypeById - Variable id → data type
 * @param {Object} [options]
 * @returns {string} HTML string
 */
export function renderSheetAsHtml(name, headers, rows, dataTypeById, { temporalId = 'step', activeCohortId } = {}) {
  const locale = 'en-GB'
  const currency = 'GBP'

  const nfInt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const nfDec4 = new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  const nfMoney0 = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const nfMoney2 = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const isNumericString = (v) => typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v.trim())
  const toNumberIfSafe = (v) => (typeof v === 'number' ? v : (isNumericString(v) ? Number(v) : null))

  const headerKey = (h) => String(h ?? '').toLowerCase()

  const getColKind = (h) => {
    const key = String(h ?? '')
    const k = headerKey(h)
    if (!k) return 'text'

    const keyU = key.toUpperCase()
    const dt = dataTypeById?.get?.(keyU) ?? dataTypeById?.[keyU] ?? dataTypeById?.get?.(key) ?? dataTypeById?.[key]
    const kind = kindFromDataType(dt)
    if (kind !== 'text') return kind

    if (k === temporalId || k === 'step' || k === 'month') return 'int'

    return 'text'
  }

  const formatCell = (value, kind) => {
    if (value == null) return ''
    if (value === '') return ''

    if (typeof value === 'object') return JSON.stringify(value)

    if (kind === 'text') return String(value)

    const n = toNumberIfSafe(value)
    if (n == null || Number.isNaN(n)) {
      if (kind === 'bool' && typeof value === 'boolean') return value ? 'Yes' : 'No'
      return String(value)
    }

    if (kind === 'bool') return n ? 'Yes' : 'No'
    if (kind === 'int') return nfInt.format(n)

    if (kind === 'money') {
      const hasCents = Math.abs(n % 1) > 1e-9
      return (hasCents ? nfMoney2 : nfMoney0).format(n)
    }

    return nfDec4.format(n)
  }

  const kindByCol = headers.map(getColKind)

  const headerHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')
  const isCohortSheet =
    String(name ?? '').toLowerCase() === 'input_cohort_data' ||
    (String(name ?? '').toLowerCase().startsWith('input_') && headerKey(headers?.[0]) === 'cohort')

  const isNumeric = (v) => typeof v === 'number' || isNumericString(v)

  const rowsHtml = rows.map(row => {
    const rowCohortId = isCohortSheet && isNumeric(row?.[0]) ? Number(row[0]) : null
    const trClass = rowCohortId != null && activeCohortId != null && Number(activeCohortId) === rowCohortId
      ? ' class="active-cohort"'
      : ''
    return `<tr${trClass}>${row.map((cell, i) => {
      const kind = kindByCol[i] ?? 'text'
      const formatted = formatCell(cell, kind)

      const alignClass =
        kind === 'money' || kind === 'int' || kind === 'dec4' ? ' right'
        : kind === 'bool' ? ' center'
        : ''

      const raw = cell == null ? '' : String(cell)
      if (isCohortSheet && i === 0 && isNumeric(cell)) {
        const cohortId = Number(cell)
        return `<td class="cell${alignClass}" data-raw="${escapeHtml(raw)}"><a href="#" data-cohort="${cohortId}" class="cohort-link">${escapeHtml(formatted)}</a></td>`
      }

      return `<td class="cell${alignClass}" data-raw="${escapeHtml(raw)}">${escapeHtml(formatted)}</td>`
    }).join('')}</tr>`
  }).join('')

  return `<details class="preview-sheet" open>
  <summary class="preview-sheet-name">${escapeHtml(name)}</summary>
  <div class="preview-table-wrapper">
    <table class="preview-table">
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</details>`
}

/**
 * Escape a CSV field value: wrap in quotes if it contains a comma, quote, or newline.
 * @param {any} value
 * @returns {string}
 */
function csvField(value) {
  const s = String(value == null ? '' : value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/**
 * Convert an array of rows (each row is an array of values) and a header row to CSV text.
 * @param {string[]} headers
 * @param {any[][]} rows
 * @returns {string}
 */
function sheetToCsv(headers, rows) {
  const lines = [headers.map(csvField).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvField).join(','))
  }
  return lines.join('\n')
}

/**
 * Renders a model as CSV text (multiple sections, one per logical sheet).
 * Uses the same evaluation logic as the HTML preview and browser spreadsheet export.
 *
 * Sections are separated by a blank line.  Each section starts with a
 * `# sheet: <name>` comment line, followed by CSV rows.
 *
 * @param {Object} modelObj      - The model object (from getObjectFromXML)
 * @param {Object} modelFeatures - The model features (from validateModelCore)
 * @param {Object} [ctx]         - Render context; created automatically if omitted (see makeRenderContext)
 * @returns {string} CSV text
 */
export function renderModelAsCsv(modelObj, modelFeatures, ctx = makeRenderContext()) {
  if (!modelObj?.model) throw new Error("Invalid model object")
  if (!modelFeatures?.variables) throw new Error("Invalid model features")

  const temporalId = getTemporalIndexSetId(modelObj) ?? 'step'

  const { resolvedVarsWithArguments } = modelFeatures
  const variableMap = buildVariableMap(modelObj)
  const categorized = categorizeVariables(variableMap, resolvedVarsWithArguments, temporalId)

  const sections = []

  const { cohortHeaders, cohortRows, stepHeaders, stepRows } =
    evaluateModelForPreview(modelObj, modelFeatures, ctx)

  if (stepRows.length > 0)
    sections.push(`# sheet: calc_cohort_step\n${sheetToCsv(stepHeaders, stepRows)}`)

  if (cohortRows.length > 0)
    sections.push(`# sheet: calc_cohort\n${sheetToCsv(cohortHeaders, cohortRows)}`)

  for (const { name, headers, metadataRows, dataRows } of buildTableSheetsData(modelObj)) {
    sections.push(`# sheet: ${name}\n${sheetToCsv(headers, [...metadataRows, ...dataRows])}`)
  }

  const cfg = buildInputConfigData(ctx)
  sections.push(`# sheet: input_config\n${sheetToCsv(cfg.headers, cfg.rows)}`)

  if (categorized.constants.length > 0) {
    const rows = evaluateConstantsForPreview(modelObj, modelFeatures, variableMap, categorized, temporalId)
    sections.push(`# sheet: constant\n${sheetToCsv(['id', 'value'], rows)}`)
  }

  return sections.join('\n\n')
}

/**
 * Renders a model as HTML tables for in-browser preview.
 *
 * @param {Object} modelObj      - The model object (from getObjectFromXML)
 * @param {Object} modelFeatures - The model features (from validateModelCore)
 * @param {Object} [ctx]         - Render context (from makeRenderContext)
 * @returns {string} HTML string containing all preview tables
 */
export function renderModelAsHTMLPreview(modelObj, modelFeatures, ctx = makeRenderContext()) {
  if (!modelObj?.model) throw new Error("Invalid model object")
  if (!modelFeatures?.variables) throw new Error("Invalid model features")

  const temporalId = getTemporalIndexSetId(modelObj) ?? 'step'

  const { resolvedVarsWithArguments } = modelFeatures
  const variableMap = buildVariableMap(modelObj)
  const dataTypeById = buildDataTypeMap(variableMap)
  const categorized = categorizeVariables(variableMap, resolvedVarsWithArguments, temporalId)

  const parts = []

  const { cohortHeaders, cohortRows, stepHeaders, stepRows } =
    evaluateModelForPreview(modelObj, modelFeatures, ctx)

  if (stepRows.length > 0)
    parts.push(renderSheetAsHtml('calc_cohort_step', stepHeaders, stepRows, dataTypeById, { temporalId, activeCohortId: ctx.cohortId }))

  if (cohortRows.length > 0)
    parts.push(renderSheetAsHtml('calc_cohort', cohortHeaders, cohortRows, dataTypeById, { temporalId, activeCohortId: ctx.cohortId }))

  for (const { name, headers, metadataRows, dataRows } of buildTableSheetsData(modelObj)) {
    parts.push(renderSheetAsHtml(name, headers, [...metadataRows, ...dataRows], dataTypeById, { temporalId, activeCohortId: ctx.cohortId }))
  }

  const cfg = buildInputConfigData(ctx)
  parts.push(renderSheetAsHtml('input_config', cfg.headers, cfg.rows, dataTypeById, { temporalId, activeCohortId: ctx.cohortId }))

  if (categorized.constants.length > 0) {
    const rows = evaluateConstantsForPreview(modelObj, modelFeatures, variableMap, categorized, temporalId)
    parts.push(renderSheetAsHtml('constant', ['id', 'value'], rows, dataTypeById, { temporalId, activeCohortId: ctx.cohortId }))
  }

  const style = `
<style>
  .spreadsheet-preview { font-variant-numeric: tabular-nums; }
  .preview-sheet { margin: 10px 0; }
  .preview-sheet-name { cursor: pointer; font-weight: 600; }
  .preview-table-wrapper { overflow: auto; max-height: 520px; border: 1px solid #e5e7eb; border-radius: 8px; }
  .preview-table { border-collapse: collapse; width: 100%; }
  .preview-table th, .preview-table td { border-bottom: 1px solid #eef2f7; padding: 6px 8px; white-space: nowrap; }
  .preview-table thead th { position: sticky; top: 0; background: #f9fafb; z-index: 1; text-align: left; }
  .preview-table td.cell.right { text-align: right; }
  .preview-table td.cell.center { text-align: center; }
  .preview-table tr.active-cohort td { background: #eef6ff; }
  .cohort-link { color: #2563eb; text-decoration: underline; }

</style>`

  return `<div class="spreadsheet-preview">
${style}
${parts.join('\n')}
</div>`
}
