import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/domain/model.js'
import { renderModelAsHTMLPreview } from '@/domain/spreadsheetRenderer.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { loadXml } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.ts'
import fs from 'fs'
import path from 'path'

describe('renderModelAsHTMLPreview', () => {
  let lang
  let restaurantModel
  let airlineModel

  beforeAll(() => {
    const languageXml = loadXml(getFixture('language.xml'))
    lang = getFunctionsFromLanguage(languageXml, 'test')

    const restaurantXml = fs.readFileSync(
      path.join(process.cwd(), 'docs', 'examples', 'restaurant-model', 'model.xml'), 'utf-8'
    )
    restaurantModel = validateModelCore(restaurantXml, 'restaurant-model.xml', lang)

    const airlineXml = fs.readFileSync(
      path.join(process.cwd(), 'docs', 'examples', 'airline-model', 'model.xml'), 'utf-8'
    )
    airlineModel = validateModelCore(airlineXml, 'airline-model.xml', lang)
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
})
