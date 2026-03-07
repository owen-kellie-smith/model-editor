import { ui } from "../ui.js";
import { formatError, formatErrorNoStack, formatModelResult } from "../../utils/formatters.js";
import { getLanguageEnv } from "./languageApp.js";
import { validateModelCore } from "../../core/model.js";
import { exportFile } from "../../utils/export.js";
import { serializeModel } from "../../core/serialize.js";
import { renderModelAsExcel, renderModelAsHTMLPreview, makeRenderContext } from "../../core/spreadsheetRenderer.js";
import { renderModelAsPython } from "../../core/pythonRenderer.js";
import { setElementContent, sanitizeFilename } from "../../utils/helpers.js";
import { saveSession } from "../../utils/persistence.js";


let modelEnv = null;
let modelValidationTimeout = null;
let validationTimeout = null;
let modelCommitTime = null;
let lastCommittedText = null;
let activePreviewCohortId = 1;


const DEBOUNCE_DELAY = 500; // milliseconds

/**
 * Returns the current model environment, or null if no model has been loaded.
 *
 * @returns {{ features: Object, obj: Object, filename: string }|null}
 */
export function getModelEnv() {
  return modelEnv;
}

/**
 * Replaces the current model environment and fires a `modelLoaded` window event
 * so that other UI components (graph, variable list, etc.) can refresh.
 *
 * @param {{ features: Object, obj: Object, filename: string }} newModelEnv - The new model environment
 * @returns {void}
 */
export function setModelEnv(newModelEnv) {
  modelEnv = newModelEnv;
  modelCommitTime = new Date();
  updateLoadedInfo();
  
  // Trigger modelLoaded event so other components can update
  window.dispatchEvent(new CustomEvent('modelLoaded'));
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
 * Returns false and shows an error in the log if the language environment has not been loaded.
 * Used as a guard before model operations that require a language.
 *
 * @returns {boolean} True if the language is loaded; false otherwise
 */
function languageEnvIsSet() {
  if (!getLanguageEnv()) {
    setLogText("✖ Load language.xml first.");
    return false;
  }
  return true;
}

/**
 * Updates the "loaded at" timestamp label for the model panel.
 *
 * @returns {void}
 */
function updateLoadedInfo() {
  if (modelCommitTime) {
    ui.modelLoaded.textContent = `Loaded: ${modelCommitTime.toLocaleString()}`;
  } else {
    ui.modelLoaded.textContent = "";
  }
}

/**
 * Compares the current model textarea text against the last committed text and
 * shows or hides the "Unapplied changes" indicator accordingly.
 *
 * @returns {void}
 */
function updateDirtyIndicator() {
  const isDirty = lastCommittedText !== null && ui.modelText.value.trim() !== lastCommittedText;
  
  if (isDirty) {
    ui.modelDirty.textContent = "✖ Unapplied changes";
    ui.modelDirty.style.display = "inline";
  } else {
    ui.modelDirty.textContent = "";
    ui.modelDirty.style.display = "none";
  }
}

/**
 * Validates the given XML model text, updates the log, model environment, status indicator,
 * spreadsheet preview, and dispatches a `modelLoaded` event on success.
 * On failure, clears the model environment and disables export buttons.
 *
 * @param {string} text - The raw XML model text to validate
 * @param {string} filename - Label used in error messages to identify the source
 * @param {Object} lang - Language environment (from getLanguageEnv)
 * @returns {void}
 */
export function validateModel(text, filename, lang) {
  try {
    text = text.trim();
    const result = validateModelCore(text, filename, lang);
    setLogText(formatModelResult(result));
    modelEnv = result;
    modelCommitTime = new Date();
    lastCommittedText = text;
    saveSession({ modelText: text });
    ui.downloadModel.disabled = false;   // ✅ valid
    ui.downloadSpreadsheet.disabled = false;  // ✅ enable spreadsheet download
    ui.downloadPython.disabled = false;  // ✅ enable python export
    updateModelStatus("✓ Valid", "success");
    updateLoadedInfo();
    updateDirtyIndicator();
    
    // Render HTML spreadsheet preview
    try {
      const ctx = makeRenderContext({ cohortId: activePreviewCohortId });
      ui.spreadsheetPreview.innerHTML = renderModelAsHTMLPreview(result.obj, result.features, ctx);
      ui.spreadsheetPreviewDetails.open = true;
    } catch (previewErr) {
      ui.spreadsheetPreview.innerHTML = '';
      console.warn("Spreadsheet preview failed:", previewErr);
    }
    
    // Dispatch event for graph UI
    window.dispatchEvent(new CustomEvent('modelLoaded'));
  } catch (er) {
    setLogText(formatError(er));
    modelEnv = null;
    ui.downloadModel.disabled = true;    // ❌ invalid
    ui.downloadSpreadsheet.disabled = true;  // ❌ disable spreadsheet download
    ui.downloadPython.disabled = true;  // ❌ disable python export
    ui.spreadsheetPreview.innerHTML = '';
    updateModelStatus(formatErrorNoStack(er), "error");
    updateDirtyIndicator();  // ✅ ADD THIS - also update on error
  }
}
/**
 * Validates the model XML currently in the textarea and updates the status indicator.
 * Enables or disables the "Load Model" button based on whether the XML is valid.
 * Also updates the log with the current model information or the validation error.
 *
 * @param {string} text - The current textarea content to validate
 * @param {Object} lang - Language environment (from getLanguageEnv)
 * @returns {void}
 */
function validateModelContent(text, lang) {
  if (!text.trim()) {
    updateModelStatus("", "error");
    ui.loadModelText.disabled = true;
    return;
  }
  try {
    const result = validateModelCore(text, "model in textarea", lang);
    updateModelStatus("✓ Valid", "success");
    ui.loadModelText.disabled = false;
    // Update the Report/Log with the current model information
    setLogText(formatModelResult(result));
  } catch (er) {
    updateModelStatus(formatErrorNoStack(er), "error");  
    ui.loadModelText.disabled = true;
    // Update the Report/Log with the error
    setLogText(formatError(er));
  }
}

/**
 * Updates the model status indicator with the given message and CSS status class.
 *
 * @param {string} message - The status message to display
 * @param {"success"|"error"} statusClass - CSS class controlling the indicator colour
 * @returns {void}
 */
function updateModelStatus(message, statusClass) {
  ui.modelStatus.textContent = message;
  ui.modelStatus.className = `status ${statusClass}`;
}

/**
 * Schedules a deferred call to validateModelContent after the user stops typing.
 * Immediately updates the dirty indicator on every keystroke.
 *
 * @param {string} text - The current textarea content
 * @param {Object} lang - Language environment (from getLanguageEnv)
 * @returns {void}
 */
function debouncedValidateModel(text, lang) {
  // Clear any pending validation
  if (validationTimeout) {
    clearTimeout(validationTimeout);
  }

  // Update dirty indicator immediately
  updateDirtyIndicator();  // ✅ ADD THIS

  // Set a new timeout
  validationTimeout = setTimeout(() => {
    validateModelContent(text, lang);
  }, DEBOUNCE_DELAY);
}

/**
 * Update the model textarea with the current serialized model
 * and refresh the last loaded date.
 * This should be called after CRUD operations on single variables.
 * @export
 */
export function updateModelTextareaAndDate() {
  if (!modelEnv) {
    console.warn("Cannot update model textarea: no model loaded");
    return;
  }
  
  try {
    // Serialize the current model
    const xml = serializeModel(modelEnv.obj);
    const trimmedXml = xml.trim();
    
    // Update the textarea
    ui.modelText.value = trimmedXml;
    
    // Update the last committed text to match
    lastCommittedText = trimmedXml;
    
    // Refresh the loaded date to current time
    modelCommitTime = new Date();
    updateLoadedInfo();
    
    // Update dirty indicator (should show clean state now)
    updateDirtyIndicator();
    
    // Log the update
    console.log("Model textarea and date updated after variable edit");
  } catch (error) {
    console.error("Error updating model textarea:", error);
  }
}

/**
 * Loads a model from a text string by populating the textarea and calling validateModel.
 * Does nothing if no language is loaded.
 *
 * @param {string} text - The raw XML model text
 * @param {string} filename - Label used in error messages to identify the source
 * @returns {void}
 */
export function loadModelFromText(text, filename) {
  if (!languageEnvIsSet()) return;
  ui.modelText.value = text;
  validateModel(text, filename, getLanguageEnv());
}

/**
 * Wires all UI event handlers for the model panel (textarea input, file load,
 * load-from-textarea button, download buttons, and spreadsheet preview cohort selector).
 *
 * @returns {void}
 */
export function wireModelHandlers() {
  // Add input event listener with debouncing
  ui.modelText.addEventListener("input", (e) => {
    if (!languageEnvIsSet()) return;
    saveSession({ modelText: e.target.value });
    debouncedValidateModel(e.target.value,getLanguageEnv());
  });


  // Spreadsheet preview: click a cohort ID in input_cohort_data to switch the active cohort (single-cohort eval)
  ui.spreadsheetPreview.addEventListener('click', (e) => {
    const link = e.target.closest?.('[data-cohort]')
    if (!link) return
    e.preventDefault()

    const next = Number(link.getAttribute('data-cohort'))
    if (!Number.isFinite(next)) return

    activePreviewCohortId = next

    // Re-render preview for the selected cohort (do not revalidate)
    if (!modelEnv) return
    try {
      const ctx = makeRenderContext({ cohortId: activePreviewCohortId })
      ui.spreadsheetPreview.innerHTML = renderModelAsHTMLPreview(modelEnv.obj, modelEnv.features, ctx)
      ui.spreadsheetPreviewDetails.open = true
    } catch (err) {
      console.warn('Spreadsheet preview re-render failed:', err)
    }
  })
 

  ui.downloadModel.addEventListener("click", () => {
    if (!modelEnv) return;
    const xml = serializeModel(modelEnv.obj);
    exportFile(xml, "exported_model.xml");
    ui.modelText.value = xml.trim();
    lastCommittedText = xml.trim();
    updateDirtyIndicator();
  });
  
  ui.downloadSpreadsheet.addEventListener("click", async () => {
    if (!modelEnv) return;
    try {
      const blob = await renderModelAsExcel(modelEnv.obj, modelEnv.features);
      
      // Download the blob as a file
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "model_spreadsheet.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Error rendering spreadsheet: " + error.message + ". See console for stack trace.");
      console.error("Spreadsheet rendering error:", error);
    }
  });

  ui.downloadPython.addEventListener("click", () => {
    if (!modelEnv) return;
    try {
      const code = renderModelAsPython(modelEnv.obj, modelEnv.features);
      const modelId = sanitizeFilename(modelEnv.obj?.model?.id);
      const pyPath = `${modelId}.py`;
      exportFile(code, pyPath, "text/x-python");
    } catch (error) {
      alert("Error exporting Python: " + error.message + ". See console for stack trace.");
      console.error("Python   export error:", error);
    }
  });
  
  ui.loadModelText.addEventListener("click", () => {
    if (!languageEnvIsSet()) return;
    const text = ui.modelText.value.trim();
    if (!text) return;
    validateModel(text, "model in textarea", getLanguageEnv());
    updateDirtyIndicator();
  });

  ui.loadModelFile.addEventListener("change", (e) => {
    if (!languageEnvIsSet()) return;

    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      ui.modelText.value = reader.result;
      validateModel(reader.result, file.name, getLanguageEnv());
      updateDirtyIndicator();
    };
    reader.readAsText(file);
  });
}

/**
 * Restore the model textarea from a persisted session object and
 * automatically validate/commit it so the rest of the UI is ready to use.
 * Requires the language to already be loaded.
 *
 * @param {Object} session - Session object returned by loadSession()
 */
export function restoreModelFromSession(session) {
  if (!session.modelText) return;
  loadModelFromText(session.modelText, 'restored session');
}

