import { describe, it, expect, beforeAll } from 'vitest'
import { validateModelCore } from '@/domain/model.js'
import { renderModelAsPython } from '@/domain/pythonRenderer.js'
import { getFunctionsFromLanguage } from '@/domain/language.js'
import { loadXml, loadXmlFromText } from './helpers/xml.js'
import { getFixture } from './helpers/fixtures.js'

import fs from 'fs'
import path from 'path'
import os from 'os'
import child_process from 'child_process'

  const examples = [
    ['rocket', getFixture('rocket/moon-rocket.xml')],
    ['annuity vendor format', getFixture('vendor-format-model.xml')],
    ['restaurant model', getFixture( 'restaurant/model.xml')],
    ['restaurant seasonal', getFixture('restaurant/seasonal.xml')],
    ['airline model', getFixture('airline/model.xml')],
    ['airline dividends', getFixture('airline/Dividends.xml')],
  ]
  const exampleMap = Object.fromEntries(examples);

function writeTempPython(code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-editor-py-'))
  const pyPath = path.join(dir, 'model.py')
  fs.writeFileSync(pyPath, code, 'utf-8')
  return { dir, pyPath }
}

function runPython(pyPath, args = []) {
  const res = { stdout: '', stderr: '', status: 0 }
  try {
    res.stdout = child_process.execFileSync('python3', [pyPath, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    res.status = e.status ?? 1
    res.stdout = e.stdout?.toString?.() ?? ''
    res.stderr = e.stderr?.toString?.() ?? ''
  }
  return res
}

describe('Python Export', () => {
  let lang

  beforeAll(() => {
    const langPath = getFixture('exLanguage/language.xml')
    const languageText = fs.readFileSync(langPath, 'utf-8')
    const languageXml = loadXmlFromText(languageText)
    lang = getFunctionsFromLanguage(languageXml, 'examples')
  })


  it('renders and runs for all example models', () => {
    for (const [name, rel] of examples) {
      const modelPath = exampleMap[name]
      const xml = fs.readFileSync(modelPath, 'utf-8')
      const { obj, features } = validateModelCore(xml, rel, lang)
      const py = renderModelAsPython(obj, features)

      // Sanity checks on generated program structure
      expect(py).toContain('def main()')
      expect(py).toContain('TOPO_VARS')
      expect(py).toContain('compute_point')

      const { dir, pyPath } = writeTempPython(py)
      const csvPath = path.join(dir, 'out.csv')
      const r = runPython(pyPath, ['--steps', '5', '--csv', csvPath])
      expect(r.status, `python failed for ${name}: ${r.stderr || r.stdout}`).toBe(0)
      expect(fs.existsSync(csvPath), `csv not written for ${name}`).toBe(true)

      const csv = fs.readFileSync(csvPath, 'utf-8')
      expect(csv.split(/\r?\n/).filter(Boolean).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('translates vendor not-equal operator <> to != (Dividends.xml regression)', () => {
    const rel = exampleMap["airline dividends"]
    const modelPath = rel;
    const xml = fs.readFileSync(modelPath, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const py = renderModelAsPython(obj, features)
    expect(py).not.toContain('<>')
    expect(py).toContain('!=')
  })

  it('loads annuity vendor-format model without table column KeyError', () => {
    const rel = exampleMap["annuity vendor format"];
    const modelPath = rel;
    const xml = fs.readFileSync(modelPath, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const py = renderModelAsPython(obj, features)
    const { dir, pyPath } = writeTempPython(py)
    const csvPath = path.join(dir, 'out.csv')
    const r = runPython(pyPath, ['--steps', '1', '--csv', csvPath])
    expect(r.status, r.stderr || r.stdout).toBe(0)
    expect((r.stderr || '') + (r.stdout || '')).not.toMatch(/Column .* not found/i)
  })

  it('is non-crashing but error-visible: seasonal.xml should report issues and produce NaNs', () => {
    const rel = exampleMap["restaurant seasonal"];
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const py = renderModelAsPython(obj, features)
    const { dir, pyPath } = writeTempPython(py)
    const csvPath = path.join(dir, 'out.csv')
    const r = runPython(pyPath, ['--steps', '5', '--csv', csvPath])
    expect(r.status, r.stderr || r.stdout).toBe(0)

    const combined = (r.stderr || '') + (r.stdout || '')
    expect(combined).toMatch(/Encountered \d+ evaluation issue\(s\)/)

    const csv = fs.readFileSync(csvPath, 'utf-8')
    expect(csv.toLowerCase()).toContain('nan')
  })
})
