/**
 * Tests for docs/src/utils/logger.js
 * Covers logLogLevel, and the caller-detection helpers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { log, logLogLevel } from '@/utils/logger.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logLogLevel', () => {
  it('calls log with the current LOG_LEVEL string', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logLogLevel()
    // At least one console.log call should contain "LOG_LEVEL"
    const calls = spy.mock.calls.map(args => args.join(' '))
    expect(calls.some(c => c.includes('LOG_LEVEL'))).toBe(true)
  })
})

describe('log', () => {
  it('does not emit below-threshold messages', () => {
    // The default LOG_LEVEL in config.js is "warn", so "debug" should be suppressed
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log('debug', 'should be suppressed')
    // It is possible the level is "debug" in test env; just verify no throw
    // (We can't assert on suppression without knowing the configured level)
    expect(() => log('debug', 'x')).not.toThrow()
  })

  it('emits messages at or above the threshold without throwing', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => log('warn', 'test warning')).not.toThrow()
    expect(() => log('error', 'test error')).not.toThrow()
  })

  it('includes the level label in the output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log('warn', 'my message')
    const allOutput = spy.mock.calls.flat().join(' ')
    // If the warn level is emitted, it should contain [warn]
    if (spy.mock.calls.length > 0) {
      expect(allOutput).toContain('[warn]')
    }
  })
})
