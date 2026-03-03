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

  it('reports embedded table usage when no input CSV files are present', () => {
    const rel = exampleMap["annuity vendor format"];
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const py = renderModelAsPython(obj, features)
    const { dir, pyPath } = writeTempPython(py)
    const csvPath = path.join(dir, 'out.csv')
    const r = runPython(pyPath, ['--steps', '1', '--csv', csvPath])
    expect(r.status, r.stderr || r.stdout).toBe(0)
    // Should report that embedded sample data is used for each table (no input_*.csv files present)
    expect(r.stdout).toMatch(/using embedded sample data/)
  })

  it('reports csv-loaded table when input CSV file is present', () => {
    const rel = exampleMap["annuity vendor format"];
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const py = renderModelAsPython(obj, features)
    const { dir, pyPath } = writeTempPython(py)
    const csvPath = path.join(dir, 'out.csv')

    // Determine a table name from DEFAULT_TABLES in the generated Python
    const dtStart = py.indexOf('DEFAULT_TABLES')
    const jsonStart = py.indexOf('{', dtStart)
    const tableMatch = jsonStart >= 0 ? py.slice(jsonStart).match(/"([^"]+)"\s*:\s*\{/) : null
    expect(tableMatch, 'expected at least one table in the annuity model').toBeTruthy()
    const tableId = tableMatch[1]
    const inputCsvPath = path.join(dir, `input_${tableId}.csv`)
    // Write a minimal CSV matching the embedded headers
    const headersMatch = py.match(new RegExp(`"${tableId}"\\s*:\\s*\\{[^}]*"headers"\\s*:\\s*(\\[[^\\]]+\\])`))
    const headers = headersMatch ? JSON.parse(headersMatch[1]) : ['row', 'col1']
    fs.writeFileSync(inputCsvPath, headers.join(',') + '\n1,' + headers.slice(1).map(() => '0').join(',') + '\n', 'utf-8')

    const r = runPython(pyPath, ['--steps', '1', '--csv', csvPath])
    expect(r.status, r.stderr || r.stdout).toBe(0)
    // Should report that the table was loaded from a CSV file
    expect(r.stdout).toMatch(/loaded from/)
    expect(r.stdout).toContain(`input_${tableId}.csv`)
  })

  it('correctly evaluates step + 1 forward reference expression in generated Python', () => {
    // Regression test: a variable like within_projection(step) = step + 1 <= projection_limit
    // uses step + 1 as a bare arithmetic expression.  The generated Python must evaluate it
    // correctly (not produce NaN) because step is in the env dict and + is plain arithmetic.
    const modelXml = `<?xml version="1.0"?>
<model id="step_plus_one_test">
  <indexSets>
    <indexSet id="step" role="temporal"><dataType>integer</dataType></indexSet>
  </indexSets>
  <variables>
    <variable id="projection_limit">
      <dataType>integer</dataType>
      <definition type="constant">5</definition>
    </variable>
    <variable id="within_projection">
      <arguments><arg indexSet="step"/></arguments>
      <dataType>boolean</dataType>
      <definition type="expression">step + 1 &lt;= projection_limit</definition>
    </variable>
  </variables>
</model>`
    const { obj, features } = validateModelCore(modelXml, 'test.xml', lang)
    const py = renderModelAsPython(obj, features)
    const { dir, pyPath } = writeTempPython(py)
    const csvPath = path.join(dir, 'out.csv')
    const r = runPython(pyPath, ['--steps', '6', '--csv', csvPath])
    expect(r.status, r.stderr || r.stdout).toBe(0)
    const csv = fs.readFileSync(csvPath, 'utf-8')
    // within_projection should be 1 for steps 0-4 and 0 for step 5
    const lines = csv.split(/\r?\n/).filter(Boolean)
    const header = lines[0].split(',')
    const wpIdx = header.indexOf('within_projection')
    expect(wpIdx, 'within_projection column missing').toBeGreaterThanOrEqual(0)
    const stepIdx = header.indexOf('step')
    const rows = lines.slice(1).map(l => l.split(','))
    for (const row of rows) {
      const s = parseInt(row[stepIdx], 10)
      const wp = row[wpIdx]  // may be '1'/'0', 'True'/'False', or a float string
      const wpBool = wp === 'True' || wp === 'true' || parseFloat(wp) !== 0
      if (s < 5) {
        expect(wpBool, `within_projection at step ${s} should be truthy`).toBe(true)
      } else {
        expect(wp === 'False' || wp === 'false' || parseFloat(wp) === 0, `within_projection at step ${s} should be falsy`).toBe(true)
      }
    }
  })

  it('correctly evaluates a variable that references another variable at step + 1 (forward reference)', () => {
    // Regression test for forward temporal references: next_value(step) = base(step + 1)
    // where base(step) = step * 10 (a simple step-dependent formula).
    // At step 2, next_value should be base(3) = 30.
    const modelXml = `<?xml version="1.0"?>
<model id="forward_ref_test">
  <indexSets>
    <indexSet id="step" role="temporal"><dataType>integer</dataType></indexSet>
  </indexSets>
  <variables>
    <variable id="base">
      <arguments><arg indexSet="step"/></arguments>
      <dataType>real</dataType>
      <definition type="expression">step * 10</definition>
    </variable>
    <variable id="next_value">
      <arguments><arg indexSet="step"/></arguments>
      <dataType>real</dataType>
      <definition type="expression">base(step + 1)</definition>
    </variable>
  </variables>
</model>`
    const { obj, features } = validateModelCore(modelXml, 'test.xml', lang)
    const py = renderModelAsPython(obj, features)
    const { dir, pyPath } = writeTempPython(py)
    const csvPath = path.join(dir, 'out.csv')
    const r = runPython(pyPath, ['--steps', '4', '--csv', csvPath])
    expect(r.status, r.stderr || r.stdout).toBe(0)
    const csv = fs.readFileSync(csvPath, 'utf-8')
    const lines = csv.split(/\r?\n/).filter(Boolean)
    const header = lines[0].split(',')
    const nvIdx = header.indexOf('next_value')
    const stepIdx = header.indexOf('step')
    expect(nvIdx, 'next_value column missing').toBeGreaterThanOrEqual(0)
    const rows = lines.slice(1).map(l => l.split(','))
    // next_value(step) = base(step + 1) = (step + 1) * 10
    // Even at the last step (step=4), the lazy G function can compute base(5) = 50.
    for (const row of rows) {
      const s = parseInt(row[stepIdx], 10)
      const nv = parseFloat(row[nvIdx])
      expect(nv, `next_value at step ${s} should be ${(s + 1) * 10}`).toBe((s + 1) * 10)
    }
  })

  it('writes a .log file containing the screen output', () => {
    const rel = exampleMap["annuity vendor format"];
    const xml = fs.readFileSync(rel, 'utf-8')
    const { obj, features } = validateModelCore(xml, rel, lang)
    const py = renderModelAsPython(obj, features)
    const { dir, pyPath } = writeTempPython(py)
    const csvPath = path.join(dir, 'out.csv')
    const logPath = path.join(dir, 'out.log')
    const r = runPython(pyPath, ['--steps', '1', '--csv', csvPath])
    expect(r.status, r.stderr || r.stdout).toBe(0)
    // Log file should be created next to the CSV
    expect(fs.existsSync(logPath), 'log file should be created').toBe(true)
    const log = fs.readFileSync(logPath, 'utf-8')
    // Log should contain the table source and issue summary
    expect(log).toMatch(/Input tables:/)
    expect(log).toMatch(/Encountered \d+ evaluation issue\(s\)/)
    expect(log).toContain('Wrote')
  })
})

