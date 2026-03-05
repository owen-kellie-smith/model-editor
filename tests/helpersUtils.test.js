/**
 * Tests for docs/src/utils/helpers.js
 * Covers the pure utility functions: sanitizeFilename, escapeHtml,
 * setElementContent, and enableElement.
 */
import { describe, it, expect } from 'vitest'
import {
  sanitizeFilename,
  escapeHtml,
  setElementContent,
  enableElement,
} from '@/utils/helpers.js'

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------
describe('sanitizeFilename', () => {
  it('returns "model" for null / undefined / empty', () => {
    expect(sanitizeFilename(null)).toBe('model')
    expect(sanitizeFilename(undefined)).toBe('model')
    expect(sanitizeFilename('')).toBe('model')
  })

  it('replaces spaces and special chars with underscores', () => {
    expect(sanitizeFilename('my model!')).toBe('my_model')
  })

  it('collapses consecutive underscores', () => {
    expect(sanitizeFilename('a  b')).toBe('a_b')
  })

  it('strips leading and trailing underscores', () => {
    expect(sanitizeFilename(' hello ')).toBe('hello')
  })

  it('leaves alphanumeric characters and hyphens intact', () => {
    expect(sanitizeFilename('my-model_2024')).toBe('my-model_2024')
  })

  it('converts non-string to string first', () => {
    expect(sanitizeFilename(42)).toBe('42')
  })
})

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe('escapeHtml', () => {
  it('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('')
  })

  it('converts non-string values to strings', () => {
    expect(escapeHtml(42)).toBe('42')
    expect(escapeHtml(true)).toBe('true')
  })

  it('escapes & to &amp;', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('escapes < and >', () => {
    expect(escapeHtml('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;')
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;')
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#x27;s')
  })

  it('leaves plain strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })
})

// ---------------------------------------------------------------------------
// setElementContent
// ---------------------------------------------------------------------------
describe('setElementContent', () => {
  it('sets innerHTML when content is a string', () => {
    const el = { innerHTML: '' }
    setElementContent(el, '<b>hi</b>')
    expect(el.innerHTML).toBe('<b>hi</b>')
  })

  it('replaces innerHTML and appends child when content is an Element', () => {
    const child = { nodeType: 1 } // minimal Element-like object
    // Make child look like an Element instance
    Object.setPrototypeOf(child, Element.prototype)

    const appended = []
    const el = {
      innerHTML: 'old content',
      appendChild(c) { appended.push(c) }
    }
    setElementContent(el, child)
    expect(el.innerHTML).toBe('')
    expect(appended).toContain(child)
  })

  it('does nothing for unrecognised content types (number)', () => {
    const el = { innerHTML: 'original' }
    setElementContent(el, 99)
    // innerHTML unchanged
    expect(el.innerHTML).toBe('original')
  })
})

// ---------------------------------------------------------------------------
// enableElement
// ---------------------------------------------------------------------------
describe('enableElement', () => {
  it('enables an element when qualifier is truthy', () => {
    const el = { disabled: true }
    enableElement(el, true)
    expect(el.disabled).toBe(false)
  })

  it('disables an element when qualifier is falsy', () => {
    const el = { disabled: false }
    enableElement(el, false)
    expect(el.disabled).toBe(true)
  })

  it('handles non-boolean truthy qualifier', () => {
    const el = { disabled: true }
    enableElement(el, 'yes')
    expect(el.disabled).toBe(false)
  })
})
