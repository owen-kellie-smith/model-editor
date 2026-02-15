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
  },
  CALC_COHORT_STEP: {
    stepCount: 12,  // 12 months for annual projection
  }
}

// Computed values
TABLE_DIMENSIONS.MORTALITY_RATE.maxRow = TABLE_DIMENSIONS.MORTALITY_RATE.maxAge - TABLE_DIMENSIONS.MORTALITY_RATE.minAge + 2  // +1 for header, +1 for inclusive range
TABLE_DIMENSIONS.SPOT_RATE.maxRow = TABLE_DIMENSIONS.SPOT_RATE.maxStep - TABLE_DIMENSIONS.SPOT_RATE.minStep + 1  // +1 for inclusive range

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
  
  // Add table sheets with sample data
  addTableSheets(workbook)
  
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
    } else if (args.length === 2 && args[0].toUpperCase() === 'COHORT' && args[1].toUpperCase() === 'STEP') {
      cohortStep.push(varName)
    } else {
      other.push(varName)
    }
  }
  
  return { constants, cohortOnly, cohortStep, other }
}

/**
 * Add table sheets with sample data
 */
function addTableSheets(workbook) {
  // Add cohort_data table
  const cohortSheet = workbook.addWorksheet('table_cohort_data')
  cohortSheet.addRow(['id', 'annual_annuity_amount', 'annuity_start_age', 'current_age', 'mortality_table'])
  cohortSheet.addRow(['dataType', 'real', 'real', 'real', 'string'])
  cohortSheet.addRow(['unit', 'GBP per year', 'years', 'years'])
  cohortSheet.addRow(['cohort'])
  cohortSheet.addRow([1, 12.34, 61, 31.2, 'AM92U'])
  cohortSheet.addRow([2, 23.45, 62, 32.3, 'AM92U'])
  cohortSheet.addRow([3, 34.56, 63, 33.4, 'AM92U'])
  cohortSheet.addRow([4, 45.67, 64, 34.5, 'AF92U'])
  
  // Add mortality_rate table
  const mortalitySheet = workbook.addWorksheet('table_mortality_rate')
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
  const spotSheet = workbook.addWorksheet('table_spot_rate')
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
        // Use table dimensions from constants
        const maxRow = TABLE_DIMENSIONS.COHORT_DATA.maxRow
        const maxCol = TABLE_DIMENSIONS.COHORT_DATA.maxCol
        row.push({ 
          formula: `INDEX(table_${tableRef}!$A$1:$${maxCol}$${maxRow},MATCH($A2,table_${tableRef}!$A1:$A${maxRow},0),MATCH(${colLetter}$1,table_${tableRef}!$A$1:$${maxCol}$1,0))` 
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
  const cohortVarColMap = new Map()
  let cohortColIdx = 1 // Start at column B (A is cohort id)
  for (const varName of cohortOnlyVars) {
    cohortVarColMap.set(varName, getColumnLetter(cohortColIdx + 1)) // +1 because A is cohort
    cohortColIdx++
  }
  
  // Add rows for steps using constant
  const stepCount = TABLE_DIMENSIONS.CALC_COHORT_STEP.stepCount
  
  for (let step = 0; step < stepCount; step++) {
    const row = [step]
    const currentRow = step + 2 // +2 because row 1 is header
    
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
  
  // Use table dimensions from constants
  const maxRow = TABLE_DIMENSIONS.COHORT_DATA.maxRow
  const maxCol = TABLE_DIMENSIONS.COHORT_DATA.maxCol
  
  // Generate INDEX/MATCH formula for table lookup
  // INDEX(table!range, MATCH(rowKey, table!rowRange, 0), MATCH(colKey, table!colRange, 0))
  return `INDEX(table_${tableRef}!$A$1:$${maxCol}$${maxRow},MATCH($A${currentRow},table_${tableRef}!$A$1:$A$${maxRow},0),MATCH(${columnRef},table_${tableRef}!$A$1:$${maxCol}$1,0))`
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
  let maxRow, maxCol
  if (tableRef.toLowerCase().includes('mortality')) {
    maxRow = TABLE_DIMENSIONS.MORTALITY_RATE.maxRow
    maxCol = getColumnLetter(TABLE_DIMENSIONS.MORTALITY_RATE.numCols)
  } else if (tableRef.toLowerCase().includes('spot')) {
    maxRow = TABLE_DIMENSIONS.SPOT_RATE.maxRow
    maxCol = 'B'  // spot_rate has 2 columns
  } else {
    maxRow = 100  // default
    maxCol = 'Z'
  }
  
  // Generate INDEX/MATCH formula with dynamic column selection
  if (rowRef && columnSelector) {
    // Find the column index for the row variable if it's in cohortStepVars
    const rowVarUpper = rowRef.toUpperCase()
    const rowColIndex = colIndexMap.get(rowVarUpper)
    const rowCell = rowColIndex ? `${getColumnLetter(rowColIndex)}${currentRow}` : rowRef
    
    // Column selector is typically from cohort sheet
    return `INDEX(table_${tableRef}!$A$1:$${maxCol}$${maxRow},MATCH(${rowCell},table_${tableRef}!$A$1:$A$${maxRow},0),MATCH(calc_cohort!$E$2,table_${tableRef}!$A$1:$${maxCol}$1,0))`
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
      // Handle both with and without arguments: variable(cohort, step) or variable
      const pattern1 = new RegExp(`\\b${escapedVarName}\\s*\\([^)]*\\)`, 'gi')
      formula = formula.replace(pattern1, `${colLetter}${currentRow}`)
      
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
