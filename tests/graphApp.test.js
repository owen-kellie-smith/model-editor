import { describe, it, expect, vi } from 'vitest'

describe('graphApp', () => {
  describe('graphDotCopy visibility', () => {
    it('graphDotCopy becomes hidden when modelLoaded event fires', async () => {
      const graphDotCopyStyle = { visibility: 'visible' }
      const modelLoadedHandlers = []

      const mockElements = {
        graphDotCopy: { style: graphDotCopyStyle, addEventListener: vi.fn() },
        graphDot: { textContent: '' },
        graphSvg: { innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() } },
        graphVariable: { addEventListener: vi.fn(), disabled: false, innerHTML: '', value: '', appendChild: vi.fn() },
        graphSortAlphabetically: { checked: false, addEventListener: vi.fn() },
        graphDepth: { innerHTML: '', disabled: false, value: '2', addEventListener: vi.fn(), appendChild: vi.fn() },
        graphFitToScreen: { checked: false, addEventListener: vi.fn() },
        downloadSvg: { style: {}, addEventListener: vi.fn() },
        downloadPng: { style: {}, addEventListener: vi.fn() },
      }

      global.document = {
        getElementById: vi.fn((id) => mockElements[id] || { addEventListener: vi.fn(), style: {}, appendChild: vi.fn() }),
        createElement: vi.fn(() => ({ value: '', textContent: '' })),
      }

      global.window = {
        addEventListener: vi.fn((event, handler) => {
          if (event === 'modelLoaded') modelLoadedHandlers.push(handler)
        }),
        dispatchEvent: vi.fn(),
      }

      const { wireGraphHandlers } = await import('../src/browser/applications/graphApp.js')
      wireGraphHandlers()

      // Confirm initially visible before the event fires
      expect(graphDotCopyStyle.visibility).toBe('visible')

      // Fire the modelLoaded event (as wireGraphHandlers registers a listener for it)
      for (const handler of modelLoadedHandlers) handler()

      // graphDotCopy must be hidden after modelLoaded
      expect(graphDotCopyStyle.visibility).toBe('hidden')
    })
  })
})
