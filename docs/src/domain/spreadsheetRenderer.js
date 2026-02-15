/**
 * Spreadsheet Renderer
 * Converts a validated model into a CSV format that can be opened in Excel or other spreadsheet applications
 */

/**
 * Topologically sorts variables based on their dependencies
 * @param {Map} incoming - Map of variable name to Set of dependency objects {name, shift}
 * @param {Array} variableNames - Array of all variable names
 * @returns {Array} - Array of variable names in dependency order
 * @throws {Error} if circular dependencies exist (should be caught earlier)
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
      // dep might be an object with name property or just a string
      const depName = typeof dep === "object" && dep.name ? dep.name : dep
      // Only follow dependencies with zero shift (same time step)
      // Dependencies with non-zero shifts (e.g., X(t) depends on X(t-1)) are not cycles
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
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeCsv(str) {
  if (str == null) return ""
  const s = String(str)
  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/**
 * Converts a value to string, handling objects with #text property
 * @param {*} value - Value to convert
 * @returns {string} - String representation
 */
function valueToString(value) {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "object" && value["#text"]) return String(value["#text"])
  if (typeof value === "object") return "" // Skip complex objects
  return String(value)
}

/**
 * Gets the definition text from a variable's XML representation
 * @param {Object} varXml - Variable XML object
 * @returns {string} - Definition text
 */
function getDefinitionText(varXml) {
  if (!varXml.definition) return ""
  return varXml.definition["#text"] || ""
}

/**
 * Gets the definition type from a variable's XML representation
 * @param {Object} varXml - Variable XML object
 * @returns {string} - Definition type (expression, constant, etc.)
 */
function getDefinitionType(varXml) {
  if (!varXml.definition) return ""
  return varXml.definition.type || ""
}

/**
 * Converts a model expression to an Excel formula with cell references
 * @param {string} expression - The model expression (e.g., "A + B")
 * @param {Map} varToCell - Map of variable names to cell references (e.g., "A" → "B2")
 * @returns {string} - Excel formula (e.g., "B2+C2")
 */
function convertToExcelFormula(expression, varToCell) {
  if (!expression || !expression.trim()) return ""
  
  // Replace variable names with cell references
  let formula = expression
  
  // Sort variables by length (longest first) to avoid partial matches
  const varNames = Array.from(varToCell.keys()).sort((a, b) => b.length - a.length)
  
  for (const varName of varNames) {
    const cellRef = varToCell.get(varName)
    // Use word boundaries to match whole variable names only
    const regex = new RegExp(`\\b${varName}\\b`, 'gi')
    formula = formula.replace(regex, cellRef)
  }
  
  return formula
}

/**
 * Escapes special XML characters
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeXml(text) {
  if (text == null) return ""
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * Renders a model as an Excel workbook using ExcelJS with multiple sheets
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
    throw new Error("ExcelJS library is not loaded. Please ensure it's included via CDN.")
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
  
  // Parse tables from model
  const tables = parseTablesFromModel(modelObj)
  
  // Categorize variables by their argument structure
  const categorizedVars = categorizeVariables(variableMap, resolvedVarsWithArguments)
  
  // Create workbook
  const workbook = new ExcelJS.Workbook()
  
  // Add constants sheet
  addConstantsSheet(workbook, categorizedVars.constants, variableMap)
  
  // Add table sheets
  for (const [tableName, tableData] of Object.entries(tables)) {
    addTableSheet(workbook, tableName, tableData)
  }
  
  // Add calculation sheets
  if (categorizedVars.cohortOnly.length > 0) {
    addCohortCalculationSheet(workbook, categorizedVars.cohortOnly, variableMap, tables, categorizedVars.constants)
  }
  
  if (categorizedVars.cohortStep.length > 0) {
    addCohortStepCalculationSheet(workbook, categorizedVars.cohortStep, variableMap, tables, categorizedVars.constants, categorizedVars.cohortOnly)
  }
  
  // Generate Excel file
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { 
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  })
  
  return blob
}

/**
 * Parse tables from model definition
 */
function parseTablesFromModel(modelObj) {
  const tables = {}
  
  // Define sample data for cohort_data table
  tables.cohort_data = {
    rowIndex: 'cohort',
    columns: ['id', 'annual_annuity_amount', 'annuity_start_age', 'current_age', 'mortality_table'],
    data: [
      [1, 12.34, 61, 60, 'AM92U'],
      [2, 56.78, 66, 65, 'AF92U'],
    ]
  }
  
  // Define sample data for mortality_rate table (age-based)
  tables.mortality_rate = {
    rowIndex: 'age',
    columns: ['age', 'AM92U', 'AF92U'],
    data: []
  }
  
  // Generate mortality rates for ages 0-120
  for (let age = 0; age <= 120; age++) {
    // Simple mortality formula: increases with age
    const maleRate = Math.min(0.001 + Math.pow(age / 100, 3), 1)
    const femaleRate = Math.min(0.0008 + Math.pow(age / 105, 3), 1)
    tables.mortality_rate.data.push([age, maleRate, femaleRate])
  }
  
  // Define sample data for spot_rate table
  tables.spot_rate = {
    rowIndex: 'step',
    columns: ['step', 'rate'],
    data: []
  }
  
  // Generate spot rates for steps 0-120
  for (let step = 0; step <= 120; step++) {
    // Simple flat rate of 3%
    tables.spot_rate.data.push([step, 0.03])
  }
  
  return tables
}

/**
 * Categorize variables by their argument structure
 */
function categorizeVariables(variableMap, resolvedVarsWithArguments) {
  const constants = []
  const cohortOnly = []
  const stepOnly = []
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
      stepOnly.push(varName)
    } else if (args.length === 2 && args[0].toUpperCase() === 'COHORT' && args[1].toUpperCase() === 'STEP') {
      cohortStep.push(varName)
    } else {
      other.push(varName)
    }
  }
  
  return { constants, cohortOnly, stepOnly, cohortStep, other }
}

/**
 * Add constants sheet
 */
function addConstantsSheet(workbook, constants, variableMap) {
  const sheet = workbook.addWorksheet('constant')
  
  for (const varName of constants) {
    const varXml = variableMap.get(varName)
    if (!varXml) continue
    
    const expression = getDefinitionText(varXml)
    const numValue = parseFloat(expression)
    
    sheet.addRow([varXml.id, !isNaN(numValue) ? numValue : expression])
  }
}

/**
 * Add table sheet
 */
function addTableSheet(workbook, tableName, tableData) {
  const sheet = workbook.addWorksheet(`table_${tableName}`)
  
  // Add header row
  sheet.addRow(tableData.columns)
  
  // Add data rows
  for (const row of tableData.data) {
    sheet.addRow(row)
  }
}

/**
 * Add cohort calculation sheet
 */
function addCohortCalculationSheet(workbook, cohortVars, variableMap, tables, constants) {
  const sheet = workbook.addWorksheet('calc_cohort')
  
  // Build header row with variable names
  const headerRow = ['cohort']
  for (const varName of cohortVars) {
    const varXml = variableMap.get(varName)
    headerRow.push(varXml ? varXml.id : varName)
  }
  sheet.addRow(headerRow)
  
  // Add data rows for each cohort
  const cohortCount = tables.cohort_data ? tables.cohort_data.data.length : 2
  for (let cohortIdx = 0; cohortIdx < cohortCount; cohortIdx++) {
    const cohortId = cohortIdx + 1
    const row = [cohortId]
    
    for (let colIdx = 0; colIdx < cohortVars.length; colIdx++) {
      const varName = cohortVars[colIdx]
      const varXml = variableMap.get(varName)
      if (!varXml) {
        row.push('')
        continue
      }
      
      const defType = getDefinitionType(varXml)
      const expression = getDefinitionText(varXml)
      
      // Generate appropriate formula based on definition type
      if (defType === 'table') {
        // Extract table and column references
        const tableDef = varXml.definition
        const tableRef = tableDef.table?.ref || tableDef.table?.['#text']
        const columnRef = tableDef.column?.ref || tableDef.column?.['#text']
        
        if (tableRef && columnRef) {
          const colLetter = String.fromCharCode(66 + colIdx) // B, C, D, ...
          const currentRow = cohortIdx + 2
          // Use INDEX/MATCH to lookup value from table
          row.push({
            formula: `INDEX(table_${tableRef}!$A$1:$E$8,MATCH($A${currentRow},table_${tableRef}!$A1:$A8,0),MATCH(${colLetter}$1,table_${tableRef}!$A$1:$E$1,0))`
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
}

/**
 * Add cohort-step calculation sheet
 */
function addCohortStepCalculationSheet(workbook, cohortStepVars, variableMap, tables, constants, cohortOnlyVars) {
  const sheet = workbook.addWorksheet('calc_cohort_step')
  
  // Build header row
  const headerRow = ['cohort', 'step']
  for (const varName of cohortStepVars) {
    const varXml = variableMap.get(varName)
    headerRow.push(varXml ? varXml.id : varName)
  }
  sheet.addRow(headerRow)
  
  // Add data rows for each cohort and step combination
  const cohortCount = tables.cohort_data ? tables.cohort_data.data.length : 1
  const stepCount = 12 // 12 months/steps for a single cohort projection
  
  for (let cohortIdx = 0; cohortIdx < cohortCount; cohortIdx++) {
    const cohortId = cohortIdx + 1
    
    for (let step = 0; step < stepCount; step++) {
      const row = [cohortId, step]
      
      for (let colIdx = 0; colIdx < cohortStepVars.length; colIdx++) {
        const varName = cohortStepVars[colIdx]
        const varXml = variableMap.get(varName)
        if (!varXml) {
          row.push('')
          continue
        }
        
        const defType = getDefinitionType(varXml)
        const expression = getDefinitionText(varXml)
        const currentRow = cohortIdx * stepCount + step + 2
        
        // Generate formulas based on variable definitions
        if (defType === 'expression') {
          // Convert expression to Excel formula
          let formula = convertExpressionToExcel(expression, varName, currentRow, cohortStepVars, cohortOnlyVars, constants, variableMap)
          if (formula) {
            row.push({ formula })
          } else {
            row.push(0)
          }
        } else if (defType === 'piecewise') {
          // Handle piecewise (IF statements)
          const formula = convertPiecewiseToExcel(varXml.definition, currentRow, cohortStepVars, cohortOnlyVars, constants, variableMap)
          if (formula) {
            row.push({ formula })
          } else {
            row.push(0)
          }
        } else if (defType === 'tableLookup') {
          // Handle table lookup with INDEX/MATCH
          const formula = convertTableLookupToExcel(varXml.definition, currentRow, cohortStepVars, cohortOnlyVars, constants, variableMap)
          if (formula) {
            row.push({ formula })
          } else {
            row.push(0)
          }
        } else {
          row.push(0)
        }
      }
      
      sheet.addRow(row)
    }
  }
}

/**
 * Convert model expression to Excel formula
 */
function convertExpressionToExcel(expression, varName, currentRow, cohortStepVars, cohortOnlyVars, constants, variableMap) {
  if (!expression) return null
  
  // Simple conversion for basic expressions
  // This is a simplified version - a full implementation would need proper parsing
  let formula = expression
  
  // Replace common operators
  formula = formula.replace(/\^/g, '^')
  formula = formula.replace(/\?/g, ',') // Ternary operator
  formula = formula.replace(/:/g, ',')
  
  // Handle references to constants (from constant sheet)
  for (const constName of constants) {
    const constXml = variableMap.get(constName)
    if (constXml) {
      const regex = new RegExp(`\\b${constXml.id}\\b`, 'gi')
      // Find the constant in the constant sheet and reference it
      formula = formula.replace(regex, `constant!B1`) // Simplified - should lookup actual row
    }
  }
  
  return formula
}

/**
 * Convert piecewise definition to Excel IF formula
 */
function convertPiecewiseToExcel(definition, currentRow, cohortStepVars, cohortOnlyVars, constants, variableMap) {
  // Simplified - return placeholder
  return 'IF($B' + currentRow + '=0,1,0)'
}

/**
 * Convert table lookup to Excel INDEX/MATCH formula
 */
function convertTableLookupToExcel(definition, currentRow, cohortStepVars, cohortOnlyVars, constants, variableMap) {
  // Simplified - return placeholder
  return 'INDEX(table_mortality_rate!$A$1:$C$121,MATCH($A' + currentRow + ',table_mortality_rate!$A$1:$A$121,0),2)'
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
  let rowIndex = 2 // Start from row 2 (row 1 is header)
  const varToRow = new Map()
  
  for (const varName of sortedVars) {
    const varXml = variableMap.get(varName)
    if (!varXml) continue // Skip if not found
    
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
      // Each dep might be an object with name property or just a string
      if (typeof dep === "object" && dep.name) return dep.name
      if (typeof dep === "string") return dep
      return String(dep)
    })
    const depsStr = depsArray.join(", ")
    
    // Determine if this is an input (no dependencies)
    const isInput = deps.size === 0
    const notes = isInput ? "INPUT" : ""
    
    varToRow.set(varName, rowIndex)
    
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
