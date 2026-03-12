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
    loadModelFile: makeMockElement({ value: null }),
    loadModelText: makeMockElement({ disabled: false }),
    modelLoaded: { textContent: '' },
    modelDirty: { textContent: '', style: {} },
    modelText: makeMockElement({ value: '' }),
    modelStatus: { textContent: '', className: '' },
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
 */
function mockDependencies() {
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
    it('shows modelExample when model files are available', async () => {
      const modelExampleEl = makeMockElement({ style: { visibility: 'hidden' } })
      setupDom({ modelExample: modelExampleEl })
      mockDependencies()

      global.fetch = vi.fn(() => Promise.resolve({ ok: true }))

      const { refreshExampleVisibility } = await import('../src/browser/applications/exampleApp.js')

      await refreshExampleVisibility()
      // Model example should be visible when files are available
      expect(modelExampleEl.style.visibility).toBe('visible')
    })

    it('hides modelExample when no model files are available', async () => {
      const modelExampleEl = makeMockElement({ style: { visibility: 'visible' } })
      setupDom({ modelExample: modelExampleEl })
      mockDependencies()

      // HEAD requests always fail — no files available
      global.fetch = vi.fn(() => Promise.resolve({ ok: false }))

      const { refreshExampleVisibility } = await import('../src/browser/applications/exampleApp.js')

      await refreshExampleVisibility()
      expect(modelExampleEl.style.visibility).toBe('hidden')
    })
  })

  describe('wireExampleHandlers — loading guard', () => {
    /**
     * Build a DOM world and wire the handlers.
     * `fetchImpl` lets each test control what fetch returns.
     */
    async function setup(fetchImpl) {
      global.fetch = vi.fn(fetchImpl)

      const modelExampleEl = makeMockElement()
      setupDom({ modelExample: modelExampleEl })

      const { loadModelFromText } = mockDependencies()

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
