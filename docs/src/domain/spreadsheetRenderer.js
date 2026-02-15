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
      visit(depName)
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
 * Renders a model as an Excel workbook (XML format) with working formulas
 * @param {Object} modelObj - The model object (from getObjectFromXML)
 * @param {Object} modelFeatures - The model features (from getModelFeatures)
 * @returns {Promise<Blob>} - Excel XML file blob
 */
export async function renderModelAsExcel(modelObj, modelFeatures) {
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
  
  // Map variable names to cell references (column B is where values go)
  const varToCell = new Map()
  let rowIndex = 2 // Start from row 2 (row 1 is header)
  
  // First pass: assign row numbers to all variables
  for (const varName of sortedVars) {
    varToCell.set(varName, `B${rowIndex}`)
    rowIndex++
  }
  
  // Build Excel XML
  let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Model">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Variable</Data></Cell>
    <Cell><Data ss:Type="String">Value/Formula</Data></Cell>
    <Cell><Data ss:Type="String">Type</Data></Cell>
    <Cell><Data ss:Type="String">Unit</Data></Cell>
    <Cell><Data ss:Type="String">Notes</Data></Cell>
   </Row>
`
  
  // Second pass: populate rows with data and formulas
  rowIndex = 2
  for (const varName of sortedVars) {
    const varXml = variableMap.get(varName)
    if (!varXml) continue
    
    const varId = varXml.id || varName
    const defType = getDefinitionType(varXml)
    const expression = getDefinitionText(varXml)
    const unit = valueToString(varXml.unit)
    
    const deps = incoming.get(varName) || new Set()
    const isInput = deps.size === 0
    
    xml += `   <Row>\n`
    xml += `    <Cell><Data ss:Type="String">${escapeXml(varId)}</Data></Cell>\n`
    
    // Value or formula cell
    if (defType === 'constant' || isInput) {
      // For constants, just put the value
      const numValue = parseFloat(expression)
      if (!isNaN(numValue)) {
        xml += `    <Cell><Data ss:Type="Number">${numValue}</Data></Cell>\n`
      } else {
        xml += `    <Cell><Data ss:Type="String">${escapeXml(expression)}</Data></Cell>\n`
      }
    } else if (defType === 'expression') {
      // For expressions, convert to Excel formula
      const excelFormula = convertToExcelFormula(expression, varToCell)
      xml += `    <Cell ss:Formula="=${escapeXml(excelFormula)}"><Data ss:Type="Number">0</Data></Cell>\n`
    } else {
      // For other types, just put the expression as text
      xml += `    <Cell><Data ss:Type="String">${escapeXml(expression || `[${defType}]`)}</Data></Cell>\n`
    }
    
    xml += `    <Cell><Data ss:Type="String">${escapeXml(defType)}</Data></Cell>\n`
    xml += `    <Cell><Data ss:Type="String">${escapeXml(unit)}</Data></Cell>\n`
    xml += `    <Cell><Data ss:Type="String">${isInput ? 'INPUT' : ''}</Data></Cell>\n`
    xml += `   </Row>\n`
    
    rowIndex++
  }
  
  xml += `  </Table>
 </Worksheet>
</Workbook>`
  
  // Create blob
  const blob = new Blob([xml], { 
    type: "application/vnd.ms-excel"
  })
  
  return blob
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
