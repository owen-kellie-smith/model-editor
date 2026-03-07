import { ui } from "../ui.js";
import { parseXmlOrThrow, enableElement, getObjectFromXML, setElementContent } from "../../utils/helpers.js";
import { formatError, formatErrorNoStack, formatLanguageLoaded } from "../../utils/formatters.js";
import { getFunctionsFromLanguage } from "../../core/language.js";
import { exportFile } from "../../utils/export.js";
import { serializeLanguage } from "../../core/serialize.js";
import { refreshExampleVisibility } from "./exampleApp.js";
import { saveSession } from "../../utils/persistence.js";
let languageEnv = null;
let languageObj = null;
let validationTimeout = null;
let languageCommitTime = null;
let lastCommittedText = null;

const DEBOUNCE_DELAY = 500; // milliseconds

/**
 * Returns the current language environment, or null if no language has been loaded.
 *
 * @returns {{ functions: Map }|null}
 */
export function getLanguageEnv() {
  return languageEnv;
}

/**
 * Sets the content of the log area in the UI.
 *
 * @param {string|Element} s - The content to display
 * @returns {void}
 */
function setLogText(s) {
  setElementContent(ui.log, s)
}
 


/**
 * Clears the model file input and model textarea, ready for a new model to be loaded.
 *
 * @returns {void}
 */
function resetModelInputs() {
  ui.loadModelFile.value = null;
  ui.modelText.value = "";
}

/**
 * Enables or disables the model-related input controls based on whether a language is loaded.
 *
 * @param {boolean} isLoaded - True if a valid language is loaded; false otherwise
 * @returns {void}
 */
function enableControls(isLoaded) {
  enableElement(ui.loadModelFile, isLoaded);
  enableElement(ui.modelText, isLoaded);
  enableElement(ui.loadModelText, isLoaded);
}

/**
 * Updates the "loaded at" timestamp label for the language panel.
 *
 * @returns {void}
 */
function updateLoadedInfo() {
  if (languageCommitTime) {
    ui.languageLoaded.textContent = `Loaded: ${languageCommitTime.toLocaleString()}`;
  } else {
    ui.languageLoaded.textContent = "";
  }
}

/**
 * Compares the current textarea text against the last committed text and
 * shows or hides the "Unapplied changes" indicator accordingly.
 *
 * @returns {void}
 */
function updateDirtyIndicator() {
  const currentText = ui.languageText.value;
  const isDirty = lastCommittedText !== null && currentText !== lastCommittedText;
  
  if (isDirty) {
    ui.languageDirty.textContent = "✖ Unapplied changes";
    ui.languageDirty.style.display = "inline";
  } else {
    ui.languageDirty.textContent = "";
    ui.languageDirty.style.display = "none";
  }
}

/**
 * Stores the successfully parsed language environment, updates the UI to reflect
 * the loaded state, persists the text to the session, and resets model inputs.
 *
 * @param {{ functions: Map }} lang - The parsed language environment
 * @param {Object} obj - The raw language object from getObjectFromXML
 * @returns {void}
 */
function commitLanguage(lang, obj) {
  languageEnv = lang;
  languageObj = obj;
  languageCommitTime = new Date();
  lastCommittedText = ui.languageText.value;
  
  saveSession({ languageText: ui.languageText.value });
  setLogText(formatLanguageLoaded(lang));
  enableControls(true);
  ui.downloadLanguage.disabled = false;   // ✅
  resetModelInputs();
  refreshExampleVisibility();
  updateLanguageStatus("✓ Valid", "success");
  updateLoadedInfo();
  updateDirtyIndicator();
}

/**
 * Clears the language environment after a parse failure, updates the log with the error,
 * disables model-related controls, and hides example links.
 *
 * @param {Error} er - The parse error
 * @returns {void}
 */
function rejectLanguage(er) {
  languageEnv = null;
  languageObj = null;
  setLogText(formatError(er));
  enableControls(false);
  ui.downloadLanguage.disabled = true;    // ❌
  resetModelInputs();
  refreshExampleVisibility();
  updateLanguageStatus(er.message, "error");
}

/**
 * Attempts to parse and commit a language XML string, calling commitLanguage on success
 * or rejectLanguage on failure.
 *
 * @param {string} text - The raw XML text of the language file
 * @param {string} label - A label used in error messages to identify the source
 * @returns {void}
 */
export function commitOrRejectLanguage(text, label) {
  if (!text) return;
  try {
    const xml = parseXmlOrThrow(text, label);
    const obj = getObjectFromXML(xml);
    const lang = getFunctionsFromLanguage(xml, label);
    commitLanguage(lang, obj);
  } catch (er) {
    rejectLanguage(er);
  }
}

/**
 * Updates the language status indicator with the given message and CSS status class.
 *
 * @param {string} message - The status message to display
 * @param {"success"|"error"} statusClass - CSS class controlling the indicator colour
 * @returns {void}
 */
function updateLanguageStatus(message, statusClass) {
  ui.languageStatus.textContent = message;
  ui.languageStatus.className = `status ${statusClass}`;
}

/**
 * Validates the language XML currently in the textarea and updates the status indicator.
 * Enables or disables the "Load Language" button based on whether the XML is valid.
 *
 * @param {string} text - The current textarea content to validate
 * @returns {void}
 */
function validateLanguageContent(text) {
  if (!text.trim()) {
    updateLanguageStatus("", "error");
    ui.loadLanguageText.disabled = true;
    return;
  }

  try {
    const xml = parseXmlOrThrow(text, "language in textarea");
    const obj = getObjectFromXML(xml);
    getFunctionsFromLanguage(xml, "language in textarea");
    updateLanguageStatus("✓ Valid", "success");
    ui.loadLanguageText.disabled = false;
  } catch (er) {
    updateLanguageStatus(formatErrorNoStack(er), "error");
    ui.loadLanguageText.disabled = true;
  }
}

/**
 * Schedules a deferred call to validateLanguageContent after the user stops typing.
 * Immediately updates the dirty indicator on every keystroke.
 *
 * @param {string} text - The current textarea content
 * @returns {void}
 */
function debouncedValidateLanguage(text) {
  // Clear any pending validation
  if (validationTimeout) {
    clearTimeout(validationTimeout);
  }

  // Update dirty indicator immediately
  updateDirtyIndicator();

  // Set a new timeout
  validationTimeout = setTimeout(() => {
    validateLanguageContent(text);
  }, DEBOUNCE_DELAY);
}

/**
 * Wires all UI event handlers for the language panel (textarea input, file load,
 * load-from-textarea button, and download button).
 *
 * @returns {void}
 */
export function wireLanguageHandlers() {
  // Add input event listener with debouncing
  ui.languageText.addEventListener("input", (e) => {
    saveSession({ languageText: e.target.value });
    debouncedValidateLanguage(e.target.value);
  });

  ui.downloadLanguage.addEventListener("click", () => {
    if (!languageObj) return;
    const xml = serializeLanguage(languageObj);
    exportFile(xml, "exported_language.xml");
    ui.languageText.value = xml;
    lastCommittedText = xml;
    updateDirtyIndicator();
  });
  
  ui.loadLanguageText.addEventListener("click", () => {
    commitOrRejectLanguage(ui.languageText.value.trim(), "language in textarea");
  });

  ui.loadLanguageFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      ui.languageText.value = reader.result;
      commitOrRejectLanguage(reader.result, file.name);
    };
    reader.readAsText(file);
  });
}

/**
 * Restore the language textarea from a persisted session object and
 * automatically commit it so the rest of the UI is ready to use.
 *
 * @param {Object} session - Session object returned by loadSession()
 */
export function restoreLanguageFromSession(session) {
  if (!session.languageText) return;
  ui.languageText.value = session.languageText;
  commitOrRejectLanguage(session.languageText, 'restored session');
}

