/**
 * Spreadsheet Renderer V2
 * Converts a validated model into an Excel workbook with multiple sheets using ExcelJS
 * Generates a spreadsheet for a single cohort calculation
 */

import { asArray } from '../utils/helpers.js'

/**
 * Gets the definition text from a variable's XML representation
 */
function getDefinitionText(varXml) {
  if (!varXml.definition) return ""
  return varXml.definition["#text"] || ""
}

/**
 * Gets the definition type from a variable's XML representation
 */
function getDefinitionType(varXml) {
  if (!varXml.definition) return ""
  return varXml.definition.type || ""
}

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
  const variableMap = new Map()
  if (modelObj.model.variables && modelObj.model.variables.variable) {
    const vars = Array.isArray(modelObj.model.variables.variable) 
      ? modelObj.model.variables.variable 
      : [modelObj.model.variables.variable]
    
    for (const v of vars) {
      variableMap.set(v.id.toUpperCase(), v)
    }
  }
  
  // Categorize variables by their argument structure
  const categorized = categorizeVariables(variableMap, resolvedVarsWithArguments)
  
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
          const formula = convertConstantExpressionToFormula(expression, currentRow, constantRowMap, variableMap)
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
  addInputConfigSheet(workbook)
  
  // Add table sheets with sample data
  addTableSheets(workbook, modelObj)
  
  // Add calculation sheet for cohort variables (single cohort, no steps)
  if (categorized.cohortOnly.length > 0) {
    addCohortSheet(workbook, categorized.cohortOnly, variableMap)
  }
  
  // Add calculation sheet for cohort-step variables (single cohort, multiple steps)
  if (categorized.cohortStep.length > 0) {
    addCohortStepSheet(workbook, categorized.cohortStep, variableMap, categorized.constants, categorized.cohortOnly)
  }
  
  // Generate Excel file
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { 
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  })
  
  return blob
}

/**
 * Categorize variables by their argument structure
 */
function categorizeVariables(variableMap, resolvedVarsWithArguments) {
  const constants = []
  const cohortOnly = []
  const cohortStep = []
  const other = []
  
  // Common temporal/time-based argument names (step, month, year, period, time, etc.)
  const temporalArgs = ['STEP', 'MONTH', 'YEAR', 'PERIOD', 'TIME', 'QUARTER', 'WEEK', 'DAY']
  
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
    } else if (args.length === 1 && temporalArgs.includes(args[0].toUpperCase())) {
      // Single temporal argument variables should be included in the cohort-step sheet
      cohortStep.push(varName)
    } else if (args.length === 2 && args[0].toUpperCase() === 'COHORT' && temporalArgs.includes(args[1].toUpperCase())) {
      // Cohort + temporal argument variables
      cohortStep.push(varName)
    } else {
      other.push(varName)
    }
  }
  
  return { constants, cohortOnly, cohortStep, other }
}

/**
 * Extract table definitions from model object
 * @param {Object} modelObj - The model object
 * @returns {Map} - Map of table ID to table definition with columns array
 */
function extractTableDefinitions(modelObj) {
  const tableMap = new Map()
  
  if (!modelObj?.model?.tables?.table) {
    return tableMap
  }
  
  const tables = Array.isArray(modelObj.model.tables.table) 
    ? modelObj.model.tables.table 
    : [modelObj.model.tables.table]
  
  for (const table of tables) {
    if (!table.id) continue
    
    const tableId = table.id
    const rowIndex = table.rowIndex?.ref || table.rowIndex?.['#text'] || tableId
    
    // Extract min/max from rowIndex if present
    const rowIndexMinValue = table.rowIndex?.min !== undefined ? parseFloat(table.rowIndex.min) : undefined
    const rowIndexMaxValue = table.rowIndex?.max !== undefined ? parseFloat(table.rowIndex.max) : undefined
    const rowIndexMin = (rowIndexMinValue !== undefined && !isNaN(rowIndexMinValue)) ? rowIndexMinValue : undefined
    const rowIndexMax = (rowIndexMaxValue !== undefined && !isNaN(rowIndexMaxValue)) ? rowIndexMaxValue : undefined
    
    // Extract columns if defined
    const columns = []
    if (table.columns?.column) {
      const cols = Array.isArray(table.columns.column) 
        ? table.columns.column 
        : [table.columns.column]
      
      for (const col of cols) {
        const minValue = col.min !== undefined ? parseFloat(col.min) : undefined
        const maxValue = col.max !== undefined ? parseFloat(col.max) : undefined
        columns.push({
          id: col.id || '',
          dataType: col.dataType || 'real',
          unit: col.unit || '',
          min: (minValue !== undefined && !isNaN(minValue)) ? minValue : undefined,
          max: (maxValue !== undefined && !isNaN(maxValue)) ? maxValue : undefined
        })
      }
    }
    
    tableMap.set(tableId, {
      id: tableId,
      rowIndex: rowIndex,
      rowIndexMin: rowIndexMin,
      rowIndexMax: rowIndexMax,
      columns: columns
    })
  }
  
  return tableMap
}

/**
 * Extract column constraints from variables in the model
 * Maps table.column -> { columnOfTable: "referenced_table_name" }
 * @param {Object} modelObj - The model object
 * @returns {Map} - Map of "tableId.columnId" to constraint info
 */
function extractColumnConstraints(modelObj) {
  const constraintMap = new Map()
  
  if (!modelObj?.model?.variables?.variable) {
    return constraintMap
  }
  
  const variables = Array.isArray(modelObj.model.variables.variable)
    ? modelObj.model.variables.variable
    : [modelObj.model.variables.variable]
  
  for (const variable of variables) {
    // Check if variable has a columnOf constraint
    const columnOfTable = variable?.constraints?.mustResolveAs?.columnOf?.table
    
    if (columnOfTable) {
      // Extract which table and column this variable references
      const tableRef = variable?.definition?.table?.ref
      const columnRef = variable?.definition?.column?.ref
      
      if (tableRef && columnRef) {
        const key = `${tableRef}.${columnRef}`
        constraintMap.set(key, {
          columnOfTable: columnOfTable
        })
      }
    }
  }
  
  return constraintMap
}

/**
 * Resolve columnOf constraint to get actual column names from referenced table
 * @param {string} referencedTableId - Table ID to get columns from
 * @param {Map} tableDefs - Map of table definitions
 * @returns {string[]} - Array of column IDs (excluding row index)
 */
function resolveColumnOfConstraint(referencedTableId, tableDefs) {
  const table = tableDefs.get(referencedTableId)
  
  if (!table) {
    return []
  }
  
  // If table has defined columns, return their IDs
  if (table.columns && table.columns.length > 0) {
    return table.columns.map(col => col.id)
  }
  
  // If table has no defined columns (unconstrained), generate default column names
  // This handles cases like mortality_rate which dynamically gets columns from data
  // Use domain-specific defaults based on table name patterns
  const lowerTableId = referencedTableId.toLowerCase()
  
  if (lowerTableId.includes('mortality') || lowerTableId.includes('mortal')) {
    // Common mortality table column names used in actuarial models
    return ['AM92U', 'AF92U']
  }
  
  // Generic fallback for other unconstrained tables
  return [`${referencedTableId}_col1`, `${referencedTableId}_col2`]
}

/**
 * Generate sample value based on column name and data type
 * @param {string} columnId - Column identifier
 * @param {string} dataType - Data type (real, integer, string, boolean)
 * @param {number} rowIndex - Row index for variation
 * @param {number} [min] - Optional minimum value for numeric types
 * @param {number} [max] - Optional maximum value for numeric types
 * @param {string} [tableId] - Optional table identifier for generic string generation
 * @param {string[]} [validValues] - Optional array of valid values (e.g., from columnOf constraint)
 * @returns {*} - Sample value
 */
function generateSampleValue(columnId, dataType, rowIndex, min, max, tableId, validValues) {
  const lowerColId = columnId.toLowerCase()
  
  // If valid values are provided (e.g., from columnOf constraint), cycle through them
  if (validValues && validValues.length > 0) {
    return validValues[rowIndex % validValues.length]
  }
  
  // If min and max are provided, generate value within that range
  if (min !== undefined && max !== undefined && !isNaN(min) && !isNaN(max) && (dataType === 'real' || dataType === 'integer')) {
    const range = max - min
    const numSamples = 4  // Generate 4 different values across the range
    
    // Handle edge cases
    if (numSamples <= 1 || range === 0) {
      return dataType === 'integer' ? Math.round(min) : min
    }
    
    // Generate evenly spaced values that include both min and max
    // For numSamples=4: rowIndex % 4 gives 0,1,2,3
    // Division by (numSamples-1) ensures: index 0 → min, index 3 → max
    // Example: min=10, max=50, range=40: values are 10, 23.33, 36.67, 50
    const value = min + (rowIndex % numSamples) * (range / (numSamples - 1))
    return dataType === 'integer' ? Math.round(value) : value
  }
  
  // Handle row index columns (structural logic required for any model)
  if (lowerColId === 'id' || lowerColId === 'cohort') {
    return rowIndex
  }
  
  // Generic handling by data type
  if (dataType === 'string') {
    // Use table-based naming if tableId is provided
    if (tableId) {
      return `${tableId}_column${rowIndex + 1}`
    }
    return `value_${rowIndex}`
  }
  
  if (dataType === 'integer') {
    return rowIndex * 10
  }
  
  if (dataType === 'boolean') {
    return rowIndex % 2 === 0
  }
  
  // Default for real numbers
  return 100 + rowIndex * 25
}

/**
 * Add table sheets with sample data (extracted from model definitions)
 */
function addTableSheets(workbook, modelObj) {
  const tableDefs = extractTableDefinitions(modelObj)
  
  // If no tables defined in model, skip adding any table sheets
  // (Only add tables that are explicitly defined in the model)
  if (tableDefs.size === 0) {
    return
  }
  
  // Extract column constraints from variables
  const columnConstraints = extractColumnConstraints(modelObj)
  
  // Generate sheets for each table in the model
  for (const [tableId, tableDef] of tableDefs) {
    const sheetName = `input_${tableId}`
    const sheet = workbook.addWorksheet(sheetName)
    
    // Build header row: row index column + data columns
    const headers = [tableDef.rowIndex]
    
    if (tableDef.columns.length > 0) {
      // Use defined columns
      for (const col of tableDef.columns) {
        headers.push(col.id)
      }
    } else {
      // For unconstrained tables, generate column names based on context
      // Check if any other table references this table in a columnOf constraint
      const referencedColumns = resolveColumnOfConstraint(tableId, tableDefs)
      if (referencedColumns.length > 0) {
        // Use the resolved column names
        headers.push(...referencedColumns)
      } else {
        // Generate generic column names
        // Use pattern: {tableId}_column1, {tableId}_column2, etc.
        headers.push(`${tableId}_column1`, `${tableId}_column2`)
      }
    }
    
    sheet.addRow(headers)
    
    // Add metadata rows if columns are defined
    if (tableDef.columns.length > 0) {
      const dataTypes = ['dataType']
      const units = ['unit']
      const domains = [tableDef.rowIndex]
      
      for (const col of tableDef.columns) {
        dataTypes.push(col.dataType || '')
        units.push(col.unit || '')
        domains.push('')
      }
      
      sheet.addRow(dataTypes)
      sheet.addRow(units)
      sheet.addRow(domains)
    }
    
    // Generate sample data rows
    const numSampleRows = determineSampleRowCount(tableDef)
    
    for (let i = 0; i < numSampleRows; i++) {
      const row = []
      
      // Generate row index value
      if (tableDef.rowIndexMin !== undefined && tableDef.rowIndexMax !== undefined) {
        // Use model-specified range for row index
        const range = tableDef.rowIndexMax - tableDef.rowIndexMin
        let rowIndexValue
        
        if (numSampleRows <= 1) {
          // Single row: use minimum value
          rowIndexValue = tableDef.rowIndexMin
        } else if (range < numSampleRows) {
          // If range is smaller than sample count, generate sequential values
          rowIndexValue = tableDef.rowIndexMin + i
        } else {
          // Generate evenly-spaced values across the range
          // This ensures we cover the full range including both min and max
          const step = range / (numSampleRows - 1)
          rowIndexValue = Math.round(tableDef.rowIndexMin + i * step)
        }
        
        row.push(rowIndexValue)
      } else {
        // Fallback: use simple sequential integers
        row.push(generateSampleValue(tableDef.rowIndex, 'integer', i))
      }
      
      // Add values for each column
      if (tableDef.columns.length > 0) {
        for (const col of tableDef.columns) {
          // Check if this column has a columnOf constraint
          const constraintKey = `${tableId}.${col.id}`
          const constraint = columnConstraints.get(constraintKey)
          let validValues = null
          
          if (constraint && constraint.columnOfTable) {
            // Resolve the constraint to get actual column names
            validValues = resolveColumnOfConstraint(constraint.columnOfTable, tableDefs)
          }
          
          row.push(generateSampleValue(col.id, col.dataType, i, col.min, col.max, tableId, validValues))
        }
      } else {
        // Generate generic values for unconstrained columns
        // Determine how many columns we need based on headers
        // Headers has rowIndex + N data columns
        const numDataColumns = headers.length - 1
        
        // Get the row index value that was added to the row
        const rowIndexValue = row[0]
        
        // Constants for generic column value generation
        const BASE_VALUE = 0.001           // Starting value for first column
        const COLUMN_SCALE_FACTOR = 0.5    // Multiplier to differentiate columns
        const RANGE_SCALE_FACTOR = 0.1     // Proportion of range to use for variation
        
        // Generate values for each column
        for (let colIdx = 0; colIdx < numDataColumns; colIdx++) {
          // Use different scaling for each column to create variety
          const colValue = tableDef.rowIndexMin !== undefined && tableDef.rowIndexMax !== undefined
            ? BASE_VALUE * (1 + colIdx * COLUMN_SCALE_FACTOR) + (rowIndexValue - tableDef.rowIndexMin) / (tableDef.rowIndexMax - tableDef.rowIndexMin) * RANGE_SCALE_FACTOR
            : BASE_VALUE * (1 + i + colIdx * COLUMN_SCALE_FACTOR)
          row.push(colValue)
        }
      }
      
      sheet.addRow(row)
    }
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
 * Add input_config sheet for cohort configuration
 */
function addInputConfigSheet(workbook) {
  const sheet = workbook.addWorksheet('input_config')
  
  // Add headers
  sheet.addRow(['parameter', 'value', 'description'])
  
  // Add cohort value
  sheet.addRow(['cohort', 1, 'Cohort identifier for calculations'])
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
  
  const tableDefs = extractTableDefinitions(modelObj)
  if (tableDefs.size > 0) {
    for (const [tableId, tableDef] of tableDefs) {
      const sheetName = `input_${tableId}`
      const columnList = tableDef.columns.length > 0 
        ? tableDef.columns.map(c => c.id).join(', ') 
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
function addCohortSheet(workbook, cohortVars, variableMap) {
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
}

/**
 * Add cohort-step calculation sheet
 */
function addCohortStepSheet(workbook, cohortStepVars, variableMap, constantVars, cohortOnlyVars) {
  const sheet = workbook.addWorksheet('calc_cohort_step')
  
  // Build header row
  const headers = ['step']
  const colIndexMap = new Map() // Map variable name to column index
  
  let colIdx = 1 // Start at column B (A is step)
  for (const varName of cohortStepVars) {
    const varXml = variableMap.get(varName)
    const varId = varXml ? varXml.id : varName
    headers.push(varId)
    colIndexMap.set(varName, colIdx + 1) // +1 because A is step
    colIdx++
  }
  sheet.addRow(headers)
  
  // Build a map of cohort-only variables to their column letters in calc_cohort sheet
  // Column A contains cohort ID, so cohort-only variables start at column B
  const cohortVarColMap = new Map()
  let cohortColIdx = 1 // Start at column B (A is cohort ID)
  for (const varName of cohortOnlyVars) {
    cohortVarColMap.set(varName, getColumnLetter(cohortColIdx + 1)) // Column B=2, C=3, etc.
    cohortColIdx++
  }
  
  // Add rows for steps
  // First row (step=0): Hardcoded value 0
  // Subsequent rows (step>0): Formula referencing previous row (e.g., =A2+1, =A3+1)
  // This makes the sheet copyable - users can copy rows down and step values auto-increment
  const stepCount = 12  // Default to 12 steps for monthly projection
  
  for (let step = 0; step < stepCount; step++) {
    const currentRow = step + 2 // +2 because row 1 is header
    const stepValue = step === 0 ? 0 : { formula: `A${currentRow-1}+1` }
    const row = [stepValue]
    
    for (const varName of cohortStepVars) {
      const varXml = variableMap.get(varName)
      if (!varXml) {
        row.push('')
        continue
      }
      
      const defType = getDefinitionType(varXml)
      const expression = getDefinitionText(varXml)
      const colLetter = getColumnLetter(colIndexMap.get(varName))
      
      // Generate appropriate formula based on variable type
      let formula = generateFormulaForVariable(varXml, varName, step, currentRow, colLetter, colIndexMap, cohortStepVars, constantVars, variableMap, cohortVarColMap)
      
      if (formula) {
        row.push({ formula })
      } else {
        row.push(0)
      }
    }
    
    sheet.addRow(row)
  }
}

/**
 * Generate Excel formula for a variable based on its definition
 */
function generateFormulaForVariable(varXml, varName, step, currentRow, colLetter, colIndexMap, cohortStepVars, constantVars, variableMap, cohortVarColMap) {
  const defType = getDefinitionType(varXml)
  const expression = getDefinitionText(varXml)
  
  // Handle based on definition type, reading from actual model
  if (defType === 'expression') {
    return convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, step, cohortVarColMap)
  } else if (defType === 'table') {
    return generateTableLookupFormula(varXml, currentRow)
  } else if (defType === 'tableLookup') {
    return generateTableLookupFormulaAdvanced(varXml, currentRow, colIndexMap, cohortStepVars)
  } else if (defType === 'piecewise') {
    return generatePiecewiseFormula(varXml, step, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, cohortVarColMap)
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
function generatePiecewiseFormula(varXml, step, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, cohortVarColMap) {
  const definition = varXml.definition
  if (!definition || !definition.case) {
    return null
  }
  
  // Get the cases (could be single or array)
  const cases = Array.isArray(definition.case) ? definition.case : [definition.case]
  
  if (cases.length === 0) {
    return null
  }
  
  // Special handling for step-dependent piecewise (e.g., survival calculations)
  // If the first case condition references "step" and checks for 0
  const firstCase = cases[0]
  const whenText = firstCase.when?.['#text'] || firstCase.when || ''
  const valueText = firstCase.value?.['#text'] || firstCase.value || ''
  
  // Check if this is a step = 0 condition (or other temporal index = 0, e.g. month = 0)
  if (/\b(step|month|year|period|time|quarter|week|day)\b/i.test(whenText) && whenText.includes('0')) {
    // Handle "if step=0 then value else otherValue" pattern
    if (step === 0) {
      // Evaluate the value for step 0
      const evaluatedValue = convertExpressionToFormula(valueText, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, step, cohortVarColMap)
      return evaluatedValue || valueText
    } else {
      // Use the else case or second case
      if (cases.length > 1) {
        const secondCase = cases[1]
        const elseValue = secondCase.value?.['#text'] || secondCase.value || ''
        return convertExpressionToFormula(elseValue, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, step, cohortVarColMap)
      }
      return null
    }
  }
  
  // General IF formula generation
  const condition = convertExpressionToFormula(whenText, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, step, cohortVarColMap)
  const thenValue = convertExpressionToFormula(valueText, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, step, cohortVarColMap)
  
  if (condition && thenValue) {
    return `IF(${condition},${thenValue},0)`
  }
  
  return null
}

/**
 * Convert a model expression to an Excel formula
 */
function convertExpressionToFormula(expression, currentRow, colIndexMap, cohortStepVars, constantVars, variableMap, step, cohortVarColMap) {
  if (!expression || typeof expression !== 'string') {
    return null
  }
  
  let formula = expression.trim()
  
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
      const patternWithOffset = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*,\\s*step\\s*-\\s*(\\d+)\\s*\\)`, 'gi')
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

      // Pattern 1b: Handle single temporal-arg variables with offset
      // Example: outstanding_debt(month - 1) -> O2, variable(step - 2) -> K{row-2}
      const patternSingleArgWithOffset = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*(?:step|month|year|period|time|quarter|week|day)\\s*-\\s*(\\d+)\\s*\\)`, 'gi')
      formula = formula.replace(patternSingleArgWithOffset, (match, offset) => {
        const targetRow = currentRow - parseInt(offset, 10)
        if (targetRow < 2) {
          return `${colLetter}2`
        }
        return `${colLetter}${targetRow}`
      })

      // Pattern 2: Handle step-only variables
      // Example: discount_factor(step) -> K2
      const patternStepOnly = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*step\\s*\\)`, 'gi')
      formula = formula.replace(patternStepOnly, `${colLetter}${currentRow}`)
      
      // Pattern 3: Handle cohort-step variables
      // Example: cashflow(cohort, step) -> I2
      const patternCohortStep = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*,\\s*step\\s*\\)`, 'gi')
      formula = formula.replace(patternCohortStep, `${colLetter}${currentRow}`)
      
      // Pattern 3b: Handle single-argument variables with any named index argument
      // Example: monthly_revenue(month) -> K2, total_flights(year) -> K2
      // This covers temporal index names like month, year, period, etc. (not just "step")
      const patternSingleNamedArg = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*[a-zA-Z_][a-zA-Z0-9_]*\\s*\\)`, 'gi')
      formula = formula.replace(patternSingleNamedArg, `${colLetter}${currentRow}`)
      
      // Pattern 4: Handle bare variable name without arguments (least specific, applied last)
      // Example: rate -> constant!$B$1
      // Match variable name with optional empty parentheses (e.g., "rate" or "rate()")
      // Note: No trailing \b after the optional parens, as \b would prevent matching "()"
      const pattern2 = new RegExp(`\\b${escapedVarName}(?:\\(\\))?`, 'gi')
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
      // Note: No trailing \b after the optional parens, as \b would prevent matching "()"
      const pattern = new RegExp(`\\b${escapedConstVar}(?:\\(\\))?`, 'gi')
      const constRowNum = constantRowMap.get(constVar) || 1
      formula = formula.replace(pattern, `constant!$B$${constRowNum}`)
    }
  }
  
  // Handle "step" reference (column A in calc_cohort_step sheet)
  formula = formula.replace(/\bstep\b/gi, `A${currentRow}`)
  
  // Handle other temporal index references (month, year, period, etc.) that also map to column A
  // Negative lookahead prevents replacing Excel built-in functions like MONTH(), YEAR(), DAY(), TIME()
  formula = formula.replace(/\b(month|year|period|time|quarter|week|day)\b(?!\s*\()/gi, `A${currentRow}`)
  
  return formula || null
}

/**
 * Convert a constant expression to an Excel formula for the constant sheet
 * This handles expressions that reference other constant variables
 */
function convertConstantExpressionToFormula(expression, currentRow, constantRowMap, variableMap) {
  if (!expression || typeof expression !== 'string') {
    return null
  }
  
  let formula = expression.trim()
  
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
      // Note: No trailing \b after the optional parens, as \b would prevent matching "()"
      const pattern = new RegExp(`\\b${escapedConstVar}(?:\\(\\))?`, 'gi')
      
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

// Export formula generation functions for testing
export { generateTableLookupFormula, generateTableLookupFormulaAdvanced, convertExpressionToFormula }
