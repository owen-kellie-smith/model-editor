/**
 * Shared model-rendering utilities.
 *
 * Goal: keep renderer backends (HTML preview, XLSX, Python) consistent without
 * copy/pasting core model-to-rows logic.
 */

import { asArray } from '../utils/helpers.js'

// ------------------------------------------------------------
// Basic model XML helpers
// ------------------------------------------------------------

/** Gets the definition text from a variable's XML representation. */
export function getDefinitionText(varXml) {
  if (!varXml?.definition) return ""
  return varXml.definition["#text"] || ""
}

/** Gets the definition type from a variable's XML representation. */
export function getDefinitionType(varXml) {
  if (!varXml?.definition) return ""
  return varXml.definition.type || ""
}

/**
 * Returns the temporal indexSet id for the model.
 * Prefers <indexSet role="temporal"> (case-insensitive). Falls back to legacy id="step".
 * If still not found, picks the first integer indexSet.
 */
export function getTemporalIndexSetId(modelObj) {
  const indexSets = asArray(modelObj?.model?.indexSets?.indexSet)
  const temporal = indexSets.find(is => String(is?.role ?? "").toLowerCase() === "temporal")
  if (temporal?.id) return temporal.id
  const legacy = indexSets.find(is => String(is?.id ?? "").toLowerCase() === "step")
  if (legacy?.id) return legacy.id
  const firstInt = indexSets.find(is => String(is?.dataType ?? "").toLowerCase() === "integer")
  return firstInt?.id || null
}

/** Extracts the min/max range for the provided temporal index set. Defaults to {min:0,max:11}. */
export function getTemporalRange(modelObj, temporalIndexSetId) {
  const id = temporalIndexSetId ? String(temporalIndexSetId).toLowerCase() : null
  const indexSets = asArray(modelObj?.model?.indexSets?.indexSet)
  if (id) {
    const is = indexSets.find(x => String(x?.id ?? "").toLowerCase() === id)
    if (is) {
      const min = parseInt(is.min, 10)
      const max = parseInt(is.max, 10)
      if (!isNaN(min) && !isNaN(max)) return { min, max }
    }
  }
  return { min: 0, max: 11 }
}

/** Backward-compatible wrapper: use the model's temporal indexSet range. */
export function getStepRange(modelObj, temporalIndexSetId) {
  return getTemporalRange(modelObj, temporalIndexSetId ?? getTemporalIndexSetId(modelObj))
}

/**
 * Builds a case-insensitive Map of variable ID → variable XML object.
 * @returns {Map<string, Object>}
 */
export function buildVariableMap(modelObj) {
  const variableMap = new Map()
  if (modelObj?.model?.variables?.variable) {
    const vars = Array.isArray(modelObj.model.variables.variable)
      ? modelObj.model.variables.variable
      : [modelObj.model.variables.variable]
    for (const v of vars) variableMap.set(String(v.id).toUpperCase(), v)
  }
  return variableMap
}

export function buildDataTypeMap(variableMap) {
  const m = new Map()
  if (!variableMap) return m

  for (const [id, varXml] of variableMap.entries()) {
    let dt = ''
    const raw = varXml?.dataType ?? varXml?.datatype
    if (typeof raw === 'string') dt = raw
    else if (raw && typeof raw === 'object') dt = raw['#text'] ?? ''
    dt = String(dt).trim().toLowerCase()
    if (dt) m.set(id, dt)
  }

  return m
}

/** Convert a model XML dataType into a display "kind" used by the renderer. */
export function kindFromDataType(dataType) {
  const dt = (dataType ?? '').toString().trim().toLowerCase()
  if (!dt) return 'text'
  if (dt === 'bool' || dt === 'boolean') return 'bool'
  if (dt === 'int' || dt === 'integer' || dt === 'long' || dt === 'short') return 'int'
  if (dt === 'money' || dt === 'currency') return 'money'
  if (dt === 'real' || dt === 'double' || dt === 'float' || dt === 'decimal' || dt === 'number') return 'dec4'
  return 'text'
}

/** Static data for the input_config sheet. */
export function buildInputConfigData(ctx) {
  return {
    headers: ['parameter', 'value', 'description'],
    rows: [['cohort', ctx.cohortId, 'Cohort identifier for calculations']]
  }
}

// ------------------------------------------------------------
// Table sheet generation (shared across XLSX/HTML/Python)
// ------------------------------------------------------------

function extractTableDefinitions(modelObj) {
  const map = new Map()
  const tables = asArray(modelObj?.model?.tables?.table)
  for (const t of tables) {
    const id = t?.id
    if (!id) continue
    const rowIndex = t?.rowIndex?.ref || t?.rowIndex?.['#text'] || ''
    const rowIndexMin = t?.rowIndex?.min != null ? Number(t.rowIndex.min) : undefined
    const rowIndexMax = t?.rowIndex?.max != null ? Number(t.rowIndex.max) : undefined
    const cols = asArray(t?.columns?.column).map(c => ({
      id: c?.id,
      dataType: c?.dataType,
      unit: c?.unit,
      min: c?.min != null ? Number(c.min) : undefined,
      max: c?.max != null ? Number(c.max) : undefined,
    })).filter(c => c.id)
    map.set(id, { id, rowIndex, rowIndexMin, rowIndexMax, columns: cols })
  }
  return map
}

function extractColumnConstraints(modelObj) {
  const m = new Map()
  const vars = asArray(modelObj?.model?.variables?.variable)
  for (const v of vars) {
    const must = v?.constraints?.mustResolveAs
    if (!must) continue
    const columnOf = must?.columnOf
    if (!columnOf) continue
    const tableId = columnOf?.table || columnOf?.['#text']
    if (!tableId) continue
    m.set(String(v.id), { columnOfTable: String(tableId) })
  }
  return m
}

function resolveColumnOfConstraint(tableId, tableDefs) {
  const t = tableDefs.get(tableId)
  if (!t) return []
  if (t.columns?.length) return t.columns.map(c => c.id)

  // If the referenced table has no constrained columns, mimic the default column headers
  // used by buildTableSheetsData so "columnOf" constraints get sample values that resolve.
  return [`${tableId}_column1`, `${tableId}_column2`]
}

function determineSampleRowCount(tableDef) {
  if (tableDef.rowIndexMin !== undefined && tableDef.rowIndexMax !== undefined) {
    const range = tableDef.rowIndexMax - tableDef.rowIndexMin + 1
    if (range <= 20) return range
    return Math.min(10, range)
  }
  return 5
}

function generateSampleValue(_id, dataType, i, min, max, _tableId, validValues) {
  const dt = String(dataType ?? '').toLowerCase()
  if (validValues && validValues.length) return validValues[Math.min(i, validValues.length - 1)]
  if (dt === 'string') return `value_${i + 1}`
  if (dt === 'boolean' || dt === 'bool') return i % 2
  const lo = (typeof min === 'number' && isFinite(min)) ? min : 0
  const hi = (typeof max === 'number' && isFinite(max)) ? max : (lo + 1 + i)
  if (dt === 'integer' || dt === 'int') return Math.round(lo + (hi - lo) * (i / Math.max(1, 3)))
  return lo + (hi - lo) * (i / Math.max(1, 3))
}

/**
 * Build the "input_{tableId}" sheets: headers + sample rows.
 * Used by XLSX (real output), HTML preview, and Python exporter (default embedded inputs).
 */
export function buildTableSheetsData(modelObj) {
  const tableDefs = extractTableDefinitions(modelObj)
  if (tableDefs.size === 0) return []

  const columnConstraints = extractColumnConstraints(modelObj)
  const sheets = []

  for (const [tableId, tableDef] of tableDefs) {
    const headers = [tableDef.rowIndex]

    if (tableDef.columns.length > 0) {
      for (const col of tableDef.columns) headers.push(col.id)
    } else {
      const referencedColumns = resolveColumnOfConstraint(tableId, tableDefs)
      if (referencedColumns.length > 0) headers.push(...referencedColumns)
      else headers.push(`${tableId}_column1`, `${tableId}_column2`)
    }

    const metadataRows = []
    if (tableDef.columns.length > 0) {
      const dataTypes = ['dataType']
      const units = ['unit']
      const domains = [tableDef.rowIndex]
      for (const col of tableDef.columns) {
        dataTypes.push(col.dataType || '')
        units.push(col.unit || '')
        domains.push('')
      }
      metadataRows.push(dataTypes, units, domains)
    }

    const numSampleRows = determineSampleRowCount(tableDef)
    const dataRows = []
    for (let i = 0; i < numSampleRows; i++) {
      const row = []

      if (tableDef.rowIndexMin !== undefined && tableDef.rowIndexMax !== undefined) {
        const range = tableDef.rowIndexMax - tableDef.rowIndexMin
        let rowIndexValue
        if (numSampleRows <= 1) rowIndexValue = tableDef.rowIndexMin
        else if (range < numSampleRows) rowIndexValue = tableDef.rowIndexMin + i
        else {
          const step = range / (numSampleRows - 1)
          rowIndexValue = Math.round(tableDef.rowIndexMin + i * step)
        }
        row.push(rowIndexValue)
      } else {
        row.push(generateSampleValue(tableDef.rowIndex, 'integer', i))
      }

      if (tableDef.columns.length > 0) {
        for (const col of tableDef.columns) {
          const constraint = columnConstraints.get(String(col.id))
          const validValues = constraint?.columnOfTable
            ? resolveColumnOfConstraint(constraint.columnOfTable, tableDefs)
            : null
          row.push(generateSampleValue(col.id, col.dataType, i, col.min, col.max, tableId, validValues))
        }
      } else {
        const numDataColumns = headers.length - 1
        const rowIndexValue = row[0]
        const BASE_VALUE = 0.001
        const COLUMN_SCALE_FACTOR = 0.5
        const RANGE_SCALE_FACTOR = 0.1
        for (let colIdx = 0; colIdx < numDataColumns; colIdx++) {
          const colValue = tableDef.rowIndexMin !== undefined && tableDef.rowIndexMax !== undefined
            ? BASE_VALUE * (1 + colIdx * COLUMN_SCALE_FACTOR) + (rowIndexValue - tableDef.rowIndexMin) / (tableDef.rowIndexMax - tableDef.rowIndexMin) * RANGE_SCALE_FACTOR
            : BASE_VALUE * (1 + i + colIdx * COLUMN_SCALE_FACTOR)
          row.push(colValue)
        }
      }

      dataRows.push(row)
    }

    sheets.push({ name: `input_${tableId}`, headers, metadataRows, dataRows })
  }

  return sheets
}
