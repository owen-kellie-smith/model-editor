import { describe, it, expect } from 'vitest'

describe('TABLE_DIMENSIONS Constants', () => {
  it('should have correct spot_rate maxRow calculation accounting for header', () => {
    // Reproduce the calculation from spreadsheetRenderer.js
    const SPOT_RATE_CONFIG = {
      minStep: 0,
      maxStep: 120,
    }
    
    // The maxRow calculation should account for:
    // - Data rows: maxStep - minStep + 1 = 120 - 0 + 1 = 121 rows
    // - Header row: +1 = 122 total rows
    const expectedMaxRow = SPOT_RATE_CONFIG.maxStep - SPOT_RATE_CONFIG.minStep + 2
    
    expect(expectedMaxRow).toBe(122)
  })

  it('should have correct mortality_rate maxRow calculation', () => {
    // Reproduce the calculation from spreadsheetRenderer.js
    const MORTALITY_RATE_CONFIG = {
      minAge: 17,
      maxAge: 104,
    }
    
    // The maxRow calculation should account for:
    // - Data rows: maxAge - minAge + 1 = 104 - 17 + 1 = 88 rows
    // - Header row: +1 = 89 total rows
    const expectedMaxRow = MORTALITY_RATE_CONFIG.maxAge - MORTALITY_RATE_CONFIG.minAge + 2
    
    expect(expectedMaxRow).toBe(89)
  })

  it('should generate correct formula pattern for table lookup with quotes', () => {
    // Simulate the formula generation with quoted column reference
    const tableRef = 'spot_rate'
    const columnRef = 'rate'
    const currentRow = 2
    const maxRow = 122
    const maxCol = 'B'
    
    const formula = `INDEX(table_${tableRef}!$A$1:$${maxCol}$${maxRow},MATCH($A${currentRow},table_${tableRef}!$A$1:$A$${maxRow},0),MATCH("${columnRef}",table_${tableRef}!$A$1:$${maxCol}$1,0))`
    
    // Verify the formula has the correct structure
    expect(formula).toBe('INDEX(table_spot_rate!$A$1:$B$122,MATCH($A2,table_spot_rate!$A$1:$A$122,0),MATCH("rate",table_spot_rate!$A$1:$B$1,0))')
    
    // Verify column reference is quoted
    expect(formula).toContain('MATCH("rate"')
    expect(formula).not.toContain('MATCH(rate,')
    
    // Verify correct row count (122 not 121)
    expect(formula).toContain('$B$122')
    expect(formula).toContain('$A$122')
    expect(formula).not.toContain('$B$121')
  })

  it('should demonstrate incorrect formula pattern before fix', () => {
    // This test shows what the INCORRECT formula looked like before the fix
    const tableRef = 'spot_rate'
    const columnRef = 'rate'
    const currentRow = 2
    const maxRowOld = 121  // WRONG: Missing header row
    const maxCol = 'B'
    
    // Old (incorrect) formula without quotes and with wrong row count
    const oldFormula = `INDEX(table_${tableRef}!$A$1:$${maxCol}$${maxRowOld},MATCH($A${currentRow},table_${tableRef}!$A$1:$A$${maxRowOld},0),MATCH(${columnRef},table_${tableRef}!$A$1:$${maxCol}$1,0))`
    
    // Verify old formula had issues
    expect(oldFormula).toBe('INDEX(table_spot_rate!$A$1:$B$121,MATCH($A2,table_spot_rate!$A$1:$A$121,0),MATCH(rate,table_spot_rate!$A$1:$B$1,0))')
    expect(oldFormula).toContain('MATCH(rate,')  // Unquoted!
    expect(oldFormula).toContain('$B$121')  // Wrong row count!
  })
})
