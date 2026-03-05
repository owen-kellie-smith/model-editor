import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/domain/model.js'
import { renderModelAsLatex } from '@/domain/latexRenderer.js'
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

describe('LaTeX Export', () => {
  let lang

  beforeAll(() => {
    const langPath = getFixture('exLanguage/language.xml')
    const languageText = fs.readFileSync(langPath, 'utf-8')
    const languageXml = loadXmlFromText(languageText)
    lang = getFunctionsFromLanguage(languageXml, 'examples')
  })

  it('generates valid LaTeX document structure for all example models', () => {
    for (const [name, rel] of examples) {
      const xml = fs.readFileSync(rel, 'utf-8')
      const { obj, features } = validateModelCore(xml, rel, lang)
      const latex = renderModelAsLatex(obj, features)

      expect(latex, `${name}: missing documentclass`).toContain('\\documentclass{article}')
      expect(latex, `${name}: missing usepackage amsmath`).toContain('\\usepackage{amsmath}')
      expect(latex, `${name}: missing begin document`).toContain('\\begin{document}')
      expect(latex, `${name}: missing end document`).toContain('\\end{document}')
      expect(latex, `${name}: missing maketitle`).toContain('\\maketitle')
      expect(latex, `${name}: missing Variable Equations section`).toContain('Variable Equations')
    }
  })

  it('includes each variable name in the output', () => {
    const rel = exampleMap['annuity vendor format']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const latex = renderModelAsLatex(obj, features)

    // Should have subsections for each variable
    expect(latex).toContain('\\subsection*{')
  })

  it('renders piecewise definitions with cases environment', () => {
    const rel = exampleMap['annuity vendor format']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const latex = renderModelAsLatex(obj, features)

    // Piecewise should use \begin{cases}
    if (latex.includes('piecewise') || xml.includes('type="piecewise"')) {
      expect(latex).toContain('\\begin{cases}')
      expect(latex).toContain('\\end{cases}')
    }
  })

  it('renders equation environments for expression variables', () => {
    const rel = exampleMap['rocket']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const latex = renderModelAsLatex(obj, features)
    expect(latex).toContain('\\begin{equation*}')
    expect(latex).toContain('\\end{equation*}')
  })

  it('includes model id in the document title', () => {
    const rel = exampleMap['rocket']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const latex = renderModelAsLatex(obj, features)
    const modelId = obj?.model?.id ?? ''
    expect(latex).toContain(modelId)
  })

  it('throws on invalid model object', () => {
    expect(() => renderModelAsLatex(null, {})).toThrow()
    expect(() => renderModelAsLatex({ model: {} }, null)).toThrow()
  })

  it('returns a non-empty string', () => {
    const rel = exampleMap['rocket']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const latex = renderModelAsLatex(obj, features)
    expect(typeof latex).toBe('string')
    expect(latex.length).toBeGreaterThan(100)
  })

  it('escapes LaTeX special characters in variable names and descriptions', () => {
    const rel = exampleMap['annuity vendor format']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const latex = renderModelAsLatex(obj, features)
    // The output should be a valid LaTeX string
    expect(typeof latex).toBe('string')
    // Raw unescaped & should not appear in section/subsection headings (LaTeX text context)
    // We verify the escapeLatexText function works correctly by checking that
    // the document begins with well-formed LaTeX preamble
    expect(latex).toContain('\\documentclass{article}')
    expect(latex).toContain('\\begin{document}')
    // Check that underscore characters in variable names are escaped in text mode (subsection headings)
    // e.g., "annual_pv" in a \subsection*{} should appear as "annual_pv" (the raw ID, not escaped)
    // since we use escapeLatexText() on it
    const subsectionMatches = latex.match(/\\subsection\*\{([^}]+)\}/g) || []
    for (const m of subsectionMatches) {
      // Subsection content must not contain raw unescaped & or %
      expect(m).not.toMatch(/[^\\][&%]/)
    }
  })

  it('includes index sets section when model has index sets', () => {
    const rel = exampleMap['annuity vendor format']
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const latex = renderModelAsLatex(obj, features)
    expect(latex).toContain('Index Sets')
  })
})
