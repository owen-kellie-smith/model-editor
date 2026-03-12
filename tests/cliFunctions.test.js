import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runFunctions, functionsCommandUsage } from '@/cli/commands/functions.js';
import { standardFunctionDescriptions } from '@/core/language.js';

describe('functions CLI command', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('functionsCommandUsage', () => {
    it('returns a string containing "functions"', () => {
      const usage = functionsCommandUsage();
      expect(typeof usage).toBe('string');
      expect(usage).toContain('functions');
    });
  });

  describe('runFunctions', () => {
    it('returns the standardFunctionDescriptions array', () => {
      const result = runFunctions();
      expect(result).toBe(standardFunctionDescriptions);
    });

    it('prints at least one line per standard function', () => {
      runFunctions();
      // Each function should appear in the console output
      for (const { signature } of standardFunctionDescriptions) {
        const matched = consoleSpy.mock.calls.some(([line]) =>
          typeof line === 'string' && line.includes(signature)
        );
        expect(matched, `expected "${signature}" to appear in console output`).toBe(true);
      }
    });

    it('prints a header line', () => {
      runFunctions();
      const allOutput = consoleSpy.mock.calls.map(([l]) => l).join('\n');
      expect(allOutput).toContain('Built-in standard functions');
    });

    it('output includes sum, min, max, floor, if', () => {
      runFunctions();
      const allOutput = consoleSpy.mock.calls.map(([l]) => l).join('\n');
      expect(allOutput).toContain('sum(');
      expect(allOutput).toContain('min(');
      expect(allOutput).toContain('max(');
      expect(allOutput).toContain('floor(');
      expect(allOutput).toContain('if(');
    });

    it('mentions index set in the sum description', () => {
      runFunctions();
      const allOutput = consoleSpy.mock.calls.map(([l]) => l).join('\n');
      expect(allOutput).toContain('indexSet');
    });

    it('prints a trailing note about no declaration needed', () => {
      runFunctions();
      const allOutput = consoleSpy.mock.calls.map(([l]) => l).join('\n');
      expect(allOutput).toContain('without any declaration');
    });

    it('accepts and ignores CLI args (no args required)', () => {
      expect(() => runFunctions({ positional: [], options: {} })).not.toThrow();
    });
  });
});
