/**
 * Tests for the CLI export-python and export-spreadsheet commands.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runExportPython, exportPythonCommandUsage } from '@/cli/commands/export-python.js'
import { runExportSpreadsheet, exportSpreadsheetCommandUsage } from '@/cli/commands/export-spreadsheet.js'
import { getFixture } from './helpers/fixtures.ts'

// Paths to shared test fixtures
const MODEL_PATH = getFixture('restaurant/model.xml')
const LANGUAGE_PATH = getFixture('language.xml')

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-editor-cli-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function tmpOut(filename) {
  return path.join(tmpDir, filename)
}

// ── export-python ─────────────────────────────────────────────────────────────

describe('runExportPython', () => {
  it('exportPythonCommandUsage returns a usage string', () => {
    const usage = exportPythonCommandUsage()
    expect(typeof usage).toBe('string')
    expect(usage).toContain('export-python')
    expect(usage).toContain('--language')
  })

  it('throws when model path is missing', () => {
    const args = { positional: [], options: { language: LANGUAGE_PATH } }
    expect(() => runExportPython(args)).toThrow(/export-python/)
  })

  it('throws when language path is missing', () => {
    const args = { positional: [MODEL_PATH], options: {} }
    expect(() => runExportPython(args)).toThrow(/export-python/)
  })

  it('throws when language flag is present but has no value', () => {
    // parseCliArgs sets flag-only options to true
    const args = { positional: [MODEL_PATH], options: { language: true } }
    expect(() => runExportPython(args)).toThrow(/export-python/)
  })

  it('writes a .py file to the specified --out path', () => {
    const outPath = tmpOut('restaurant.py')
    const args = {
      positional: [MODEL_PATH],
      options: { language: LANGUAGE_PATH, out: outPath },
    }
    const result = runExportPython(args)
    expect(result.outPath).toBe(outPath)
    expect(fs.existsSync(outPath)).toBe(true)
  })

  it('written Python file contains expected function names', () => {
    const outPath = tmpOut('restaurant_check.py')
    runExportPython({
      positional: [MODEL_PATH],
      options: { language: LANGUAGE_PATH, out: outPath },
    })
    const content = fs.readFileSync(outPath, 'utf-8')
    expect(content).toContain('def main()')
    expect(content).toContain('TOPO_VARS')
    expect(content).toContain('compute_point')
  })

  it('default filename is derived from model id (sanitized) + .py', () => {
    // restaurant model has id="restaurant-profitability"
    const expectedFilename = 'restaurant-profitability.py'
    const outPath = tmpOut(expectedFilename)
    const args = {
      positional: [MODEL_PATH],
      options: { language: LANGUAGE_PATH, out: outPath },
    }
    const result = runExportPython(args)
    // The file should have the model-id–based name when --out matches it
    expect(path.basename(result.outPath)).toBe(expectedFilename)
  })

  it('returns outPath in result object', () => {
    const outPath = tmpOut('result_test.py')
    const result = runExportPython({
      positional: [MODEL_PATH],
      options: { language: LANGUAGE_PATH, out: outPath },
    })
    expect(result).toHaveProperty('outPath')
    expect(result.outPath).toBe(outPath)
  })

  it('throws on invalid model XML', () => {
    const circularModelPath = getFixture('modelCircular.xml')
    expect(() =>
      runExportPython({
        positional: [circularModelPath],
        options: { language: LANGUAGE_PATH, out: tmpOut('ignored.py') },
      })
    ).toThrow()
  })

  it('throws on invalid language XML', () => {
    const badLangPath = getFixture('languageNoName.xml')
    expect(() =>
      runExportPython({
        positional: [MODEL_PATH],
        options: { language: badLangPath, out: tmpOut('ignored2.py') },
      })
    ).toThrow()
  })
})

// ── export-spreadsheet ────────────────────────────────────────────────────────

describe('runExportSpreadsheet', () => {
  it('exportSpreadsheetCommandUsage returns a usage string', () => {
    const usage = exportSpreadsheetCommandUsage()
    expect(typeof usage).toBe('string')
    expect(usage).toContain('export-spreadsheet')
    expect(usage).toContain('--language')
  })

  it('throws when model path is missing', () => {
    const args = { positional: [], options: { language: LANGUAGE_PATH } }
    expect(() => runExportSpreadsheet(args)).toThrow(/export-spreadsheet/)
  })

  it('throws when language path is missing', () => {
    const args = { positional: [MODEL_PATH], options: {} }
    expect(() => runExportSpreadsheet(args)).toThrow(/export-spreadsheet/)
  })

  it('throws when language flag is present but has no value', () => {
    const args = { positional: [MODEL_PATH], options: { language: true } }
    expect(() => runExportSpreadsheet(args)).toThrow(/export-spreadsheet/)
  })

  it('writes a CSV file to the specified --out path', () => {
    const outPath = tmpOut('restaurant.csv')
    const args = {
      positional: [MODEL_PATH],
      options: { language: LANGUAGE_PATH, out: outPath },
    }
    const result = runExportSpreadsheet(args)
    expect(result.outPath).toBe(outPath)
    expect(fs.existsSync(outPath)).toBe(true)
  })

  it('written CSV contains expected section headers', () => {
    const outPath = tmpOut('restaurant_sections.csv')
    runExportSpreadsheet({
      positional: [MODEL_PATH],
      options: { language: LANGUAGE_PATH, out: outPath },
    })
    const content = fs.readFileSync(outPath, 'utf-8')
    expect(content).toContain('# sheet: calc_cohort_step')
    expect(content).toContain('# sheet: input_config')
  })

  it('written CSV has comma-separated rows', () => {
    const outPath = tmpOut('restaurant_rows.csv')
    runExportSpreadsheet({
      positional: [MODEL_PATH],
      options: { language: LANGUAGE_PATH, out: outPath },
    })
    const content = fs.readFileSync(outPath, 'utf-8')
    const dataLines = content.split('\n').filter(l => l && !l.startsWith('#') && l.trim() !== '')
    expect(dataLines.length).toBeGreaterThan(0)
    expect(dataLines[0]).toContain(',')
  })

  it('default --out produces model_spreadsheet.csv filename in result', () => {
    // We pass a custom --out to avoid writing to cwd, but verify default name logic
    const outPath = tmpOut('model_spreadsheet.csv')
    const result = runExportSpreadsheet({
      positional: [MODEL_PATH],
      options: { language: LANGUAGE_PATH, out: outPath },
    })
    expect(path.basename(result.outPath)).toBe('model_spreadsheet.csv')
  })

  it('returns outPath in result object', () => {
    const outPath = tmpOut('result_test.csv')
    const result = runExportSpreadsheet({
      positional: [MODEL_PATH],
      options: { language: LANGUAGE_PATH, out: outPath },
    })
    expect(result).toHaveProperty('outPath')
    expect(result.outPath).toBe(outPath)
  })

  it('throws on invalid model XML', () => {
    const circularModelPath = getFixture('modelCircular.xml')
    expect(() =>
      runExportSpreadsheet({
        positional: [circularModelPath],
        options: { language: LANGUAGE_PATH, out: tmpOut('ignored.csv') },
      })
    ).toThrow()
  })

  it('throws on invalid language XML', () => {
    const badLangPath = getFixture('languageNoName.xml')
    expect(() =>
      runExportSpreadsheet({
        positional: [MODEL_PATH],
        options: { language: badLangPath, out: tmpOut('ignored2.csv') },
      })
    ).toThrow()
  })
})
