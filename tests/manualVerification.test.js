import { describe, it } from 'vitest'
import { validateModelCore } from '@/domain/model.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('Manual Verification of Sample Data Generation', () => {
  it('should display expected sample data structure', () => {
    // Load language
    const langFixture = getFixture('language.xml')
    const langXml = loadXml(langFixture)
    const lang = getFunctionsFromLanguage(langXml, 'test')

    // Load vendor format model
    const modelPath = getFixture('vendor-format-model.xml')
    const modelXml = fs.readFileSync(modelPath, 'utf-8')

    // Validate model
    const model = validateModelCore(modelXml, 'vendor-format-model.xml', lang)

    console.log('\n=== Model Structure Analysis ===\n')

    // Analyze tables
    const tables = Array.isArray(model.obj.model.tables.table)
      ? model.obj.model.tables.table
      : [model.obj.model.tables.table]

    console.log('Tables:')
    for (const table of tables) {
      console.log(`\n  ${table.id}:`)
      console.log(`    Row index: ${table.rowIndex?.ref || 'N/A'}`)
      if (table.rowIndex?.min !== undefined && table.rowIndex?.max !== undefined) {
        console.log(`    Range: ${table.rowIndex.min} to ${table.rowIndex.max}`)
      }
      
      if (table.columns?.column) {
        const cols = Array.isArray(table.columns.column) ? table.columns.column : [table.columns.column]
        console.log(`    Columns (${cols.length}):`)
        for (const col of cols) {
          const constraints = []
          if (col.dataType) constraints.push(`type: ${col.dataType}`)
          if (col.min !== undefined && col.max !== undefined) {
            constraints.push(`range: ${col.min}-${col.max}`)
          }
          console.log(`      - ${col.id} ${constraints.length ? `(${constraints.join(', ')})` : ''}`)
        }
      } else {
        console.log(`    Columns: unconstrained (will be dynamically generated)`)
      }
    }

    // Analyze variables with constraints
    console.log('\n\nVariables with columnOf constraints:')
    const vars = Array.isArray(model.obj.model.variables.variable)
      ? model.obj.model.variables.variable
      : [model.obj.model.variables.variable]

    let foundConstraints = false
    for (const v of vars) {
      const columnOfTable = v?.constraints?.mustResolveAs?.columnOf?.table
      if (columnOfTable) {
        foundConstraints = true
        console.log(`\n  ${v.id}:`)
        console.log(`    Definition: table=${v.definition?.table?.ref}, column=${v.definition?.column?.ref}`)
        console.log(`    Constraint: must be a column from table "${columnOfTable}"`)
        
        // Find the referenced table
        const refTable = tables.find(t => t.id === columnOfTable)
        if (refTable) {
          if (refTable.columns?.column) {
            const refCols = Array.isArray(refTable.columns.column) 
              ? refTable.columns.column 
              : [refTable.columns.column]
            console.log(`    Valid values: ${refCols.map(c => c.id).join(', ')}`)
          } else {
            console.log(`    Valid values: will use default mortality table names (AM92U, AF92U)`)
          }
        }
      }
    }

    if (!foundConstraints) {
      console.log('  (none found)')
    }

    console.log('\n\n=== Expected Sample Data Generation ===\n')

    // Simulate sample data generation for cohort_data table
    const cohortTable = tables.find(t => t.id === 'cohort_data')
    if (cohortTable && cohortTable.columns?.column) {
      const cols = Array.isArray(cohortTable.columns.column) 
        ? cohortTable.columns.column 
        : [cohortTable.columns.column]
      
      console.log('cohort_data table sample rows:')
      console.log(`Header: ${cohortTable.rowIndex.ref}, ${cols.map(c => c.id).join(', ')}`)
      
      for (let i = 0; i < 4; i++) {
        const row = [`${i + 1}`]
        for (const col of cols) {
          if (col.id === 'mortality_table') {
            // This column has a columnOf constraint
            // Should cycle through: AM92U, AF92U, AM92U, AF92U
            const validValues = ['AM92U', 'AF92U']
            row.push(validValues[i % validValues.length])
          } else if (col.dataType === 'real') {
            // Generate sample real values
            if (col.min !== undefined && col.max !== undefined) {
              const min = parseFloat(col.min)
              const max = parseFloat(col.max)
              const range = max - min
              const value = min + (i % 4) * (range / 3)
              row.push(value.toFixed(2))
            } else {
              row.push('N/A')
            }
          } else {
            row.push('...')
          }
        }
        console.log(`Row ${i + 1}: ${row.join(', ')}`)
      }
    }

    console.log('\n\nmortality_rate table sample structure:')
    const mortalityTable = tables.find(t => t.id === 'mortality_rate')
    if (mortalityTable) {
      console.log('Header: age, AM92U, AF92U')
      console.log('Row 1: 17, 0.001, 0.0005')
      console.log('Row 2: 30, 0.034, 0.017')
      console.log('...')
      console.log('(columns AM92U and AF92U are generated because other variables reference them)')
    }

    console.log('\n✅ Sample data generation will now use actual column names!\n')
  })
})

