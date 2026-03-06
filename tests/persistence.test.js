import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveSession, loadSession, clearSession } from '../src/utils/persistence.js';

// Provide a simple in-memory localStorage mock for the test environment.
function makeLocalStorageMock() {
  let store = {};
  return {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    _store: () => store,
  };
}

describe('persistence', () => {
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = makeLocalStorageMock();
    global.localStorage = localStorageMock;
  });

  describe('saveSession', () => {
    it('writes data to localStorage as JSON', () => {
      saveSession({ languageText: '<language/>' });
      expect(localStorageMock.setItem).toHaveBeenCalledOnce();
      const [key, value] = localStorageMock.setItem.mock.calls[0];
      expect(key).toBe('modelEditorSession');
      expect(JSON.parse(value)).toEqual({ languageText: '<language/>' });
    });

    it('merges new data with existing stored data', () => {
      // Pre-populate the store via saveSession itself
      saveSession({ languageText: 'old' });

      saveSession({ modelText: '<model/>' });

      // The latest written value should contain both keys
      const lastCall = localStorageMock.setItem.mock.calls.at(-1);
      expect(JSON.parse(lastCall[1])).toEqual({
        languageText: 'old',
        modelText: '<model/>',
      });
    });

    it('overwrites the same key with a new value', () => {
      saveSession({ graphDepth: '2' });
      saveSession({ graphDepth: '5' });

      const lastCall = localStorageMock.setItem.mock.calls.at(-1);
      expect(JSON.parse(lastCall[1]).graphDepth).toBe('5');
    });

    it('does not throw when localStorage is unavailable', () => {
      global.localStorage = {
        getItem: vi.fn(() => { throw new Error('no storage'); }),
        setItem: vi.fn(() => { throw new Error('no storage'); }),
        removeItem: vi.fn(),
      };
      expect(() => saveSession({ x: 1 })).not.toThrow();
    });
  });

  describe('loadSession', () => {
    it('returns an empty object when nothing is stored', () => {
      expect(loadSession()).toEqual({});
    });

    it('returns the stored session object', () => {
      const data = { languageText: '<lang/>', modelText: '<model/>' };
      localStorageMock.setItem('modelEditorSession', JSON.stringify(data));
      expect(loadSession()).toEqual(data);
    });

    it('returns an empty object when the stored value is invalid JSON', () => {
      localStorageMock.setItem('modelEditorSession', 'not-valid-json{{');
      expect(loadSession()).toEqual({});
    });

    it('does not throw when localStorage is unavailable', () => {
      global.localStorage = {
        getItem: vi.fn(() => { throw new Error('no storage'); }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      expect(() => loadSession()).not.toThrow();
      expect(loadSession()).toEqual({});
    });
  });

  describe('clearSession', () => {
    it('removes the session key from localStorage', () => {
      localStorageMock.setItem('modelEditorSession', JSON.stringify({ foo: 'bar' }));
      clearSession();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('modelEditorSession');
    });

    it('does not throw when localStorage is unavailable', () => {
      global.localStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(() => { throw new Error('no storage'); }),
      };
      expect(() => clearSession()).not.toThrow();
    });
  });

  describe('round-trip', () => {
    it('saves and loads a full session correctly', () => {
      const fullSession = {
        languageText: '<language/>',
        modelText: '<model/>',
        graphVariable: 'MY_VAR',
        graphDepth: '3',
        graphFitToScreen: true,
        graphSortAlphabetically: false,
        sortVariablesAlpha: true,
        currentSelectedVariableId: 'MY_VAR',
        focusedVariables: ['MY_VAR', 'OTHER_VAR'],
        detailsOpen: {
          languageDetails: true,
          modelDetails: false,
          spreadsheetPreviewDetails: false,
          variablesDetails: true,
          dependenciesDetails: false,
          reportDetails: false,
        },
      };

      // Save in two separate calls to test merging
      saveSession({ languageText: fullSession.languageText });
      saveSession({ modelText: fullSession.modelText });
      saveSession({
        graphVariable: fullSession.graphVariable,
        graphDepth: fullSession.graphDepth,
        graphFitToScreen: fullSession.graphFitToScreen,
        graphSortAlphabetically: fullSession.graphSortAlphabetically,
        sortVariablesAlpha: fullSession.sortVariablesAlpha,
        currentSelectedVariableId: fullSession.currentSelectedVariableId,
        focusedVariables: fullSession.focusedVariables,
        detailsOpen: fullSession.detailsOpen,
      });

      expect(loadSession()).toEqual(fullSession);

      // Clearing removes all data
      clearSession();
      expect(loadSession()).toEqual({});
    });
  });
});
