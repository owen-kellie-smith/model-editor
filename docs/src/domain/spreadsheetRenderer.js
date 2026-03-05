/**
 * Spreadsheet Renderer – ExcelJS shell.
 *
 * This module is responsible only for ExcelJS workbook construction.
 * All pure domain logic (formula conversion, HTML preview, variable
 * categorisation, diagnostics, etc.) lives in spreadsheetLogic.js so that
 * it can be unit-tested without the ExcelJS library.
 *
 * Public API is preserved for backward compatibility: every symbol that was
 * previously exported from this file is still re-exported here.
 */

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

import {
  makeRenderContext,
  categorizeVariables,
  analyzeModelDiagnostics,
  generateFormulaForVariable,
  escapeRegex,
  generateTableLookupFormula,
  generateTableLookupFormulaAdvanced,
  generatePiecewiseFormula,
  convertExpressionToFormula,
  convertConstantExpressionToFormula,
  getColumnLetter,
  topologicalSort,
  evaluateConstantsForPreview,
  evaluateModelForPreview,
  renderSheetAsHtml,
  renderModelAsHTMLPreview,
} from './spreadsheetLogic.js'

// Re-export all public symbols so that existing imports continue to work.
export {
  makeRenderContext,
  renderModelAsHTMLPreview,
  generateTableLookupFormula,
  generateTableLookupFormulaAdvanced,
  convertExpressionToFormula,
  generatePiecewiseFormula,
}

// ── ExcelJS helpers ────────────────────────────────────────────────────────

/**
 * Apply consistent display formatting to Excel columns.
 */
function applyExcelColumnFormats(sheet, headers, dataTypeById, { currencySymbol = '£' } = {}) {
  if (!sheet || !headers || headers.length === 0) return

  headers.forEach((h, i) => {
    const key = String(h ?? '')
    const keyU = key.toUpperCase()
    const dt = dataTypeById?.get?.(keyU) ?? dataTypeById?.[keyU] ?? dataTypeById?.get?.(key) ?? dataTypeById?.[key]
    const kind = kindFromDataType(dt)

    const col = sheet.getColumn(i + 1)

    if (kind === 'money') {
      col.numFmt = `${currencySymbol}#,##0.00`
      col.alignment = { horizontal: 'right' }
      return
    }

    if (kind === 'int') {
      col.numFmt = '#,##0'
      col.alignment = { horizontal: 'right' }
      return
    }

    if (kind === 'dec4') {
      col.numFmt = '#,##0.0000'
      col.alignment = { horizontal: 'right' }
      return
    }

    if (kind === 'bool') {
      col.numFmt = '[=1]"Yes";[=0]"No";""'
      col.alignment = { horizontal: 'center' }
      return
    }
  })
}

function addTableSheets(workbook, modelObj, dataTypeById) {
  for (const { name, headers, metadataRows, dataRows } of buildTableSheetsData(modelObj)) {
    const sheet = workbook.addWorksheet(name)
    sheet.addRow(headers)
    applyExcelColumnFormats(sheet, headers, dataTypeById)
    for (const row of metadataRows) sheet.addRow(row)
    for (const row of dataRows) sheet.addRow(row)
    autoFitColumns(sheet)
  }
}

function addInputConfigSheet(workbook, dataTypeById) {
  const sheet = workbook.addWorksheet('input_config')
  const ctx = makeRenderContext()
  const { headers, rows } = buildInputConfigData(ctx)
  sheet.addRow(headers)
  applyExcelColumnFormats(sheet, headers, dataTypeById)
  for (const row of rows) sheet.addRow(row)
  autoFitColumns(sheet)
}

function addReadmeSheet(workbook, modelObj, modelFeatures) {
  const sheet = workbook.addWorksheet('README', { properties: { tabColor: { argb: 'FF4472C4' } } })

  sheet.addRow(['Input Tables - README'])
  sheet.addRow([])

  const diagnostics = analyzeModelDiagnostics(modelObj, modelFeatures)

  sheet.addRow(['Model Overview'])
  sheet.addRow(['Total variables', diagnostics.totalVariables])
  sheet.addRow([])

  if (diagnostics.unsupportedFunctions.size > 0) {
    sheet.addRow(['⚠ Unsupported Functions'])
    for (const [fn, vars] of diagnostics.unsupportedFunctions) {
      sheet.addRow([fn, vars.join(', ')])
    }
    sheet.addRow([])
  }

  if (diagnostics.tableLookups.length > 0) {
    sheet.addRow(['Table Lookup Variables'])
    for (const v of diagnostics.tableLookups) {
      sheet.addRow([v])
    }
    sheet.addRow([])
  }

  if (diagnostics.missingArguments.length > 0) {
    sheet.addRow(['Variables with Inferred Arguments'])
    for (const { variable, inferredDomain } of diagnostics.missingArguments) {
      sheet.addRow([variable, inferredDomain])
    }
    sheet.addRow([])
  }

  autoFitColumns(sheet)
}

function addCohortSheet(workbook, cohortVars, variableMap, dataTypeById) {
  const sheet = workbook.addWorksheet('calc_cohort')

  const headers = ['cohort']
  const colIndexMap = new Map()

  let colIdx = 1
  for (const varName of cohortVars) {
    const varXml = variableMap.get(varName)
    const varId = varXml ? varXml.id : varName
    headers.push(varId)
    colIndexMap.set(varName, getColumnLetter(colIdx + 1))
    colIdx++
  }
  sheet.addRow(headers)
  applyExcelColumnFormats(sheet, headers, dataTypeById)

  const row = [{ formula: 'input_config!B2' }]

  for (const varName of cohortVars) {
    const varXml = variableMap.get(varName)
    if (!varXml) {
      row.push('')
      continue
    }

    const defType = getDefinitionType(varXml)
    const colLetter = colIndexMap.get(varName)

    if (defType === 'table') {
      const tableDef = varXml.definition
      const tableRef = tableDef.table?.ref || tableDef.table?.['#text'] || ''
      const columnRef = tableDef.column?.ref || tableDef.column?.['#text'] || ''

      if (tableRef && columnRef) {
        const maxCol = 'Z'
        row.push({
          formula: `INDEX(input_${tableRef}!A:${maxCol},MATCH($A2,input_${tableRef}!A:A,0),MATCH(${colLetter}$1,input_${tableRef}!$1:$1,0))`
        })
      } else {
        row.push('')
      }
    } else {
      row.push('')
    }
  }

  sheet.addRow(row)
  autoFitColumns(sheet)
}

function addCohortStepSheet(workbook, cohortStepVars, variableMap, constantVars, cohortOnlyVars, modelObj, temporalIndexSetId, dataTypeById) {
  const sheet = workbook.addWorksheet('calc_cohort_step')

  const temporalId = temporalIndexSetId ?? 'step'
  const headers = [temporalId]
  const colIndexMap = new Map()

  let colIdx = 1
  for (const varName of cohortStepVars) {
    const varXml = variableMap.get(varName)
    const varId = varXml ? varXml.id : varName
    headers.push(varId)
    colIndexMap.set(varName, colIdx + 1)
    colIdx++
  }
  sheet.addRow(headers)
  applyExcelColumnFormats(sheet, headers, dataTypeById)

  const cohortVarColMap = new Map()
  let cohortColIdx = 1
  for (const varName of cohortOnlyVars) {
    cohortVarColMap.set(varName, getColumnLetter(cohortColIdx + 1))
    cohortColIdx++
  }

  const { min: stepMin, max: stepMax } = getStepRange(modelObj, temporalId)
  const stepCount = stepMax - stepMin + 1

  for (let i = 0; i < stepCount; i++) {
    const step = stepMin + i
    const currentRow = i + 2
    const stepValue = i === 0 ? stepMin : { formula: `A${currentRow - 1}+1` }
    const row = [stepValue]

    for (const varName of cohortStepVars) {
      const varXml = variableMap.get(varName)
      if (!varXml) {
        row.push('')
        continue
      }

      const colLetter = getColumnLetter(colIndexMap.get(varName))

      const formula = generateFormulaForVariable(varXml, varName, step, currentRow, colLetter, colIndexMap, cohortStepVars, constantVars, variableMap, cohortVarColMap, temporalId)

      if (formula) {
        row.push({ formula })
      } else {
        row.push(0)
      }
    }

    sheet.addRow(row)
  }
  autoFitColumns(sheet)
}

// ── Public ExcelJS API ─────────────────────────────────────────────────────

/**
 * Renders a model as an Excel workbook using ExcelJS.
 * @param {Object} modelObj - The model object (from getObjectFromXML)
 * @param {Object} modelFeatures - The model features (from validateModelCore)
 * @returns {Promise<Blob>} Excel XLSX file blob
 */
export async function renderModelAsExcel(modelObj, modelFeatures) {
  if (!modelObj || !modelObj.model) {
    throw new Error("Invalid model object")
  }

  if (!modelFeatures || !modelFeatures.variables) {
    throw new Error("Invalid model features")
  }

  if (typeof ExcelJS === 'undefined') {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      console.warn("ExcelJS not available in test environment, returning mock blob")
      return new Blob(["Mock Excel file"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    }
    throw new Error("ExcelJS library is not loaded. Please ensure it's included via CDN.")
  }

  const { resolvedVarsWithArguments } = modelFeatures

  const variableMap = buildVariableMap(modelObj)
  const dataTypeById = buildDataTypeMap(variableMap)

  const temporalIndexSetId = getTemporalIndexSetId(modelObj)
  const temporalId = temporalIndexSetId ?? 'step'

  const categorized = categorizeVariables(variableMap, resolvedVarsWithArguments, temporalId)

  const workbook = new ExcelJS.Workbook()

  addReadmeSheet(workbook, modelObj, modelFeatures)

  if (categorized.constants.length > 0) {
    const sheet = workbook.addWorksheet('constant')

    const constantRowMap = new Map()
    let rowNum = 1
    for (const varName of categorized.constants) {
      constantRowMap.set(varName, rowNum)
      rowNum++
    }

    for (const varName of categorized.constants) {
      const varXml = variableMap.get(varName)
      if (varXml) {
        const defType = getDefinitionType(varXml)
        const expression = getDefinitionText(varXml)

        if (defType === "constant") {
          let value = expression
          try {
            if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(expression)) {
              value = Function('"use strict"; return (' + expression + ')')()
            }
          } catch (e) {
            value = expression
          }
          sheet.addRow([varXml.id, value])
        } else if (defType === "expression") {
          const currentRow = constantRowMap.get(varName)
          const formula = convertConstantExpressionToFormula(expression, currentRow, constantRowMap, variableMap, temporalId)
          if (formula) {
            sheet.addRow([varXml.id, { formula }])
          } else {
            sheet.addRow([varXml.id, expression])
          }
        } else {
          sheet.addRow([varXml.id, expression])
        }
      }
    }
  }

  addInputConfigSheet(workbook, dataTypeById)
  addTableSheets(workbook, modelObj, dataTypeById)

  if (categorized.cohortOnly.length > 0) {
    addCohortSheet(workbook, categorized.cohortOnly, variableMap, dataTypeById)
  }

  if (categorized.cohortStep.length > 0) {
    addCohortStepSheet(workbook, categorized.cohortStep, variableMap, categorized.constants, categorized.cohortOnly, modelObj, temporalId, dataTypeById)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  })

  return blob
}

/**
 * Fit each Excel column width to its longest cell value.
 * @param {Object} sheet - ExcelJS worksheet
 * @param {Object} [options]
 */
export function autoFitColumns(sheet, { minWidth = 8, maxWidth = 60 } = {}) {
  sheet.columns.forEach(column => {
    let maxLength = 0

    column.eachCell({ includeEmpty: true }, cell => {
      const value = cell.value
      if (value == null) return

      const text =
        typeof value === 'object' && value.richText
          ? value.richText.map(t => t.text).join('')
          : String(value)

      maxLength = Math.max(maxLength, text.length)
    })

    const adjusted = Math.min(Math.max(maxLength + 2, minWidth), maxWidth)
    column.width = adjusted
  })
}
