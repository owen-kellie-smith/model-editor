import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Build a minimal DOM-element mock whose style and addEventListener work.
 */
function makeMockElement(overrides = {}) {
  return { style: {}, addEventListener: vi.fn(), ...overrides }
}

/**
 * Wire up global.document and global.window with just enough of the DOM to
 * import the app modules without errors.
 */
function setupDom(elements = {}) {
  const defaults = {
    loadLanguageFile: makeMockElement({ value: null }),
    loadLanguageText: makeMockElement({ disabled: false }),
    languageLoaded: { textContent: '' },
    languageDirty: { textContent: '', style: {} },
    languageText: makeMockElement({ value: '' }),
    languageStatus: { textContent: '', className: '' },
    loadModelFile: makeMockElement({ value: null }),
    loadModelText: makeMockElement({ disabled: false }),
    modelLoaded: { textContent: '' },
    modelDirty: { textContent: '', style: {} },
    modelText: makeMockElement({ value: '' }),
    modelStatus: { textContent: '', className: '' },
    downloadLanguage: makeMockElement({ disabled: false }),
    downloadModel: makeMockElement({ disabled: false }),
    downloadSpreadsheet: makeMockElement({ disabled: false }),
    downloadPython: makeMockElement({ disabled: false }),
    log: { textContent: '' },
    graphVariable: makeMockElement({ disabled: false, innerHTML: '', value: '' }),
    graphSortAlphabetically: makeMockElement({ checked: false }),
    graphDepth: makeMockElement({ innerHTML: '', disabled: false, value: '' }),
    graphFitToScreen: makeMockElement({ checked: false }),
    downloadSvg: makeMockElement(),
    downloadPng: makeMockElement(),
    graphDot: { textContent: '' },
    graphDotCopy: makeMockElement(),
    graphSvg: { innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() } },
    variableDropdown: makeMockElement({ innerHTML: '', disabled: false, value: '' }),
    sortVariablesAlpha: makeMockElement({ checked: false }),
    createVariableButton: makeMockElement(),
    deleteVariableButton: makeMockElement(),
    variableDetails: { style: {} },
    variableFormSection: { style: {} },
    selectedVariableName: { textContent: '' },
    selectedVariableFeatures: { textContent: '' },
    variableDefinition: makeMockElement({ value: '' }),
    variableDataType: makeMockElement({ value: '' }),
    spreadsheetPreview: makeMockElement({ innerHTML: '' }),
    ...elements,
  }

  global.document = {
    getElementById: vi.fn((id) => defaults[id] ?? makeMockElement()),
  }
  global.window = { dispatchEvent: vi.fn(), addEventListener: vi.fn() }

  return defaults
}

// ─── shared mock helpers ────────────────────────────────────────────────────

/**
 * Wire the vi.doMock stubs that all exampleApp tests need.
 * `languageEnv` – the value returned by getLanguageEnv() (null = no language).
 */
function mockDependencies(languageEnv = null) {
  vi.doMock('../src/browser/applications/languageApp.js', () => ({
    getLanguageEnv: () => languageEnv,
    commitOrRejectLanguage: vi.fn(),
  }))
  const loadModelFromText = vi.fn()
  vi.doMock('../src/browser/applications/modelApp.js', () => ({ loadModelFromText }))
  return { loadModelFromText }
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('exampleApp', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  describe('refreshExampleVisibility', () => {
    it('immediately hides modelExample when no language is loaded', async () => {
      const modelExampleEl = makeMockElement({ style: { visibility: 'visible' } })
      setupDom({ modelExample: modelExampleEl })
      mockDependencies(null) // no language

      // All HEAD requests pass — so availableModel will be non-empty.
      // The link should still be hidden synchronously before the fetch starts.
      global.fetch = vi.fn(() => Promise.resolve({ ok: true }))

      const { refreshExampleVisibility } = await import('../src/browser/applications/exampleApp.js')

      // Kick off refresh but don't await — we check the synchronous part
      const p = refreshExampleVisibility()
      expect(modelExampleEl.style.visibility).toBe('hidden')

      await p // clean up the pending promise
    })

    it('does NOT immediately hide modelExample when language is loaded', async () => {
      const modelExampleEl = makeMockElement({ style: { visibility: 'visible' } })
      setupDom({ modelExample: modelExampleEl })
      mockDependencies({ lang: 'en' }) // language is set

      global.fetch = vi.fn(() => Promise.resolve({ ok: true }))

      const { refreshExampleVisibility } = await import('../src/browser/applications/exampleApp.js')

      const p = refreshExampleVisibility()
      // Link should still be visible — language IS set
      expect(modelExampleEl.style.visibility).toBe('visible')

      await p
    })
  })

  describe('wireExampleHandlers — loading guard', () => {
    /**
     * Build a DOM world with a language loaded and wire the handlers.
     * `fetchImpl` lets each test control what fetch returns.
     */
    async function setup(fetchImpl) {
      global.fetch = vi.fn(fetchImpl)

      const languageExampleEl = makeMockElement()
      const modelExampleEl = makeMockElement()
      setupDom({ languageExample: languageExampleEl, modelExample: modelExampleEl })

      const { loadModelFromText } = mockDependencies({ lang: 'en' })

      const { wireExampleHandlers } = await import('../src/browser/applications/exampleApp.js')
      await wireExampleHandlers()

      const modelClick = modelExampleEl.addEventListener.mock.calls
        .find(([ev]) => ev === 'click')?.[1]

      return { modelClick, loadModelFromText }
    }

    it('ignores a second click while the first fetch is still in flight', async () => {
      // A fetch that only resolves when we call `unblock()`
      let unblock
      const { modelClick, loadModelFromText } = await setup((_url, opts) => {
        if (opts?.method === 'HEAD') {
          return Promise.resolve({ ok: true }) // HEAD requests resolve immediately
        }
        return new Promise((res) => { unblock = res }) // content fetch blocks
      })

      // First click — starts the slow content fetch
      const p1 = modelClick()
      // Second click while in-flight — should be a no-op
      const p2 = modelClick()

      // Unblock the single in-flight fetch
      unblock({ ok: true, text: () => Promise.resolve('<model/>') })
      await Promise.all([p1, p2])

      // loadModelFromText should only have been called once
      expect(loadModelFromText).toHaveBeenCalledTimes(1)
    })

    it('allows a second click after the first fetch completes', async () => {
      const { modelClick, loadModelFromText } = await setup(
        () => Promise.resolve({ ok: true, text: () => Promise.resolve('<model/>') })
      )

      await modelClick() // first click completes fully
      await modelClick() // second click — guard should have been released

      expect(loadModelFromText).toHaveBeenCalledTimes(2)
    })
  })
})
