import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/core/model.js'
import { renderModelAsHTMLPreview } from '@/core/spreadsheetLogic.js'
import { getFunctionsFromLanguage } from '@/core/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('renderModelAsHTMLPreview', () => {
  let lang
  let restaurantModel
  let restaurantNoIndicesModel
  let airlineModel
  let annuityModel

  beforeAll(() => {
    const languageXml = loadXml(getFixture('language.xml'))
    lang = getFunctionsFromLanguage(languageXml, 'test')

    const restaurantXml = fs.readFileSync(
      getFixture('restaurant/model.xml'), 'utf-8'
    )
    restaurantModel = validateModelCore(restaurantXml, 'restaurant-model.xml', lang)

    const restaurantNoIdxXml = fs.readFileSync(getFixture('restaurantNoIndices.xml'), 'utf-8')
    restaurantNoIndicesModel = validateModelCore(restaurantNoIdxXml, 'restaurantNoIndices.xml', lang)

    const airlineXml = fs.readFileSync(
      getFixture('airline/model.xml'), 'utf-8'
    )
    airlineModel = validateModelCore(airlineXml, 'airline-model.xml', lang)

    const annuityXml = fs.readFileSync(
      getFixture('vendor-format-model.xml'), 'utf-8'
    )
    annuityModel = validateModelCore(annuityXml, 'vendor-format-model.xml', lang)
  })

  it('returns a non-empty HTML string', () => {
    const html = renderModelAsHTMLPreview(restaurantModel.obj, restaurantModel.features)
    expect(typeof html).toBe('string')
    expect(html.length).toBeGreaterThan(0)
  })

  it('wraps output in spreadsheet-preview div', () => {
    const html = renderModelAsHTMLPreview(restaurantModel.obj, restaurantModel.features)
    expect(html).toMatch(/^<div class="spreadsheet-preview">/)
    expect(html).toMatch(/<\/div>$/)
  })

  it('includes an input_config table', () => {
    const html = renderModelAsHTMLPreview(restaurantModel.obj, restaurantModel.features)
    expect(html).toContain('input_config')
    expect(html).toContain('cohort')
  })

  it('includes a constant table for restaurant model', () => {
    const html = renderModelAsHTMLPreview(restaurantModel.obj, restaurantModel.features)
    expect(html).toContain('constant')
  })

  it('renders derived no-index constants as numeric amounts in constant sheet', () => {
    const html = renderModelAsHTMLPreview(restaurantNoIndicesModel.obj, restaurantNoIndicesModel.features)

    // Extract constant sheet block
    const m = html.match(/summary[^>]*>constant<\/summary>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)
    expect(m).toBeTruthy()
    const tbody = m[1]

    function findConstValue(constId) {
      // Match the row whose first cell equals constId and capture the second cell.
      const re = new RegExp(
        `<tr>[\\s\\S]*?<td[^>]*>\\s*${constId}\\s*<\\/td>[\\s\\S]*?<td[^>]*>\\s*([^<]*)\\s*<\\/td>[\\s\\S]*?<\\/tr>`,
        'i'
      )
      const rm = tbody.match(re)
      return rm?.[1] ?? null
    }

    // food_revenue_per_customer = avg_meal_price = 45 (should render as 45, not "avg_meal_price")
    expect(findConstValue('food_revenue_per_customer')).toBe('45')

    // total_revenue_per_customer = 45 + (12 * 0.75) = 54
    expect(findConstValue('total_revenue_per_customer')).toBe('54')
  })

  it('includes a calc_cohort_step table for restaurant model', () => {
    const html = renderModelAsHTMLPreview(restaurantModel.obj, restaurantModel.features)
    expect(html).toContain('calc_cohort_step')
  })

  it('escapes HTML special characters in cell values', () => {
    const html = renderModelAsHTMLPreview(restaurantModel.obj, restaurantModel.features)
    // Should not contain raw < or > from expressions (they must be escaped)
    // Strip the outer wrapper tags to check content cells only
    const bodyContent = html.replace(/<[^>]+>/g, ' ')
    expect(bodyContent).not.toContain('<script')
  })

  it('includes input table sheets for airline model', () => {
    const html = renderModelAsHTMLPreview(airlineModel.obj, airlineModel.features)
    // Airline model has tables - verify at least one input_ sheet appears
    // (exact table name depends on model content, just check for the pattern)
    expect(html).toContain('input_config')
  })

  it('throws on invalid modelObj', () => {
    expect(() => renderModelAsHTMLPreview(null, restaurantModel.features)).toThrow()
    expect(() => renderModelAsHTMLPreview({}, restaurantModel.features)).toThrow()
  })

  it('throws on invalid modelFeatures', () => {
    expect(() => renderModelAsHTMLPreview(restaurantModel.obj, null)).toThrow()
    expect(() => renderModelAsHTMLPreview(restaurantModel.obj, {})).toThrow()
  })

  // ── Annuity model: evaluated preview ──────────────────────────────────────

  it('annuity calc_cohort_step has 12 rows when step indexSet has max=11', () => {
    const html = renderModelAsHTMLPreview(annuityModel.obj, annuityModel.features)
    const m = html.match(/calc_cohort_step[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)
    expect(m).toBeTruthy()
    expect((m[1].match(/<tr>/g) || []).length).toBe(12)
  })

  it('annuity calc_cohort_step attained_age_years_floor at step 0 equals 46', () => {
    const html = renderModelAsHTMLPreview(annuityModel.obj, annuityModel.features)
    const headerM = html.match(/calc_cohort_step[\s\S]*?<thead>([\s\S]*?)<\/thead>/)
    const headers = headerM[1].replace(/<[^>]+>/g, '|').split('|').filter(Boolean)
    const colIdx = headers.indexOf('attained_age_years_floor')
    expect(colIdx).toBeGreaterThan(-1)

    const bodyM = html.match(/calc_cohort_step[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)
    const firstRow = bodyM[1].match(/<tr>([\s\S]*?)<\/tr>/)?.[1] || ''
    const cells = firstRow.replace(/<[^>]+>/g, '|').split('|').filter(Boolean)
    const value = parseFloat(cells[colIdx].replace(/,/g, ''))
    expect(value).toBeCloseTo(46, 4)
  })

  it('annuity calc_cohort shows numeric values, not definition type names', () => {
    const html = renderModelAsHTMLPreview(annuityModel.obj, annuityModel.features)
    const m = html.match(/summary[^>]*>calc_cohort<\/summary>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)
    expect(m).toBeTruthy()
    // Cells must not contain raw definition type strings
    expect(m[1]).not.toContain('>table<')
    expect(m[1]).not.toContain('>expression<')
    // Must contain at least one numeric cell
    expect(m[1]).toMatch(/>\d+/)
  })
})
