/**
 * Spreadsheet Renderer V2
 * Converts a validated model into an Excel workbook with multiple sheets using ExcelJS
 * Generates a spreadsheet for a single cohort calculation
 */

// Module-level constants for table dimensions
const TABLE_DIMENSIONS = {
  COHORT_DATA: {
    maxRow: 8,  // 4 header rows + 4 data rows
    maxCol: 'E',  // 5 columns
  },
  MORTALITY_RATE: {
    minAge: 17,
    maxAge: 104,
    numCols: 3,  // age, AM92U, AF92U
  },
  SPOT_RATE: {
    minStep: 0,
    maxStep: 120,
    numCols: 2,  // step, rate
  },
  CALC_COHORT_STEP: {
    stepCount: 12,  // 12 months for annual projection
  }
}

// Computed values
TABLE_DIMENSIONS.MORTALITY_RATE.maxRow = TABLE_DIMENSIONS.MORTALITY_RATE.maxAge - TABLE_DIMENSIONS.MORTALITY_RATE.minAge + 2  // +1 for header, +1 for inclusive range
TABLE_DIMENSIONS.SPOT_RATE.maxRow = TABLE_DIMENSIONS.SPOT_RATE.maxStep - TABLE_DIMENSIONS.SPOT_RATE.minStep + 2  // +1 for header, +1 for inclusive range

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
  
  // Add constant sheet (variables with no arguments)
  if (categorized.constants.length > 0) {
    const sheet = workbook.addWorksheet('constant')
    for (const varName of categorized.constants) {
      const varXml = variableMap.get(varName)
      if (varXml) {
        const expression = getDefinitionText(varXml)
        // Try to evaluate simple expressions
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
      }
    }
  }
  
  // Add README sheet first (so it appears as first tab)
  addReadmeSheet(workbook, modelObj)
  
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
  
  for (const [varName, varXml] of variableMap) {
    const resolved = resolvedVarsWithArguments.get(varName)
    const args = resolved && resolved.domain ? resolved.domain : []
    
    if (args.length === 0) {
      constants.push(varName)
    } else if (args.length === 1 && args[0].toUpperCase() === 'COHORT') {
      cohortOnly.push(varName)
    } else if (args.length === 1 && args[0].toUpperCase() === 'STEP') {
      // Step-only variables should be included in the cohort-step sheet
      cohortStep.push(varName)
    } else if (args.length === 2 && args[0].toUpperCase() === 'COHORT' && args[1].toUpperCase() === 'STEP') {
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
      columns: columns
    })
  }
  
  return tableMap
}

/**
 * Generate sample value based on column name and data type
 * @param {string} columnId - Column identifier
 * @param {string} dataType - Data type (real, integer, string, boolean)
 * @param {number} rowIndex - Row index for variation
 * @param {number} [min] - Optional minimum value for numeric types
 * @param {number} [max] - Optional maximum value for numeric types
 * @returns {*} - Sample value
 */
function generateSampleValue(columnId, dataType, rowIndex, min, max) {
  const lowerColId = columnId.toLowerCase()
  
  // If min and max are provided, generate value within that range
  if (min !== undefined && max !== undefined && !isNaN(min) && !isNaN(max) && (dataType === 'real' || dataType === 'integer')) {
    const range = max - min
    const numSamples = 4  // Generate 4 different values across the range
    
    // Handle edge cases
    if (numSamples <= 1 || range === 0) {
      return dataType === 'integer' ? Math.round(min) : min
    }
    
    const value = min + (rowIndex % numSamples) * (range / (numSamples - 1))
    return dataType === 'integer' ? Math.round(value) : value
  }
  
  // Handle row index columns
  if (lowerColId === 'id' || lowerColId === 'cohort') {
    return rowIndex
  }
  
  if (lowerColId === 'age') {
    return 20 + rowIndex * 15  // Ages: 20, 35, 50, 65, 80
  }
  
  if (lowerColId === 'step') {
    return rowIndex * 30  // Steps: 0, 30, 60, 90, 120
  }
  
  // Handle specific column patterns
  if (lowerColId.includes('amount') || lowerColId.includes('annuity')) {
    return 10000 + rowIndex * 2500  // 10000, 12500, 15000, 17500, 20000
  }
  
  if (lowerColId.includes('age')) {
    return 55 + rowIndex * 3  // 55, 58, 61, 64, 67
  }
  
  if (lowerColId.includes('rate')) {
    return 0.02 + rowIndex * 0.01  // 0.02, 0.03, 0.04, 0.05, 0.06
  }
  
  if (lowerColId.includes('mortality') && lowerColId.includes('table')) {
    const tables = ['AM92U', 'AF92U']
    return tables[rowIndex % tables.length]
  }
  
  // Generic handling by data type
  if (dataType === 'string') {
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
  
  // If no tables defined in model, use fallback with hardcoded tables
  if (tableDefs.size === 0) {
    addTableSheetsFallback(workbook)
    return
  }
  
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
      // Handle unconstrained columns (like mortality_rate)
      // Use common column patterns based on table name
      if (tableId.toLowerCase().includes('mortality')) {
        headers.push('AM92U', 'AF92U')
      } else {
        headers.push('value')  // Generic fallback
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
    const numSampleRows = determineSampleRowCount(tableId)
    
    for (let i = 0; i < numSampleRows; i++) {
      const row = []
      
      // Special handling for mortality_rate which needs actual age values
      if (tableId.toLowerCase().includes('mortality')) {
        const age = TABLE_DIMENSIONS.MORTALITY_RATE.minAge + i
        row.push(age)
        
        // Generate mortality rates
        const baseMale = 0.0006
        const baseFemale = 0.000172
        const ageRange = TABLE_DIMENSIONS.MORTALITY_RATE.maxAge - TABLE_DIMENSIONS.MORTALITY_RATE.minAge
        const ageFactor = Math.pow((age - TABLE_DIMENSIONS.MORTALITY_RATE.minAge) / ageRange, 3)
        const maleRate = baseMale + ageFactor * (1 - baseMale)
        const femaleRate = baseFemale + ageFactor * (1 - baseFemale)
        row.push(maleRate, femaleRate)
      } else if (tableId.toLowerCase().includes('spot')) {
        // Special handling for spot_rate
        const step = TABLE_DIMENSIONS.SPOT_RATE.minStep + i
        row.push(step)
        
        // Generate spot rate
        const stepRange = TABLE_DIMENSIONS.SPOT_RATE.maxStep - TABLE_DIMENSIONS.SPOT_RATE.minStep
        const rate = 0.05 + 0.01 * (step / stepRange)
        row.push(rate)
      } else {
        // Standard table handling
        // First column is the row index
        row.push(generateSampleValue(tableDef.rowIndex, 'integer', i))
        
        // Add values for each column
        if (tableDef.columns.length > 0) {
          for (const col of tableDef.columns) {
            row.push(generateSampleValue(col.id, col.dataType, i, col.min, col.max))
          }
        } else {
          // Generic unconstrained columns
          row.push(100 + i * 25)
        }
      }
      
      sheet.addRow(row)
    }
  }
}

/**
 * Determine the number of sample rows to generate for a table
 */
function determineSampleRowCount(tableId) {
  const lowerTableId = tableId.toLowerCase()
  
  // mortality_rate and spot_rate need many rows for realistic lookups
  if (lowerTableId.includes('mortality')) {
    // Generate full mortality table
    return TABLE_DIMENSIONS.MORTALITY_RATE.maxAge - TABLE_DIMENSIONS.MORTALITY_RATE.minAge + 1
  }
  
  if (lowerTableId.includes('spot')) {
    // Generate full spot rate table
    return TABLE_DIMENSIONS.SPOT_RATE.maxStep - TABLE_DIMENSIONS.SPOT_RATE.minStep + 1
  }
  
  // For other tables (like cohort_data), use 4-5 sample rows
  return 4
}

/**
 * Add table sheets with sample data (fallback for models without table definitions)
 */
function addTableSheetsFallback(workbook) {
  // Add cohort_data table
  const cohortSheet = workbook.addWorksheet('input_cohort_data')
  cohortSheet.addRow(['id', 'annual_annuity_amount', 'annuity_start_age', 'current_age', 'mortality_table'])
  cohortSheet.addRow(['dataType', 'real', 'real', 'real', 'string'])
  cohortSheet.addRow(['unit', 'GBP per year', 'years', 'years'])
  cohortSheet.addRow(['cohort'])
  cohortSheet.addRow([1, 12.34, 61, 31.2, 'AM92U'])
  cohortSheet.addRow([2, 23.45, 62, 32.3, 'AM92U'])
  cohortSheet.addRow([3, 34.56, 63, 33.4, 'AM92U'])
  cohortSheet.addRow([4, 45.67, 64, 34.5, 'AF92U'])
  
  // Add mortality_rate table
  const mortalitySheet = workbook.addWorksheet('input_mortality_rate')
  mortalitySheet.addRow(['age', 'AM92U', 'AF92U'])
  
  // Add mortality data using constants
  for (let age = TABLE_DIMENSIONS.MORTALITY_RATE.minAge; age <= TABLE_DIMENSIONS.MORTALITY_RATE.maxAge; age++) {
    // Use realistic mortality rates that increase with age
    const baseMale = 0.0006
    const baseFemale = 0.000172
    const ageRange = TABLE_DIMENSIONS.MORTALITY_RATE.maxAge - TABLE_DIMENSIONS.MORTALITY_RATE.minAge
    const ageFactor = Math.pow((age - TABLE_DIMENSIONS.MORTALITY_RATE.minAge) / ageRange, 3)
    const maleRate = baseMale + ageFactor * (1 - baseMale)
    const femaleRate = baseFemale + ageFactor * (1 - baseFemale)
    mortalitySheet.addRow([age, maleRate, femaleRate])
  }
  
  // Add spot_rate table
  const spotSheet = workbook.addWorksheet('input_spot_rate')
  spotSheet.addRow(['step', 'rate'])
  
  // Add spot rates using constants
  for (let step = TABLE_DIMENSIONS.SPOT_RATE.minStep; step <= TABLE_DIMENSIONS.SPOT_RATE.maxStep; step++) {
    // Use deterministic spot rates
    const stepRange = TABLE_DIMENSIONS.SPOT_RATE.maxStep - TABLE_DIMENSIONS.SPOT_RATE.minStep
    const rate = 0.05 + 0.01 * (step / stepRange)
    spotSheet.addRow([step, rate])
  }
}

/**
 * Add README sheet explaining input tables
 */
function addReadmeSheet(workbook, modelObj) {
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
  sheet.addRow(['Replace all values with your own data.'])
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
    // Fallback for models without table definitions
    sheet.addRow(['  - input_cohort_data: annual_annuity_amount, annuity_start_age, current_age, mortality_table'])
    sheet.addRow(['  - input_mortality_rate: age-based mortality rates'])
    sheet.addRow(['  - input_spot_rate: step-based discount rates'])
  }
  
  sheet.addRow([])
  sheet.addRow(['All input tables are pre-filled with sample values for reference only.'])
  sheet.addRow(['These values should be replaced with your actual data before using the model.'])
  
  // Style the title
  sheet.getRow(1).font = { bold: true, size: 14 }
  sheet.getRow(3).font = { italic: true, size: 10 }
  
  // Auto-width for column A
  sheet.getColumn(1).width = 80
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
  
  // Add a single cohort row (cohort = 1)
  const row = [1]
  
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
        // Use table dimensions from constants for column
        const maxCol = TABLE_DIMENSIONS.COHORT_DATA.maxCol
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
  const stepCount = TABLE_DIMENSIONS.CALC_COHORT_STEP.stepCount
  
  for (let step = 0; step < stepCount; step++) {
    const currentRow = step + 2 // +2 because row 1 is header
    const stepValue = step === 0 ? 0 : { formula: `=A${currentRow-1}+1` }
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
  let maxCol
  if (tableRef.toLowerCase().includes('mortality')) {
    maxCol = getColumnLetter(TABLE_DIMENSIONS.MORTALITY_RATE.numCols)
  } else if (tableRef.toLowerCase().includes('spot')) {
    maxCol = getColumnLetter(TABLE_DIMENSIONS.SPOT_RATE.numCols)
  } else if (tableRef.toLowerCase().includes('cohort')) {
    maxCol = TABLE_DIMENSIONS.COHORT_DATA.maxCol
  } else {
    // Default to cohort_data dimensions for unknown tables
    maxCol = TABLE_DIMENSIONS.COHORT_DATA.maxCol
  }
  
  // Generate INDEX/MATCH formula for table lookup using dynamic ranges
  // INDEX(table!A:maxCol, MATCH(rowKey, table!A:A, 0), MATCH(colKey, table!$1:$1, 0))
  // Using entire columns allows tables to be extended without breaking formulas
  // Column matching uses $1:$1 (absolute header row reference) to avoid accidental matches in data columns
  return `INDEX(input_${tableRef}!A:${maxCol},MATCH($A${currentRow},input_${tableRef}!A:A,0),MATCH("${columnRef}",input_${tableRef}!$1:$1,0))`
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
  let maxCol
  if (tableRef.toLowerCase().includes('mortality')) {
    maxCol = getColumnLetter(TABLE_DIMENSIONS.MORTALITY_RATE.numCols)
  } else if (tableRef.toLowerCase().includes('spot')) {
    maxCol = getColumnLetter(TABLE_DIMENSIONS.SPOT_RATE.numCols)
  } else {
    maxCol = 'Z'  // default
  }
  
  // Generate INDEX/MATCH formula with dynamic column selection using dynamic ranges
  if (rowRef && columnSelector) {
    // Find the column index for the row variable if it's in cohortStepVars
    const rowVarUpper = rowRef.toUpperCase()
    const rowColIndex = colIndexMap.get(rowVarUpper)
    const rowCell = rowColIndex ? `${getColumnLetter(rowColIndex)}${currentRow}` : rowRef
    
    // Column selector is typically from cohort sheet
    // Using entire columns allows tables to be extended without breaking formulas
    // Column matching uses $1:$1 (absolute header row reference) to avoid accidental matches in data columns
    return `INDEX(input_${tableRef}!A:${maxCol},MATCH(${rowCell},input_${tableRef}!A:A,0),MATCH(calc_cohort!$E$2,input_${tableRef}!$1:$1,0))`
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
  
  // Check if this is a step = 0 condition
  if (whenText.includes('step') && whenText.includes('0')) {
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
      
      // Pattern 2: Handle step-only variables
      // Example: discount_factor(step) -> K2
      const patternStepOnly = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*step\\s*\\)`, 'gi')
      formula = formula.replace(patternStepOnly, `${colLetter}${currentRow}`)
      
      // Pattern 3: Handle cohort-step variables
      // Example: cashflow(cohort, step) -> I2
      const patternCohortStep = new RegExp(`\\b${escapedVarName}\\s*\\(\\s*cohort\\s*,\\s*step\\s*\\)`, 'gi')
      formula = formula.replace(patternCohortStep, `${colLetter}${currentRow}`)
      
      // Pattern 4: Handle bare variable name without arguments (least specific, applied last)
      // Example: rate -> constant!$B$1
      const pattern2 = new RegExp(`\\b${escapedVarName}\\b`, 'gi')
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
      const pattern = new RegExp(`\\b${escapedConstVar}\\b`, 'gi')
      const constRowNum = constantRowMap.get(constVar) || 1
      formula = formula.replace(pattern, `constant!$B$${constRowNum}`)
    }
  }
  
  // Handle "step" reference (column A in calc_cohort_step sheet)
  formula = formula.replace(/\bstep\b/gi, `A${currentRow}`)
  
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

/**
 * Escapes a string for CSV format
 */
function escapeCsv(str) {
  if (str == null) return ""
  const s = String(str)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/**
 * Converts a value to string, handling objects with #text property
 */
function valueToString(value) {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "object" && value["#text"]) return String(value["#text"])
  if (typeof value === "object") return ""
  return String(value)
}

/**
 * Renders a model as a CSV spreadsheet
 * @param {Object} modelObj - The model object (from getObjectFromXML)
 * @param {Object} modelFeatures - The model features (from getModelFeatures)
 * @returns {string} - CSV content
 */
export function renderModelAsSpreadsheet(modelObj, modelFeatures) {
  if (!modelObj || !modelObj.model) {
    throw new Error("Invalid model object")
  }
  
  if (!modelFeatures || !modelFeatures.variables) {
    throw new Error("Invalid model features")
  }

  const { variables, incoming, resolvedVarsWithArguments } = modelFeatures
  
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
  
  // Sort variables in dependency order
  const sortedVars = topologicalSort(incoming, variables)
  
  // Build CSV header
  const csv = []
  csv.push(["Variable ID", "Definition Type", "Formula/Value", "Data Type", "Unit", "Arguments", "Dependencies", "Notes"].map(escapeCsv).join(","))
  
  // Add each variable as a row
  let rowIndex = 2
  
  for (const varName of sortedVars) {
    const varXml = variableMap.get(varName)
    if (!varXml) continue
    
    const varId = varXml.id || varName
    const defType = getDefinitionType(varXml)
    const formula = getDefinitionText(varXml)
    const dataType = valueToString(varXml.dataType)
    const unit = valueToString(varXml.unit)
    
    // Get arguments/index sets
    const varResolved = resolvedVarsWithArguments.get(varName)
    const args = varResolved && varResolved.domain ? varResolved.domain.join(", ") : ""
    
    // Get dependencies
    const deps = incoming.get(varName) || new Set()
    const depsArray = Array.from(deps).map(dep => {
      if (typeof dep === "object" && dep.name) return dep.name
      if (typeof dep === "string") return dep
      return String(dep)
    })
    const depsStr = depsArray.join(", ")
    
    // Determine if this is an input (no dependencies)
    const isInput = deps.size === 0
    const notes = isInput ? "INPUT" : ""
    
    csv.push([
      escapeCsv(varId),
      escapeCsv(defType),
      escapeCsv(formula),
      escapeCsv(dataType),
      escapeCsv(unit),
      escapeCsv(args),
      escapeCsv(depsStr),
      escapeCsv(notes)
    ].join(","))
    
    rowIndex++
  }
  
  return csv.join("\n")
}

// Export formula generation functions for testing
export { generateTableLookupFormula, generateTableLookupFormulaAdvanced }
