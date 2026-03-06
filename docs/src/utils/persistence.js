/**
 * Utilities for persisting user session state to localStorage so that
 * work is not lost if the browser crashes or the tab is accidentally closed.
 */

const STORAGE_KEY = 'modelEditorSession';

/**
 * Merge the supplied data into the stored session object and write it back.
 * Silent on write errors (e.g. private-browsing / storage-quota exceeded).
 *
 * @param {Object} data - Key/value pairs to persist
 */
export function saveSession(data) {
  try {
    const existing = loadSession();
    const merged = { ...existing, ...data };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.warn('Failed to save session to localStorage:', e);
  }
}

/**
 * Read and return the stored session object, or an empty object if nothing
 * is stored or the stored value cannot be parsed.
 *
 * @returns {Object}
 */
export function loadSession() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.warn('Failed to load session from localStorage:', e);
    return {};
  }
}

/**
 * Remove the stored session entirely.
 */
export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear session from localStorage:', e);
  }
}
