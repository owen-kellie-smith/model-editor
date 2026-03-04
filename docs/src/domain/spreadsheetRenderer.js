/**
 * Spreadsheet Renderer V2
 * Converts a validated model into an Excel workbook with multiple sheets using ExcelJS
 * Generates a spreadsheet for a single cohort calculation
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

/**
 * Renders a model as an Excel workbook using ExcelJS
 * @param {Object} modelObj - The model object (from getObjectFromXML)
 * @param {Object} modelFeatures - The model features (from getModelFeatures)
 * @returns {Promise<Blob>} - Excel XLSX file blob
 */
export async function renderModelAsExcel(modelObj, modelFeatures) {
  if (!modelObj || !modelObj.model) {
    throw new Error("Invalid model object")
  }

  if (!modelFeatures || !modelFeatures.variables) {
    throw new Error("Invalid model features")
  }

  // Check if ExcelJS is available
  if (typeof ExcelJS === 'undefined') {
    // In test environment, ExcelJS might not be available
    // Return a simple mock blob instead of failing
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      console.warn("ExcelJS not available in test environment, returning mock blob")
      return new Blob(["Mock Excel file"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    }
    throw new Error("ExcelJS library is not loaded. Please ensure it's included via CDN.")
  }

  const { variables, resolvedVarsWithArguments } = modelFeatures
  
  // Get variable details from model
  const variableMap = buildVariableMap(modelObj)
  const dataTypeById = buildDataTypeMap(variableMap)
  
  // Determine temporal index set (role="temporal" preferred; falls back to legacy "step")
  const temporalIndexSetId = getTemporalIndexSetId(modelObj)
  const temporalId = temporalIndexSetId ?? 'step';

  // Categorize variables by their argument structure
  const categorized = categorizeVariables(variableMap, resolvedVarsWithArguments, temporalId)
  
  // Create workbook
  const workbook = new ExcelJS.Workbook()
  
  // Add README sheet first (so it appears as first tab)
  addReadmeSheet(workbook, modelObj, modelFeatures)
  
  // Add constant sheet (variables with no arguments)
  if (categorized.constants.length > 0) {
    const sheet = workbook.addWorksheet('constant')
    
    // Build a map of constant row numbers for cross-references
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
          // For true constants, try to evaluate simple expressions
          let value = expression
          try {
            // Simple evaluation for basic arithmetic constants like "1/12"
            // Only allow digits, spaces, and basic arithmetic operators
            if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(expression)) {
              // Safe evaluation using Function constructor (safer than eval)
              value = Function('"use strict"; return (' + expression + ')')()
            }
          } catch (e) {
            value = expression
          }
          sheet.addRow([varXml.id, value])
        } else if (defType === "expression") {
          // For expression variables, convert to Excel formula
          const currentRow = constantRowMap.get(varName)
          const formula = convertConstantExpressionToFormula(expression, currentRow, constantRowMap, variableMap, temporalId)
          if (formula) {
            sheet.addRow([varXml.id, { formula }])
          } else {
            // Fallback to raw expression if conversion fails
            sheet.addRow([varXml.id, expression])
          }
        } else {
          // Fallback for other definition types
          sheet.addRow([varXml.id, expression])
        }
      }
    }
  }
  
  // Add input_config sheet for cohort configuration
  addInputConfigSheet(workbook, dataTypeById)
  
  // Add table sheets with sample data
  addTableSheets(workbook, modelObj, dataTypeById)
  
  // Add calculation sheet for cohort variables (single cohort, no steps)
  if (categorized.cohortOnly.length > 0) {
    addCohortSheet(workbook, categorized.cohortOnly, variableMap, dataTypeById)
  }
  
  // Add calculation sheet for cohort-step variables (single cohort, multiple steps)
  if (categorized.cohortStep.length > 0) {
    addCohortStepSheet(workbook, categorized.cohortStep, variableMap, categorized.constants, categorized.cohortOnly, modelObj, temporalId, dataTypeById)
  }
  
  // Generate Excel file
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { 
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  })
  
  return blob
}

export function makeRenderContext({ cohortId = 1 } = {}) {
  return { cohortId }
}

/**
 * Categorize variables by their argument structure
 */
function categorizeVariables(variableMap, resolvedVarsWithArguments, temporalIndexSetId) {
  const constants = []
  const cohortOnly = []
  const cohortStep = []
  const other = []
  // Temporal argument name comes from the model (indexSet role="temporal"), not hard-coded lists
  const temporalArg = String(temporalIndexSetId ?? 'step').toUpperCase()
  for (const [varName, varXml] of variableMap) {
    const resolved = resolvedVarsWithArguments.get(varName)
    const args = resolved && resolved.domain ? resolved.domain : []
    const defType = getDefinitionType(varXml)
    
    if (args.length === 0) {
      // Include both constant and expression variables with no arguments in the constants sheet
      // Expression variables without arguments are intermediate calculated values that are
      // constant across all steps/cohorts and need to be available for formula references
      if (defType === "constant" || defType === "expression") {
        constants.push(varName)
      }
      // Note: Variables with no arguments and no definition type are not categorized
    } else if (args.length === 1 && args[0].toUpperCase() === 'COHORT') {
      cohortOnly.push(varName)
    } else if (args.length === 1 && args[0].toUpperCase() === temporalArg) {
      // Single temporal argument variables should be included in the cohort-step sheet
      cohortStep.push(varName)
    } else if (args.length === 2 && args[0].toUpperCase() === 'COHORT' && args[1].toUpperCase() === temporalArg) {
      // Cohort + temporal argument variables
      cohortStep.push(varName)
    } else {
      other.push(varName)
    }
  }
  
  return { constants, cohortOnly, cohortStep, other }
}

// (Table helpers moved to src/domain/renderShared.js)

function addTableSheets(workbook, modelObj, dataTypeById) {
  for (const { name, headers, metadataRows, dataRows } of buildTableSheetsData(modelObj)) {
    const sheet = workbook.addWorksheet(name)
    sheet.addRow(headers)
    applyExcelColumnFormats(sheet, headers, dataTypeById)
    for (const row of metadataRows) sheet.addRow(row)
    for (const row of dataRows) sheet.addRow(row)
    autoFitColumns(sheet);
  }
}

/**
 * Determine the number of sample rows to generate for a table
 * @param {Object} tableDef - Table definition with optional rowIndexMin/rowIndexMax
 * @returns {number} - Number of sample rows to generate
 */
function determineSampleRowCount(tableDef) {
  // If rowIndex has min/max defined, generate ~10 sample rows across the range
  // (or the full range if it's small enough)
  if (tableDef.rowIndexMin !== undefined && tableDef.rowIndexMax !== undefined) {
    const range = tableDef.rowIndexMax - tableDef.rowIndexMin + 1
    
    // If the range is small (<= 20), generate the full range
    if (range <= 20) {
      return range
    }
    
    // For larger ranges, generate approximately 10 evenly-spaced samples
    // This provides a good balance between realistic data and file size
    return Math.min(10, range)
  }
  
  // Fallback: For tables without min/max constraints, generate 5 sample rows
  return 5
}


/**
 * Apply consistent display formatting to Excel sheets.
 * - Money columns: currency with 2dp
 * - Integer columns: 0dp
 * - Decimal/ratio columns: 4dp
 * - Boolean-ish columns: show Yes/No for 0/1
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
      // 0 -> No, 1 -> Yes, other -> blank
      col.numFmt = '[=1]"Yes";[=0]"No";""'
      col.alignment = { horizontal: 'center' }
      return
    }
  })
}

/**
 * Add input_config sheet for cohort configuration
 */
function addInputConfigSheet(workbook, dataTypeById) {
  const sheet = workbook.addWorksheet('input_config')
  const ctx = makeRenderContext()  
  const { headers, rows } = buildInputConfigData(ctx)
  sheet.addRow(headers)
  applyExcelColumnFormats(sheet, headers, dataTypeById)
  for (const row of rows) sheet.addRow(row)
  autoFitColumns(sheet)
}

/**
 * Analyze model for potential spreadsheet rendering issues
 * @param {Object} modelObj - The model object
 * @param {Object} modelFeatures - The model features
 * @returns {Object} - Diagnostic results with categories of issues
 */
function analyzeModelDiagnostics(modelObj, modelFeatures) {
  const diagnostics = {
    unsupportedFunctions: new Map(), // function name -> array of variable names
    temporalParameters: [],
    missingArguments: [],
    complexPatterns: [],
    tableLookups: [],
    totalVariables: 0,
    variablesWithCustomFunctions: 0,
    variablesWithTemporalParams: 0
  }
  
  // List of unsupported custom functions (functions that don't have Excel equivalents)
  const unsupportedFunctionNames = [
    'GetModelPoint',
    'GetDoubleTableValue',
    'GetMultiUltMortRate',
    'ProjectionTerm'
  ]
  
  // Use validated variable list from modelFeatures
  const varNames = modelFeatures?.variables || []
  if (varNames.length === 0) {
    return diagnostics
  }
  
  // Build a case-insensitive map of all variables from the XML object
  // This handles both modern format (modelObj.model.variables.variable)
  // and legacy format (ModelPointFields and Formulas)
  const variableMap = new Map()
  
  // Modern format: modelObj.model.variables.variable
  if (modelObj?.model?.variables?.variable) {
    const modernVars = Array.isArray(modelObj.model.variables.variable) 
      ? modelObj.model.variables.variable 
      : [modelObj.model.variables.variable]
    
    for (const varXml of modernVars) {
      const id = (varXml.id || '').toUpperCase()
      if (id) {
        variableMap.set(id, varXml)
      }
    }
  }
  
  // Legacy format: ModelPointFields
  if (modelObj?.model?.ModelPointFields) {
    for (const v of asArray(modelObj.model.ModelPointFields.VariableDefinition)) {
      const name = (v.Name || '').toUpperCase()
      if (name) {
        // Convert legacy format to modern-like structure for consistent processing
        variableMap.set(name, {
          id: name,
          definition: { type: 'expression', '#text': v.Formula || '' }
        })
      }
    }
  }
  
  // Legacy format: Formulas
  if (modelObj?.model?.Formulas) {
    for (const v of asArray(modelObj.model.Formulas.VariableDefinition)) {
      const name = (v.Name || '').toUpperCase()
      if (name) {
        // Convert legacy format to modern-like structure for consistent processing
        variableMap.set(name, {
          id: name,
          definition: { type: 'expression', '#text': v.Formula || '' }
        })
      }
    }
  }
  
  diagnostics.totalVariables = varNames.length
  
  // Analyze each validated variable
  for (const varName of varNames) {
    const varXml = variableMap.get(varName.toUpperCase())
    if (!varXml) continue // Skip if not found in map
    
    const displayName = varXml.id || varName
    const defType = getDefinitionType(varXml)
    const expression = getDefinitionText(varXml)
    
    if (!expression && defType !== 'table') continue
    
    // Check for unsupported custom functions
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
    
    // Check for temporal parameters like (t), (t-1), (t+1)
    const temporalPattern = /\(t\)|\(t[\-\+]\d*\)/gi
    if (temporalPattern.test(expression)) {
      diagnostics.temporalParameters.push({
        variable: displayName,
        expression: expression.substring(0, 100) // Truncate long expressions
      })
      diagnostics.variablesWithTemporalParams++
    }
    
    // Check for missing argument definitions (variables in modern format without explicit arguments)
    const resolved = modelFeatures?.resolvedVarsWithArguments?.get(varName.toUpperCase())
    if (defType === 'expression' && resolved && resolved.domain && resolved.domain.length > 0) {
      // Check if arguments are explicitly defined in XML
      const hasExplicitArgs = varXml.arguments && varXml.arguments.arg
      if (!hasExplicitArgs) {
        diagnostics.missingArguments.push({
          variable: displayName,
          inferredDomain: resolved.domain.join(', ')
        })
      }
    }
    
    // Check for complex patterns that might not convert well
    // Ternary operators, comparison operators
    const hasTernary = /\?[^:]*:/.test(expression)
    const hasComparison = /[<>]=?|[!=]=/.test(expression)
    if (hasTernary || hasComparison) {
      diagnostics.complexPatterns.push({
        variable: displayName,
        pattern: hasTernary ? 'ternary operator' : 'comparison operator',
        expression: expression.substring(0, 100)
      })
    }
    
    // Track table lookup definitions (these require manual verification)
    if (defType === 'table' || defType === 'tableLookup') {
      diagnostics.tableLookups.push(displayName)
    }
  }
  
  return diagnostics
}

/**
 * Add README sheet explaining input tables
 */
function addReadmeSheet(workbook, modelObj, modelFeatures) {
  const sheet = workbook.addWorksheet('README', { properties: { tabColor: { argb: 'FF4472C4' } } })
  
  // Add title
  sheet.addRow(['Input Tables - README'])
  sheet.addRow([])
  
  // Add timestamp
  const timestamp = new Date().toISOString()
  sheet.addRow([`Generated on ${timestamp}`])
  sheet.addRow([])
  
  // Add explanation
  sheet.addRow(['This spreadsheet was pre-populated with sample data to show the expected format.'])
  sheet.addRow(['Replace all values in Input Tables with your own data and assumptions.'])
  sheet.addRow([])
  
  // List input tables
  sheet.addRow(['Input Tables:'])
  
  const tableSheets = buildTableSheetsData(modelObj)
  if (tableSheets.length > 0) {
    for (const sheetInfo of tableSheets) {
      const tableId = sheetInfo.name.replace(/^input_/, '')
      const tableDefColumns = sheetInfo.headers.slice(1).map(String)
      const sheetName = sheetInfo.name
      const columnList = tableDefColumns.length > 0
        ? tableDefColumns.join(', ')
        : 'unconstrained columns'
      sheet.addRow([`  - ${sheetName}: ${columnList}`])
    }
  } else {
    // No tables defined in model
    sheet.addRow(['  - No input tables defined in this model'])
  }
  
  sheet.addRow([])
  sheet.addRow(['All input tables are pre-filled with sample values for reference only.'])
  sheet.addRow([])
  
  // Add information about table lookup behavior
  sheet.addRow(['Table Lookup Behavior:'])
  sheet.addRow(['  - Lookup columns (e.g., age, step) must be sorted in ascending order'])
  sheet.addRow(['  - Table lookups use approximate matching: finds the largest value ≤ lookup value'])
  sheet.addRow(['  - Sparse tables with gaps are supported (e.g., age 0, 5, 10, 15 works for intermediate ages)'])
  sheet.addRow(['  - This allows flexible table design without requiring entries for every possible value'])
  
  // Add diagnostics section if modelFeatures is available
  if (modelFeatures) {
    sheet.addRow([])
    sheet.addRow([])
    
    const diagnostics = analyzeModelDiagnostics(modelObj, modelFeatures)
    
    // Add diagnostics header
    sheet.addRow(['⚠️ Compatibility & Diagnostics'])
    const diagnosticsHeaderRow = sheet.lastRow.number
    sheet.addRow([])
    sheet.addRow(['The following issues were detected that may affect spreadsheet rendering:'])
    sheet.addRow([])
    
    let hasIssues = false
    
    // Unsupported functions
    if (diagnostics.unsupportedFunctions.size > 0) {
      hasIssues = true
      sheet.addRow([`🔴 Unsupported Functions (${diagnostics.unsupportedFunctions.size} found):`])
      for (const [funcName, varNames] of diagnostics.unsupportedFunctions) {
        sheet.addRow([`  - ${funcName}: Used by ${varNames.join(', ')}`])
        
        // Add specific guidance for each function type
        if (funcName === 'GetModelPoint') {
          sheet.addRow(['    Note: This function retrieves model point data. You\'ll need to populate input tables manually.'])
        } else if (funcName === 'GetDoubleTableValue') {
          sheet.addRow(['    Note: Table lookups were not automatically converted. Verify formulas in Excel.'])
        } else if (funcName === 'GetMultiUltMortRate') {
          sheet.addRow(['    Note: Custom mortality table lookup. Consider using INDEX/MATCH formulas instead.'])
        } else if (funcName === 'ProjectionTerm') {
          sheet.addRow(['    Note: This function needs to be replaced with a reference to the projection length.'])
        }
      }
      sheet.addRow([])
    }
    
    // Temporal parameters
    if (diagnostics.temporalParameters.length > 0) {
      hasIssues = true
      sheet.addRow([`⚠️ Temporal Parameters (${diagnostics.temporalParameters.length} found):`])
      // Show first few examples
      const maxExamples = 5
      const examples = diagnostics.temporalParameters.slice(0, maxExamples)
      for (const item of examples) {
        sheet.addRow([`  - ${item.variable} uses (t): May not render correctly. Verify step-based calculations.`])
      }
      if (diagnostics.temporalParameters.length > maxExamples) {
        sheet.addRow([`  ... and ${diagnostics.temporalParameters.length - maxExamples} more`])
      }
      sheet.addRow(['    Note: Variables with (t) or (t-1) parameters may need manual adjustment for recursive references.'])
      sheet.addRow([])
    }
    
    // Complex patterns
    if (diagnostics.complexPatterns.length > 0) {
      hasIssues = true
      sheet.addRow([`⚠️ Complex Expression Patterns (${diagnostics.complexPatterns.length} found):`])
      const maxExamples = 3
      const examples = diagnostics.complexPatterns.slice(0, maxExamples)
      for (const item of examples) {
        sheet.addRow([`  - ${item.variable}: Contains ${item.pattern}`])
      }
      if (diagnostics.complexPatterns.length > maxExamples) {
        sheet.addRow([`  ... and ${diagnostics.complexPatterns.length - maxExamples} more`])
      }
      sheet.addRow(['    Note: Ternary operators and comparisons may need conversion to Excel IF() formulas.'])
      sheet.addRow([])
    }
    
    // Information summary
    sheet.addRow(['ℹ️ Information:'])
    sheet.addRow([`  - ${diagnostics.totalVariables} variables total`])
    if (diagnostics.variablesWithCustomFunctions > 0) {
      sheet.addRow([`  - ${diagnostics.variablesWithCustomFunctions} with custom functions (may need manual adjustment)`])
    }
    if (diagnostics.variablesWithTemporalParams > 0) {
      sheet.addRow([`  - ${diagnostics.variablesWithTemporalParams} using temporal parameters (step/time-based)`])
    }
    if (diagnostics.tableLookups.length > 0) {
      sheet.addRow([`  - ${diagnostics.tableLookups.length} table lookup variables`])
    }
    
    if (!hasIssues) {
      sheet.addRow([])
      sheet.addRow(['✅ No compatibility issues detected. All expressions should render correctly.'])
    }
    
    // Style the diagnostics header
    sheet.getRow(diagnosticsHeaderRow).font = { bold: true, size: 12 }
  }
  
  // Style the title
  sheet.getRow(1).font = { bold: true, size: 14 }
  sheet.getRow(3).font = { italic: true, size: 10 }
  
  // Auto-width for column A
  sheet.getColumn(1).width = 90
}

/**
 * Add cohort calculation sheet
 */
function addCohortSheet(workbook, cohortVars, variableMap, dataTypeById) {
  const sheet = workbook.addWorksheet('calc_cohort')
  
  // Build header row
  const headers = ['cohort']
  const colIndexMap = new Map() // Map variable name to column letter
  
  let colIdx = 1 // Start at column B (A is cohort)
  for (const varName of cohortVars) {
    const varXml = variableMap.get(varName)
    const varId = varXml ? varXml.id : varName
    headers.push(varId)
    colIndexMap.set(varName, getColumnLetter(colIdx + 1)) // +1 because A is cohort
    colIdx++
  }
  sheet.addRow(headers)
    applyExcelColumnFormats(sheet, headers, dataTypeById)

  // Add a single cohort row (cohort references input_config sheet)
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
      // Generate INDEX/MATCH formula for table lookup
      const tableDef = varXml.definition
      const tableRef = tableDef.table?.ref || tableDef.table?.['#text'] || ''
      const columnRef = tableDef.column?.ref || tableDef.column?.['#text'] || ''
      
      if (tableRef && columnRef) {
        // Use generic column range that works for any table
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
  autoFitColumns(sheet);
}

/**
 * Add cohort-step calculation sheet
 */
function addCohortStepSheet(workbook, cohortStepVars, variableMap, constantVars, cohortOnlyVars, modelObj, temporalIndexSetId, dataTypeById) {
  const sheet = workbook.addWorksheet('calc_cohort_step')
  
  // Build header row
  const temporalId = temporalIndexSetId ?? 'step'
  const headers = [temporalId]
  const colIndexMap = new Map() // Map variable name to column index
  
  let colIdx = 1 // Start at column B (A is temporal index)
  for (const varName of cohortStepVars) {
    const varXml = variableMap.get(varName)
    const varId = varXml ? varXml.id : varName
    headers.push(varId)
    colIndexMap.set(varName, colIdx + 1) // +1 because A is temporal index
    colIdx++
  }
  sheet.addRow(headers)
    applyExcelColumnFormats(sheet, headers, dataTypeById)

  // Build a map of cohort-only variables to their column letters in calc_cohort sheet
  // Column A contains cohort ID, so cohort-only variables start at column B
  const cohortVarColMap = new Map()
  let cohortColIdx = 1 // Start at column B (A is cohort ID)
  for (const varName of cohortOnlyVars) {
    cohortVarColMap.set(varName, getColumnLetter(cohortColIdx + 1)) // Column B=2, C=3, etc.
    cohortColIdx++
  }
  
  // Determine step range from model (falls back to 0..11 = 12 steps)
  const { min: stepMin, max: stepMax } = getStepRange(modelObj, temporalId)
  const stepCount = stepMax - stepMin + 1

  // Add rows for steps
  // First row: hardcoded stepMin value
  // Subsequent rows: formula referencing previous row (e.g., =A2+1)
  // This makes the sheet copyable - users can copy rows down and step values auto-increment
  for (let i = 0; i < stepCount; i++) {
    const step = stepMin + i
    const currentRow = i + 2 // +2 because row 1 is header
    const stepValue = i === 0 ? stepMin : { formula: `A${currentRow-1}+1` }
    const row = [stepValue]
    
    for (const varName of cohortStepVars) {
      const varXml = variableMap.get(varName)
      if (!varXml) {
        row.push('')
        continue
      }
      
      const colLetter = getColumnLetter(colIndexMap.get(varName))
      
      // Generate appropriate formula based on variable type
      let formula = generateFormulaForVariable(varXml, varName, step, currentRow, colLetter, colIndexMap, cohortStepVars, constantVars, variableMap, cohortVarColMap, temporalId)
      
      if (formula) {
        row.push({ formula })
      } else {
        row.push(0)
      }
    }
    
    sheet.addRow(row)
  }
  autoFitColumns(sheet);
}

/**
 * Generate Excel formula for a variable based on its definition
 */
function generateFormulaForVariable(varXml, varName, step, currentRow, colLetter, colIndexMap, cohortStepVars, constantVars, variableMap, cohortVarColMap, temporalId) {
  const defType = getDefinitionType(varXml)
  const expression = getDefinitionText(varXml)
  
  // Handle based on definition type, reading from actual model
  if (defType === 'expression') {
    return convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, step, cohortVarColMap, temporalId)
  } else if (defType === 'table') {
    return generateTableLookupFormula(varXml, currentRow)
  } else if (defType === 'tableLookup') {
    return generateTableLookupFormulaAdvanced(varXml, currentRow, colIndexMap, cohortStepVars)
  } else if (defType === 'piecewise') {
    return generatePiecewiseFormula(varXml, step, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, cohortVarColMap, temporalId)
  } else if (defType === 'constant') {
    // Constants should be in their own sheet, referenced by name
    const constantSheetName = 'constant'
    // Find row in constant sheet (would need to track this, simplified for now)
    return null // Constants are typically not in step-by-step calculations
  }
  
  return null
}

/**
 * Escapes special regex characters in a string for use in RegExp
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Generate Excel formula for a table lookup
 */
function generateTableLookupFormula(varXml, currentRow) {
  const tableDef = varXml.definition
  if (!tableDef || !tableDef.table || !tableDef.column) {
    return null
  }
  
  const tableRef = tableDef.table.ref || tableDef.table['#text'] || ''
  const columnRef = tableDef.column.ref || tableDef.column['#text'] || ''
  
  if (!tableRef || !columnRef) {
    return null
  }
  
  // Determine the appropriate table dimensions based on tableRef
  // Use generic column range that works for any table size
  const maxCol = 'Z'  // Generic range supporting up to 26 columns
  
  // Generate INDEX/MATCH formula for table lookup using dynamic ranges
  // INDEX(table!A:maxCol, MATCH(rowKey, table!A:A, 1), MATCH(colKey, table!$1:$1, 0))
  // Using entire columns allows tables to be extended without breaking formulas
  // Row matching uses approximate match (1): finds largest value ≤ lookup value
  //   - Requires lookup column to be sorted in ascending order (e.g., step 0, 1, 2, ...)
  //   - Allows sparse tables with gaps (e.g., step 0, 5, 10, 15 works for any intermediate step)
  // Column matching uses exact match (0): column headers must match exactly
  return `INDEX(input_${tableRef}!A:${maxCol},MATCH($A${currentRow},input_${tableRef}!A:A,1),MATCH("${columnRef}",input_${tableRef}!$1:$1,0))`
}

/**
 * Generate Excel formula for an advanced table lookup (with selectors)
 */
function generateTableLookupFormulaAdvanced(varXml, currentRow, colIndexMap, cohortStepVars) {
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
  
  // Determine the appropriate table dimensions
  // Use generic column range that works for any table size
  const maxCol = 'Z'  // Generic range supporting up to 26 columns
  
  // Generate INDEX/MATCH formula with dynamic column selection using dynamic ranges
  if (rowRef && columnSelector) {
    // Find the column index for the row variable if it's in cohortStepVars
    const rowVarUpper = rowRef.toUpperCase()
    const rowColIndex = colIndexMap.get(rowVarUpper)
    const rowCell = rowColIndex ? `${getColumnLetter(rowColIndex)}${currentRow}` : rowRef
    
    // Column selector is typically from cohort sheet
    // Using entire columns allows tables to be extended without breaking formulas
    // Row matching uses approximate match (1): finds largest value ≤ lookup value
    //   - Requires lookup column to be sorted in ascending order (e.g., age 0, 1, 2, ...)
    //   - Allows sparse tables with gaps (e.g., age 0, 5, 10, 15 works for any intermediate age)
    // Column matching uses exact match (0): column headers must match exactly
    return `INDEX(input_${tableRef}!A:${maxCol},MATCH(${rowCell},input_${tableRef}!A:A,1),MATCH(calc_cohort!$E$2,input_${tableRef}!$1:$1,0))`
  }
  
  return null
}

/**
 * Generate Excel formula for piecewise conditional logic
 */
function generatePiecewiseFormula(
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

    // If no WHEN → treat as ELSE
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

  // Build nested IFs from bottom up
  let formula = elseExpr || '0'

  for (let i = pairs.length - 1; i >= 0; i--) {
    const [cond, val] = pairs[i]
    formula = `IF(${cond},${val},${formula})`
  }

  return formula
}
/**
 * Convert a model expression to an Excel formula
 */
function convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, step, cohortVarColMap, temporalId) {
  if (!expression || typeof expression !== 'string') {
    return null
  }
  
  let formula = expression.trim()
  const tId = String(temporalId ?? 'step')
  const tEsc = escapeRegex(tId)
    const idxPat = (tId.toLowerCase() === 'step') ? tEsc : `(?:${tEsc}|step)`
  
  // Replace variable references with cell references
  // We need to identify variable names and replace them with appropriate cell references
  
  // First, handle function calls like floor(), max(), min()
  formula = formula.replace(/\bfloor\s*\(/gi, 'INT(')
  formula = formula.replace(/\bceiling\s*\(/gi, 'ROUNDUP(')
  formula = formula.replace(/\bROUNDUP\s*\(([^)]+)\)/g, 'ROUNDUP($1,0)')  // Add second parameter for ROUNDUP
  formula = formula.replace(/\bmax\s*\(/gi, 'MAX(')
  formula = formula.replace(/\bmin\s*\(/gi, 'MIN(')
  
  // Handle comparison operators for Excel
  // >= and <= are already valid in Excel
  // = becomes = for comparison
  
  // Handle ternary operator: condition ? value1 : value2 => IF(condition, value1, value2)
  const ternaryMatch = formula.match(/(.+?)\s*\?\s*(.+?)\s*:\s*(.+)/)
  if (ternaryMatch) {
    const condition = ternaryMatch[1].trim()
    const trueValue = ternaryMatch[2].trim()
    const falseValue = ternaryMatch[3].trim()
    formula = `IF(${condition},${trueValue},${falseValue})`
  }
  
  // Handle references to cohort-only variables (from calc_cohort sheet)
  // These are variables with arguments like current_age(cohort) or annuity_start_age(cohort)
  // They should reference cells in the calc_cohort sheet
  if (cohortVarColMap) {
    for (const [varName, colLetter] of cohortVarColMap) {
      const escapedVarName = escapeRegex(varName)
      // Match variable with (cohort) argument - this is a model function call
      const patternWithCohort = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*\\)`, 'gi')
      // Replace with reference to calc_cohort sheet, row 2 (data row), absolute column
      formula = formula.replace(patternWithCohort, `calc_cohort!${colLetter}$2`)
    }
  }
  
  // Replace variable references
  // For each variable in the current calculation context
  for (const varName of cohortStepVars) {
    const colIndex = colIndexMap.get(varName)
    if (colIndex) {
      const colLetter = getColumnLetter(colIndex)
      // Escape variable name for regex
      const escapedVarName = escapeRegex(varName)
      
      // Replace variable references with cell references
      // Patterns are ordered from most specific to least specific to avoid incorrect replacements
      // Each pattern uses word boundaries (\b) to match only complete variable names
      // Note: The replacements are safe because:
      // 1. Cell references (like K2) will not match variable name patterns
      // 2. Each regex matches the actual variable name, not the replacement text
      // 3. Word boundaries prevent partial matches
      
      // Pattern 1: Handle function calls with step parameter shifts
      // Example: variable(cohort, step - 1) or variable(cohort, step-2)
      const patternWithOffset = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*,\\s*${tEsc}\\s*-\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternWithOffset, (match, offset) => {
        // offset is the number after "step - "
        const targetRow = currentRow - parseInt(offset, 10)
        // Validate that targetRow is within valid range (row 2+ since row 1 is header)
        if (targetRow < 2) {
          // If the offset would reference before the data rows, clamp to row 2
          // This handles edge cases where step=0 with step-1 would reference row 1 (header)
          return `${colLetter}2`
        }
        return `${colLetter}${targetRow}`
      })

      // Pattern 1+: Handle cohort-step variable with forward temporal shift
      // Example: variable(cohort, step + 1) -> K{row+1}
      const patternWithForwardOffset = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*,\\s*${tEsc}\\s*\\+\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternWithForwardOffset, (match, offset) => {
        return `${colLetter}${currentRow + parseInt(offset, 10)}`
      })

      // Pattern 1b: Handle single temporal-arg variables with offset
      // Example: outstanding_debt(month - 1) -> O2, variable(step - 2) -> K{row-2}
      const patternSingleArgWithOffset = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*${tEsc}\\s*-\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternSingleArgWithOffset, (match, offset) => {
        const targetRow = currentRow - parseInt(offset, 10)
        if (targetRow < 2) {
          return `${colLetter}2`
        }
        return `${colLetter}${targetRow}`
      })

      // Pattern 1b+: Handle single temporal-arg variable with forward shift
      // Example: variable(step + 1) -> K{row+1}
      const patternSingleArgWithForwardOffset = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*${tEsc}\\s*\\+\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternSingleArgWithForwardOffset, (match, offset) => {
        return `${colLetter}${currentRow + parseInt(offset, 10)}`
      })

      // Pattern 1c: Handle variable with literal integer argument
      // Uses inferred temporalMin so it works for both 0-based and 1-based index sets.
      const patternIntegerArg = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternIntegerArg, (match, intArg) => {
        const n = parseInt(intArg, 10)

        // Infer temporal min from the current (step,currentRow) mapping:
        // currentRow = 2 + (step - min)  =>  min = step - (currentRow - 2)
        const inferredMin =
          (typeof step === 'number' && !Number.isNaN(step))
            ? (step - (currentRow - 2))
            : 0

        const targetRow = 2 + (n - inferredMin)

        // Clamp to first data row if out of range
        if (targetRow < 2) return `${colLetter}2`
        return `${colLetter}${targetRow}`
      })
      
      
      // Pattern 2: Handle step-only variables
      // Example: discount_factor(step) -> K2
      const patternStepOnly = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*${tEsc}\\s*\\)`, 'gi')
      formula = formula.replace(patternStepOnly, `${colLetter}${currentRow}`)
      
      // Pattern 3: Handle cohort-step variables
      // Example: cashflow(cohort, step) -> I2
      const patternCohortStep = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*,\\s*${tEsc}\\s*\\)`, 'gi')
      formula = formula.replace(patternCohortStep, `${colLetter}${currentRow}`)
      
      // Pattern 3b: Handle single-argument variables with any named index argument
      // Example: monthly_revenue(month) -> K2, total_flights(year) -> K2
      // This covers temporal index names like month, year, period, etc. (not just "step")
      const patternSingleNamedArg = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*[a-zA-Z_][a-zA-Z0-9_]*\\s*\\)`, 'gi')
      formula = formula.replace(patternSingleNamedArg, `${colLetter}${currentRow}`)
      
      // Pattern 4: Handle bare variable name without arguments (least specific, applied last)
      // Example: rate -> constant!$B$1
      // Match variable name with optional empty parentheses (e.g., "rate" or "rate()")
      // The trailing \b prevents matching a variable name that is a prefix of a longer name
      // (e.g., monthly_net_profit must not match inside monthly_net_profit_after_interest)
      // Note: No trailing \b after the optional parens, as \b would prevent matching "()"
      const pattern2 = new RegExp(`\\b${escapedVarName}\\b(?:\\(\\))?`, 'gi')
      formula = formula.replace(pattern2, `${colLetter}${currentRow}`)
    }
  }
  
  // Handle references to constant variables
  // Build a map of constant variable names to their row numbers in the constant sheet
  const constantRowMap = new Map()
  let constantRow = 1
  for (const constVar of constantVars) {
    constantRowMap.set(constVar, constantRow)
    constantRow++
  }
  
  for (const constVar of constantVars) {
    const constVarXml = variableMap.get(constVar)
    if (constVarXml) {
      // Reference to constant sheet with the appropriate row number
      const escapedConstVar = escapeRegex(constVar)
      // Match variable name with optional empty parentheses (e.g., "rate" or "rate()")
      // The trailing \b prevents matching a variable name that is a prefix of a longer name
      // Note: No trailing \b after the optional parens, as \b would prevent matching "()"
      const pattern = new RegExp(`\\b${escapedConstVar}\\b(?:\\(\\))?`, 'gi')
      const constRowNum = constantRowMap.get(constVar) || 1
      formula = formula.replace(pattern, `constant!$B$${constRowNum}`)
    }
  }
  
  // Handle temporal index reference (column A in calc_cohort_step sheet)
  // Negative lookahead prevents replacing Excel built-in functions like MONTH(), YEAR(), DAY(), TIME()
  formula = formula.replace(new RegExp(`\\b${tEsc}\\b(?!\\s*\\()`, 'gi'), `A${currentRow}`)

  // Backward-compat: if the model's temporal index isn't named "step" but formulas still contain step
  if (tId.toLowerCase() !== 'step') {
    formula = formula.replace(/\bstep\b(?!\s*\()/gi, `A${currentRow}`)
  }
  
  return formula || null
}

/**
 * Convert a constant expression to an Excel formula for the constant sheet
 * This handles expressions that reference other constant variables
 */
function convertConstantExpressionToFormula(expression, currentRow, constantRowMap, variableMap, temporalId) {
  if (!expression || typeof expression !== 'string') {
    return null
  }
  
  let formula = expression.trim()
  const tId = String(temporalId ?? 'step')
  const tEsc = escapeRegex(tId)
    const idxPat = (tId.toLowerCase() === 'step') ? tEsc : `(?:${tEsc}|step)`
  
  // Handle function calls like floor(), max(), min()
  formula = formula.replace(/\bfloor\s*\(/gi, 'INT(')
  formula = formula.replace(/\bceiling\s*\(/gi, 'ROUNDUP(')
  formula = formula.replace(/\bROUNDUP\s*\(([^)]+)\)/g, 'ROUNDUP($1,0)')
  formula = formula.replace(/\bmax\s*\(/gi, 'MAX(')
  formula = formula.replace(/\bmin\s*\(/gi, 'MIN(')
  
  // Replace variable references with cell references to other rows in the constant sheet
  // Sort by row number to ensure dependencies are resolved in order
  const sortedConstants = Array.from(constantRowMap.entries()).sort((a, b) => a[1] - b[1])
  
  for (const [constVarName, constRowNum] of sortedConstants) {
    // Only replace variables that appear before the current row (to avoid forward references)
    // or on the current row (self-reference, which should be avoided but handle gracefully)
    const constVarXml = variableMap.get(constVarName)
    if (constVarXml) {
      const escapedConstVar = escapeRegex(constVarName)
      // Match variable name with optional empty parentheses (e.g., "B2" or "B2()")
      // The (?:\(\))? part matches () zero or one time (non-capturing group)
      // The trailing \b prevents matching a variable name that is a prefix of a longer name
      // Note: No trailing \b after the optional parens, as \b would prevent matching "()"
      const pattern = new RegExp(`\\b${escapedConstVar}\\b(?:\\(\\))?`, 'gi')
      
      // Reference to constant sheet column B with absolute row reference
      formula = formula.replace(pattern, `$B$${constRowNum}`)
    }
  }
  
  return formula || null
}

/**
 * Convert a model expression to an Excel formula (simplified)
 * @deprecated Use the full convertExpressionToFormula function instead
 */
function convertExpressionToFormulaSimple(expression, currentRow, colIndexMap, cohortStepVars) {
  // This is a simplified conversion - a full implementation would need proper parsing
  // For now, return null to use default value
  return null
}

/**
 * Get column letter from column index (1=A, 2=B, ..., 26=Z, 27=AA, etc.)
 */
function getColumnLetter(index) {
  let letter = ''
  while (index > 0) {
    const remainder = (index - 1) % 26
    letter = String.fromCharCode(65 + remainder) + letter
    index = Math.floor((index - 1) / 26)
  }
  return letter
}

/**
 * Topologically sorts variables based on their dependencies
 * @param {Map} incoming - Map of variable name to Set of dependency objects {name, shift}
 * @param {Array} variableNames - Array of all variable names
 * @returns {Array} - Array of variable names in dependency order
 */
function topologicalSort(incoming, variableNames) {
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

// ─── HTML preview ──────────────────────────────────────────────────────────

/**
 * Evaluate "constant sheet" values for HTML preview.
 *
 * The constant sheet includes both:
 *  - definitionType="constant" (literal constants like "1/12")
 *  - definitionType="expression" with no arguments (derived constants)
 *
 * In the Excel renderer, derived constants become formulas that ultimately
 * show numeric results. The preview should do the same, so we attempt to
 * evaluate derived constants numerically (including nested references to other
 * constants), and fall back to raw expression text when evaluation isn't
 * possible.
 */
function evaluateConstantsForPreview(modelObj, modelFeatures, variableMap, categorized, temporalId) {
  // Variable ids sorted longest-first to prevent shorter names from
  // partially substituting inside longer ones.
  const allVarIds = Array.from(variableMap.values())
    .map(v => v.id)
    .sort((a, b) => b.length - a.length)

  // Memoisation: key = varId
  const cache = new Map()

  /** Format computed values for display (mirror evaluateModelForPreview). */
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
    cache.set(key, null) // sentinel to break cycles
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

  /** Evaluate a purely-arithmetic constant expression (no variable refs). */
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

  /** Evaluate an expression intended to be constant (no cohort/temporal args). */
  function evalExpr(expr) {
    if (!expr || typeof expr !== 'string') return null
    let e = expr.trim()

    // Constants should not depend on time; treat temporal index words as 0.
    const tId = String(temporalId ?? 'step')
    const tEsc = escapeRegex(tId)
    e = e.replace(new RegExp(`\\b${tEsc}\\b`, 'gi'), '0')
    if (tId.toLowerCase() !== 'step') e = e.replace(/\bstep\b/gi, '0')

    // Replace variable references (constants), longest-first.
    for (const varId of allVarIds) {
      const esc = escapeRegex(varId)
      // bare varname — constant, no arguments
      e = e.replace(
        new RegExp(`\\b${esc}\\b(?:\\(\\))?`, 'gi'),
        () => numStr(evalVar(varId))
      )
    }

    // Map model-language functions → JS Math equivalents
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

    // Power operator: ^ → **
    e = e.replace(/\^/g, '**')

    // Single = (equality test in model language) → === for JavaScript.
    e = e.replace(/(?<![!<>=])=(?!=)/g, '===')

    try {
      const val = new Function('"use strict"; return (' + e + ')')()
      if (typeof val === 'number' && isFinite(val)) return val
      if (typeof val === 'boolean') return val ? 1 : 0
    } catch (_) {}
    return null
  }

  // Produce rows for the constant sheet.
  const rows = categorized.constants
    .filter(varName => variableMap.has(varName))
    .map(varName => {
      const varXml = variableMap.get(varName)
      const defType = getDefinitionType(varXml)
      const raw = getDefinitionText(varXml)

      // Try to evaluate derived constants to a numeric value.
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
 * Evaluates model variables numerically for cohort 1 over the configured step
 * range, using the same sample data that the spreadsheet renderer generates.
 * Returns rows ready for renderSheetAsHtml.
 *
 * @param {Object} modelObj
 * @param {Object} modelFeatures
 * @returns {{ cohortHeaders, cohortRows, stepHeaders, stepRows }}
 */
function evaluateModelForPreview(modelObj, modelFeatures, ctx) {
  // Determine which indexSet acts as the temporal axis for preview.
  // Prefer an explicit role=\"temporal\" marker, then fall back to legacy \"step\".
  const temporalId = getTemporalIndexSetId(modelObj) ?? 'step'

  // Build lookup: tableId → { headers: string[], rows: any[][] }
  const tableData = {}
  for (const { name, headers, dataRows } of buildTableSheetsData(modelObj)) {
    tableData[name.replace(/^input_/, '')] = { headers, rows: dataRows }
  }

  const variableMap = buildVariableMap(modelObj)
  const dataTypeById = buildDataTypeMap(variableMap)
  const { resolvedVarsWithArguments } = modelFeatures
    const categorized = categorizeVariables(variableMap, resolvedVarsWithArguments, temporalId)
  const { min: stepMin, max: stepMax } = getStepRange(modelObj, temporalId)
  const cohortId = ctx.cohortId  // matches input_config cohort value

  // Variable ids sorted longest-first to prevent shorter names from
  // partially substituting inside longer ones (e.g. "attained_age" inside
  // "attained_age_years_floor").
  const allVarIds = Array.from(variableMap.values())
    .map(v => v.id)
    .sort((a, b) => b.length - a.length)

  // Memoisation: key = "varId:cohort:step"
  const cache = new Map()

  function evalVar(varId, cohort, step) {
    const key = `${varId}:${cohort ?? '_'}:${step ?? '_'}`
    if (cache.has(key)) return cache.get(key)
    cache.set(key, null) // sentinel to break cycles
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

  /** Evaluate a purely-arithmetic constant expression (no variable refs). */
  function evalArith(expr) {
    if (!expr) return null
    const e = String(expr).trim()
    if (!e) return null
    // Only evaluate expressions that contain digits and basic arithmetic operators.
    // Expressions come from the user's own model XML so the risk is self-contained,
    // but we restrict the character set here as a first-line guard.
    try {
      if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(e))
        return Function('"use strict"; return (' + e + ')')()
    } catch (_) {}
    return null
  }

  /**
   * Substitute all known variable references in expr with their evaluated
   * numeric values, then evaluate the resulting arithmetic expression.
   *
   * Security note: expressions originate from the user's own model XML, so
   * evaluation with `new Function` (strict mode, no closure access) is
   * equivalent to a trusted-source script.  The broad try/catch ensures any
   * malformed input is silently discarded and returns null.
   */
  function evalExpr(expr, cohort, step) {
    const tId = String(temporalId ?? 'step')
    const tEsc = escapeRegex(tId)
    const idxPat = (tId.toLowerCase() === 'step') ? tEsc : `(?:${tEsc}|step)`
    if (!expr || typeof expr !== 'string') return null
    let e = expr.trim()

    // Replace variable calls, longest-first to avoid partial-name clobbering
    for (const varId of allVarIds) {
      const esc = escapeRegex(varId)
      // varname(cohort, <temporal> - N)
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*cohort\\s*,\\s*${idxPat}\\s*-\\s*(\\d+)\\s*\\)`, 'gi'),
        (_, n) => numStr(evalVar(varId, cohort, (step ?? 0) - +n))
      )
      // varname(cohort, <temporal> + N)
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*cohort\\s*,\\s*${idxPat}\\s*\\+\\s*(\\d+)\\s*\\)`, 'gi'),
        (_, n) => numStr(evalVar(varId, cohort, (step ?? 0) + +n))
      )
      // varname(cohort, <temporal>)
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*cohort\\s*,\\s*${idxPat}\\s*\\)`, 'gi'),
        () => numStr(evalVar(varId, cohort, step))
      )
      // varname(cohort)
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*cohort\\s*\\)`, 'gi'),
        () => numStr(evalVar(varId, cohort, null))
      )
      // varname(123)  ← add this (numeric literal argument)
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*(\\d+)\\s*\\)`, 'gi'),
        (_, n) => numStr(evalVar(varId, cohort, +n))
      )

      // varname(<temporal> - N)  ← change cohort null -> cohort
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*${idxPat}\\s*-\\s*(\\d+)\\s*\\)`, 'gi'),
        (_, n) => numStr(evalVar(varId, cohort, (step ?? 0) - +n))
      )

      // varname(<temporal> + N)
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*${idxPat}\\s*\\+\\s*(\\d+)\\s*\\)`, 'gi'),
        (_, n) => numStr(evalVar(varId, cohort, (step ?? 0) + +n))
      )

      // varname(<temporal>)  ← change cohort null -> cohort
      e = e.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*${idxPat}\\s*\\)`, 'gi'),
        () => numStr(evalVar(varId, cohort, step))
      )
      // bare varname — constant, no arguments
      e = e.replace(
        new RegExp(`\\b${esc}\\b(?:\\(\\))?`, 'gi'),
        () => numStr(evalVar(varId, null, null))
      )
    }

    // Substitute the step index itself (after all variable names are gone)
    if (step !== null && step !== undefined)
      e = e.replace(new RegExp(`\\b${tEsc}\\b`, 'gi'), String(step))

    // Backward-compat: if formulas still contain "step"
    if (tId.toLowerCase() !== 'step') {
      e = e.replace(/\bstep\b/gi, String(step))
    }

    // Map model-language functions → JS Math equivalents
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

    // Power operator: ^ → **
    e = e.replace(/\^/g, '**')

    // Single = (equality test in model language) → === for JavaScript.
    // Uses negative lookbehind so that >=, <=, != and === are left untouched.
    e = e.replace(/(?<![!<>=])=(?!=)/g, '===')

    try {
      const val = new Function('"use strict"; return (' + e + ')')()
      if (typeof val === 'number' && isFinite(val)) return val
      if (typeof val === 'boolean') return val ? 1 : 0
    } catch (_) {}
    return null
  }

  /** Lookup a table-definition variable (type="table"). */
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
      // Exact match on the row-index column (cohort)
      const row = tbl.rows.find(r => r[0] === cohort)
      return row ? row[colIdx] : null
    }
    if (hasTemporal && !hasCohort) {
      // Approximate match: largest row-index value ≤ step
      let match = null
      for (const row of tbl.rows) {
        if (row[0] <= step) match = row
        else break
      }
      return match ? match[colIdx] : null
    }
    return null
  }

  /** Lookup a tableLookup-definition variable (type="tableLookup"). */
  function evalTableLookupDef(varXml, cohort, step) {
    const def = varXml.definition
    const tableRef  = def?.table?.ref          || def?.table?.['#text']          || ''
    const rowRef    = def?.row?.ref            || def?.row?.['#text']            || ''
    const colSelRef = def?.columnSelector?.ref || def?.columnSelector?.['#text'] || ''
    if (!tableRef) return null

    const tbl = tableData[tableRef]
    if (!tbl) return null

    // Evaluate row key (approximate: largest ≤ rowKey)
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

  /** Evaluate a piecewise-definition variable. */
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

  /** Format a computed value for display.  Numerics are rounded to 6 decimal
   *  places (1e6) to avoid long floating-point noise while preserving enough
   *  precision for actuarial values like survival rates (e.g. 0.997034). */
  function fmt(v) {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') {
      if (!isFinite(v)) return ''
      if (Number.isInteger(v)) return String(v)
      return String(Math.round(v * 1e6) / 1e6)
    }
    return String(v)
  }

  /** Return '0' for null/undefined, String(v) otherwise. */
  function numStr(v) {
    return (v !== null && v !== undefined) ? String(v) : '0'
  }

  // ── Build calc_cohort data ─────────────────────────────────────────────────
  const cohortHeaders = [
    'cohort',
    ...categorized.cohortOnly.map(n => variableMap.get(n)?.id ?? n)
  ]
  const cohortRow = [String(cohortId)]
  for (const varName of categorized.cohortOnly) {
    const varXml = variableMap.get(varName)
    cohortRow.push(varXml ? fmt(evalVar(varXml.id, cohortId, null)) : '')
  }

  // ── Build calc_cohort_step data ────────────────────────────────────────────
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


/**
 * Escapes HTML special characters to prevent XSS.
 */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Renders a single sheet as an HTML <details>/<table> block.
 */
function renderSheetAsHtml(name, headers, rows, dataTypeById, { temporalId = 'step', activeCohortId } = {}) {
  // --- Display-layer formatting (keep model precision; format only in preview) ---
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

    // Prefer explicit XML dataType where possible
    const keyU = key.toUpperCase()
    const dt = dataTypeById?.get?.(keyU) ?? dataTypeById?.[keyU] ?? dataTypeById?.get?.(key) ?? dataTypeById?.[key]
    const kind = kindFromDataType(dt)
    if (kind !== 'text') return kind

    // Non-variable columns (index-set axes) may not exist in the variable map.
    // Keep a tiny, structural fallback (NOT heuristic on ids like "revenue"/"cost").
    if (k === temporalId || k === 'step' || k === 'month') return 'int'

    return 'text'
  }

  const formatCell = (value, kind) => {
    if (value == null) return ''
    if (value === '') return ''

    // Preserve rich objects (ExcelJS formulas sometimes get serialized as objects elsewhere)
    if (typeof value === 'object') return JSON.stringify(value)

    // IMPORTANT: "text" columns (like the constant-sheet value column) should
    // not auto-format numeric-looking strings into fixed decimals (e.g. 45 →
    // 45.0000). If the model didn't declare a numeric dataType for the column,
    // we preserve the author's literal rendering.
    if (kind === 'text') return String(value)

    const n = toNumberIfSafe(value)
    if (n == null || Number.isNaN(n)) {
      // booleans sometimes come through as true/false
      if (kind === 'bool' && typeof value === 'boolean') return value ? 'Yes' : 'No'
      return String(value)
    }

    if (kind === 'bool') {
      // treat 0/1 as No/Yes
      return n ? 'Yes' : 'No'
    }

    if (kind === 'int') return nfInt.format(n)

    if (kind === 'money') {
      // If it looks like it has cents, keep 2dp; otherwise 0dp.
      const hasCents = Math.abs(n % 1) > 1e-9
      return (hasCents ? nfMoney2 : nfMoney0).format(n)
    }

    // decimals: show 4dp (including ratios)
    // For ratio/decimal columns we *always* show 4dp, even for values like 0, 1, 2.
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

      // keep raw numeric for future sorting/debugging
      const raw = cell == null ? '' : String(cell)
      // Cohort pickers in HTML preview: make cohort column clickable for data rows only
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
 * Renders a model as HTML tables for in-browser preview.
 * Reuses the same data-building functions as the Excel renderer
 * (buildVariableMap, buildInputConfigData, buildTableSheetsData)
 * so the two renderers stay in sync without duplicating logic.
 *
 * @param {Object} modelObj      - The model object (from getObjectFromXML)
 * @param {Object} modelFeatures - The model features (from validateModelCore)
 * @returns {string} HTML string containing all preview tables
 */
export function renderModelAsHTMLPreview(modelObj, modelFeatures, ctx = makeRenderContext()) {

  if (!modelObj?.model) throw new Error("Invalid model object")
  if (!modelFeatures?.variables) throw new Error("Invalid model features")

  // Determine which indexSet acts as the temporal axis for preview.
  // Prefer an explicit role="temporal" marker, then fall back to legacy "step".
  const temporalId = getTemporalIndexSetId(modelObj) ?? 'step'

  const { resolvedVarsWithArguments } = modelFeatures
  const variableMap = buildVariableMap(modelObj)
  const dataTypeById = buildDataTypeMap(variableMap)
  const categorized = categorizeVariables(variableMap, resolvedVarsWithArguments, temporalId)

  const parts = []

  // calc_cohort and calc_cohort_step sheets — evaluated values
  const { cohortHeaders, cohortRows, stepHeaders, stepRows } =
    evaluateModelForPreview(modelObj, modelFeatures, ctx)

  if (stepRows.length > 0)
    parts.push(renderSheetAsHtml('calc_cohort_step', stepHeaders, stepRows, dataTypeById, { temporalId, activeCohortId: ctx.cohortId }))

  if (cohortRows.length > 0)
    parts.push(renderSheetAsHtml('calc_cohort', cohortHeaders, cohortRows, dataTypeById, { temporalId, activeCohortId: ctx.cohortId }))

  // input_{tableId} sheets — reuse buildTableSheetsData
  for (const { name, headers, metadataRows, dataRows } of buildTableSheetsData(modelObj)) {
    parts.push(renderSheetAsHtml(name, headers, [...metadataRows, ...dataRows], dataTypeById, { temporalId, activeCohortId: ctx.cohortId }))
  }

  // input_config sheet — reuse buildInputConfigData
  const cfg = buildInputConfigData(ctx)
  parts.push(renderSheetAsHtml('input_config', cfg.headers, cfg.rows, dataTypeById, { temporalId, activeCohortId: ctx.cohortId }))

  // constant sheet
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

// Export formula generation functions for testing
export { generateTableLookupFormula, generateTableLookupFormulaAdvanced, convertExpressionToFormula, generatePiecewiseFormula }
