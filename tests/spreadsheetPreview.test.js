import { describe, it, expect, beforeAll } from 'vitest'
import { getSpreadsheetPreviewData } from '@/domain/spreadsheetRenderer.js'
import { validateModelCore } from '@/domain/model.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { loadXml } from './helpers/xml.js'
import fs from 'fs'
import path from 'path'

describe('Spreadsheet Preview', () => {
  let lang

  beforeAll(() => {
    // Use the docs/examples/language.xml (the one referenced in the problem statement)
    lang = getFunctionsFromLanguage(loadXml(path.join(process.cwd(), 'docs', 'examples', 'language.xml')), 'language.xml')
  })

  describe('Dividends.xml', () => {
    let model

    beforeAll(() => {
      const xml = fs.readFileSync(
        path.join(process.cwd(), 'docs', 'examples', 'airline-model', 'Dividends.xml'), 'utf-8'
      )
      model = validateModelCore(xml, 'Dividends.xml', lang)
    })

    it('should return preview data (not null)', () => {
      const data = getSpreadsheetPreviewData(model.obj, model.features)
      expect(data).not.toBeNull()
    })

    it('should include month-indexed variables in varNames', () => {
      const data = getSpreadsheetPreviewData(model.obj, model.features)
      const varNamesLower = data.varNames.map(n => n.toLowerCase())
      expect(varNamesLower).toContain('seasonality_index')
      expect(varNamesLower).toContain('total_monthly_flights')
      expect(varNamesLower).toContain('monthly_revenue')
      expect(varNamesLower).toContain('cash_bom')
      expect(varNamesLower).toContain('net_income')
    })

    it('should have 12 rows of data', () => {
      const data = getSpreadsheetPreviewData(model.obj, model.features)
      expect(data.rows).toHaveLength(12)
    })

    it('should have non-null values for all columns in calc_cohort_step (no blanks)', () => {
      const data = getSpreadsheetPreviewData(model.obj, model.features)
      for (let step = 0; step < data.rows.length; step++) {
        const row = data.rows[step]
        for (const varName of data.varNames) {
          const val = row.get(varName)
          expect(val, `step=${step} varName=${varName} should not be null`).not.toBeNull()
          expect(val, `step=${step} varName=${varName} should be a number`).toBeTypeOf('number')
        }
      }
    })

    it('should compute correct constant values', () => {
      const data = getSpreadsheetPreviewData(model.obj, model.features)
      // aircraft_count=10, flights_per_aircraft_per_month=110
      // At step=0: seasonality_index = 1 + 0.08 * sin(0) = 1.0
      // total_monthly_flights = 10 * 110 * 1.0 = 1100
      const row0 = data.rows[0]
      const siIdx = data.varNames.findIndex(n => n.toLowerCase() === 'seasonality_index')
      const tmfIdx = data.varNames.findIndex(n => n.toLowerCase() === 'total_monthly_flights')
      expect(siIdx).toBeGreaterThanOrEqual(0)
      expect(tmfIdx).toBeGreaterThanOrEqual(0)

      const si = row0.get(data.varNames[siIdx])
      expect(si).toBeCloseTo(1.0, 5)

      const tmf = row0.get(data.varNames[tmfIdx])
      expect(tmf).toBeCloseTo(1100, 1)
    })

    it('should compute correct cash_bom at step=0 (= initial_cash = 8000000)', () => {
      const data = getSpreadsheetPreviewData(model.obj, model.features)
      const row0 = data.rows[0]
      const cashBomIdx = data.varNames.findIndex(n => n.toLowerCase() === 'cash_bom')
      expect(cashBomIdx).toBeGreaterThanOrEqual(0)
      const cashBom0 = row0.get(data.varNames[cashBomIdx])
      expect(cashBom0).toBeCloseTo(8000000, 0)
    })

    it('should use the temporal argument name from the model (month)', () => {
      const data = getSpreadsheetPreviewData(model.obj, model.features)
      expect(data.temporalArgName).toBe('month')
    })
  })

  describe('model with no step variables', () => {
    it('should return null for a model with only constants', () => {
      const xml = `<?xml version="1.0"?>
<model id="constants-only">
  <variables>
    <variable id="rate"><definition type="constant">0.05</definition></variable>
  </variables>
</model>`
      const m = validateModelCore(xml, 'test.xml', lang)
      const data = getSpreadsheetPreviewData(m.obj, m.features)
      expect(data).toBeNull()
    })
  })
})
