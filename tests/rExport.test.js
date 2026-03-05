import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/domain/model.js'
import { renderModelAsR } from '@/domain/rRenderer.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { loadXmlFromText } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.js'

import fs from 'fs'

const examples = [
  ['rocket', getFixture('rocket/moon-rocket.xml')],
  ['annuity vendor format', getFixture('vendor-format-model.xml')],
  ['restaurant model', getFixture('restaurant/model.xml')],
  ['airline model', getFixture('airline/model.xml')],
  ['airline dividends', getFixture('airline/Dividends.xml')],
]
const exampleMap = Object.fromEntries(examples)

describe('R Script Export', () => {
  let lang

  beforeAll(() => {
    const langPath = getFixture('exLanguage/language.xml')
    const languageText = fs.readFileSync(langPath, 'utf-8')
    const languageXml = loadXmlFromText(languageText)
    lang = getFunctionsFromLanguage(languageXml, 'examples')
  })

  it('generates R script with required structural sections for all example models', () => {
    for (const [name, rel] of examples) {
      const xml = fs.readFileSync(rel, 'utf-8')
      const { obj, features } = validateModelCore(xml, rel, lang)
      const rCode = renderModelAsR(obj, features)

      // Sanity checks on generated script structure
      expect(rCode, `${name}: missing shebang`).toContain('#!/usr/bin/env Rscript')
      expect(rCode, `${name}: missing TOPO_VARS`).toContain('TOPO_VARS')
      expect(rCode, `${name}: missing VAR_DEFS`).toContain('VAR_DEFS')
      expect(rCode, `${name}: missing compute_value`).toContain('compute_value')
      expect(rCode, `${name}: missing compute_point`).toContain('compute_point')
      expect(rCode, `${name}: missing G function`).toContain('G <- function')
      expect(rCode, `${name}: missing main`).toContain('main <- function')
      expect(rCode, `${name}: missing write.csv`).toContain('write.csv')
      expect(rCode, `${name}: missing DEFAULT_TABLES`).toContain('DEFAULT_TABLES')
    }
  })

  it('embeds variable definitions in R format', () => {
    const rel = exampleMap['annuity vendor format']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const rCode = renderModelAsR(obj, features)

    // Should embed VAR_DEFS as R list
    expect(rCode).toContain('VAR_DEFS <- list(')
    // Should embed domains
    expect(rCode).toContain('VAR_DOMAINS <- list(')
    // Should embed index sets
    expect(rCode).toContain('INDEXSETS <- list(')
  })

  it('translates vendor not-equal operator <> to != (Dividends.xml regression)', () => {
    const rel = exampleMap['airline dividends']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const rCode = renderModelAsR(obj, features)
    expect(rCode).not.toContain('<>')
    expect(rCode).toContain('!=')
  })

  it('translates ternary ? : to ifelse() in R', () => {
    const rel = exampleMap['rocket']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const rCode = renderModelAsR(obj, features)
    // Ternary expressions should be converted to ifelse(cond, a, b)
    // (only if model uses ternary; test that no raw ? remains in r_expr values)
    const hasRawTernary = /r_expr.*\?/.test(rCode)
    expect(hasRawTernary).toBe(false)
  })

  it('includes table load helpers', () => {
    const rel = exampleMap['annuity vendor format']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const rCode = renderModelAsR(obj, features)
    expect(rCode).toContain('load_tables_from_csv')
    expect(rCode).toContain('table_get')
    expect(rCode).toContain('safe_table_get')
  })

  it('throws on invalid model object', () => {
    expect(() => renderModelAsR(null, {})).toThrow()
    expect(() => renderModelAsR({ model: {} }, null)).toThrow()
  })

  it('returns a non-empty string', () => {
    const rel = exampleMap['rocket']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const rCode = renderModelAsR(obj, features)
    expect(typeof rCode).toBe('string')
    expect(rCode.length).toBeGreaterThan(100)
  })

  it('embeds piecewise definitions with when_r and value_r fields', () => {
    const rel = exampleMap['annuity vendor format']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const rCode = renderModelAsR(obj, features)
    // If model has piecewise vars, check for when_r/value_r
    if (rCode.includes('"piecewise"') || rCode.includes("'piecewise'")) {
      expect(rCode).toMatch(/when_r/)
      expect(rCode).toMatch(/value_r/)
    }
  })
})
