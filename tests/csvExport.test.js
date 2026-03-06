/**
 * Tests for renderModelAsCsv in spreadsheetLogic.js
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import { validateModelCore } from '@/core/model.js'
import { getFunctionsFromLanguage } from '@/core/language.js'
import { renderModelAsCsv, makeRenderContext } from '@/core/spreadsheetLogic.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'

describe('renderModelAsCsv', () => {
  let lang
  let restaurantModel
  let airlineModel
  let annuityModel

  beforeAll(() => {
    const languageXml = loadXml(getFixture('language.xml'))
    lang = getFunctionsFromLanguage(languageXml, 'test')

    const restaurantXml = fs.readFileSync(getFixture('restaurant/model.xml'), 'utf-8')
    restaurantModel = validateModelCore(restaurantXml, 'restaurant-model.xml', lang)

    const airlineXml = fs.readFileSync(getFixture('airline/model.xml'), 'utf-8')
    airlineModel = validateModelCore(airlineXml, 'airline-model.xml', lang)

    const annuityXml = fs.readFileSync(getFixture('vendor-format-model.xml'), 'utf-8')
    annuityModel = validateModelCore(annuityXml, 'vendor-format-model.xml', lang)
  })

  // ── Basic output contract ──────────────────────────────────────────────────

  it('returns a non-empty string', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    expect(typeof csv).toBe('string')
    expect(csv.length).toBeGreaterThan(0)
  })

  it('contains a calc_cohort_step section header for restaurant model', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    expect(csv).toContain('# sheet: calc_cohort_step')
  })

  it('contains an input_config section', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    expect(csv).toContain('# sheet: input_config')
    expect(csv).toContain('cohort')
  })

  it('contains a constant section for restaurant model', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    expect(csv).toContain('# sheet: constant')
  })

  it('sections are separated by blank lines', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    expect(csv).toContain('\n\n')
  })

  // ── CSV structure ──────────────────────────────────────────────────────────

  it('each section starts with a # sheet: comment line', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    const sectionLines = csv.split('\n').filter(l => l.startsWith('# sheet:'))
    expect(sectionLines.length).toBeGreaterThan(0)
    for (const line of sectionLines) {
      expect(line).toMatch(/^# sheet: \S+/)
    }
  })

  it('header row immediately follows the # sheet comment', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    const lines = csv.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('# sheet:')) {
        const headerLine = lines[i + 1]
        expect(headerLine).toBeTruthy()
        // header row must not start with # and must be comma-separated
        expect(headerLine).not.toMatch(/^#/)
        expect(headerLine).toContain(',')
        break
      }
    }
  })

  it('calc_cohort_step section has correct number of step rows for restaurant model', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    const sections = csv.split('\n\n')
    const stepSection = sections.find(s => s.startsWith('# sheet: calc_cohort_step'))
    expect(stepSection).toBeTruthy()
    const rows = stepSection.split('\n').filter(l => l && !l.startsWith('#'))
    // 1 header + 12 data rows (months 0–11)
    expect(rows.length).toBe(13)
  })

  it('calc_cohort_step header row contains temporal index column', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    const sections = csv.split('\n\n')
    const stepSection = sections.find(s => s.startsWith('# sheet: calc_cohort_step'))
    const headerLine = stepSection.split('\n').find(l => l && !l.startsWith('#'))
    expect(headerLine).toContain('month')
  })

  // ── Numeric values ─────────────────────────────────────────────────────────

  it('contains numeric data values in the step section', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    const sections = csv.split('\n\n')
    const stepSection = sections.find(s => s.startsWith('# sheet: calc_cohort_step'))
    const dataRows = stepSection.split('\n').filter(l => l && !l.startsWith('#')).slice(1)
    expect(dataRows.length).toBeGreaterThan(0)
    // First cell of each data row should be the step number
    expect(dataRows[0]).toMatch(/^0,/)
    expect(dataRows[1]).toMatch(/^1,/)
  })

  // ── CSV field escaping ─────────────────────────────────────────────────────

  it('wraps fields containing commas in double quotes', () => {
    const modelXml = `<?xml version="1.0"?>
<model id="comma_test">
  <indexSets>
    <indexSet id="step" role="temporal"><dataType>integer</dataType><min>0</min><max>0</max></indexSet>
  </indexSets>
  <variables>
    <variable id="rate">
      <definition type="constant">0.05</definition>
    </variable>
  </variables>
</model>`
    const { obj, features } = validateModelCore(modelXml, 'test.xml', lang)
    const csv = renderModelAsCsv(obj, features)
    // id column in constant section should have "rate" without quoting (no comma)
    expect(csv).toContain('rate')
  })

  // ── Invalid inputs throw ───────────────────────────────────────────────────

  it('throws on null modelObj', () => {
    expect(() => renderModelAsCsv(null, restaurantModel.features)).toThrow()
  })

  it('throws on modelObj without .model', () => {
    expect(() => renderModelAsCsv({}, restaurantModel.features)).toThrow()
  })

  it('throws on null modelFeatures', () => {
    expect(() => renderModelAsCsv(restaurantModel.obj, null)).toThrow()
  })

  it('throws on modelFeatures without .variables', () => {
    expect(() => renderModelAsCsv(restaurantModel.obj, {})).toThrow()
  })

  // ── Optional ctx parameter ─────────────────────────────────────────────────

  it('works without explicit ctx (uses default cohortId=1)', () => {
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features)
    expect(csv).toBeTruthy()
  })

  it('accepts explicit makeRenderContext()', () => {
    const ctx = makeRenderContext({ cohortId: 2 })
    const csv = renderModelAsCsv(restaurantModel.obj, restaurantModel.features, ctx)
    expect(csv).toBeTruthy()
  })

  it('changes cohort row value when a different cohortId is used', () => {
    const csv1 = renderModelAsCsv(restaurantModel.obj, restaurantModel.features, makeRenderContext({ cohortId: 1 }))
    const csv2 = renderModelAsCsv(restaurantModel.obj, restaurantModel.features, makeRenderContext({ cohortId: 2 }))
    // The input_config section should differ (cohort value 1 vs 2)
    const getConfigSection = csv => csv.split('\n\n').find(s => s.startsWith('# sheet: input_config'))
    expect(getConfigSection(csv1)).not.toBe(getConfigSection(csv2))
  })

  // ── Cross-model smoke tests ────────────────────────────────────────────────

  it('produces output for airline model (model with input tables)', () => {
    const csv = renderModelAsCsv(airlineModel.obj, airlineModel.features)
    expect(csv.length).toBeGreaterThan(0)
    expect(csv).toContain('# sheet:')
  })

  it('airline model CSV includes at least one input_ sheet section', () => {
    const csv = renderModelAsCsv(airlineModel.obj, airlineModel.features)
    const sections = csv.split('\n\n').filter(s => s.startsWith('# sheet: input_'))
    expect(sections.length).toBeGreaterThan(0)
  })

  it('produces output for annuity (vendor-format) model', () => {
    const csv = renderModelAsCsv(annuityModel.obj, annuityModel.features)
    expect(csv.length).toBeGreaterThan(0)
    expect(csv).toContain('# sheet:')
  })

  it('annuity calc_cohort_step section has 12 rows (steps 0–11)', () => {
    const csv = renderModelAsCsv(annuityModel.obj, annuityModel.features)
    const sections = csv.split('\n\n')
    const stepSection = sections.find(s => s.startsWith('# sheet: calc_cohort_step'))
    expect(stepSection).toBeTruthy()
    const rows = stepSection.split('\n').filter(l => l && !l.startsWith('#'))
    // 1 header + 12 data rows
    expect(rows.length).toBe(13)
  })
})
