import { ui } from "../ui.js";
import { formatError, formatErrorNoStack, formatModelResult } from "../format/formatters.js";
import { getLanguageEnv } from "./languageApp.js";
import { validateModelCore } from "../domain/model.js";
import { exportFile } from "../utils/export.js";
import { serializeModel } from "../domain/serialize.js";
import { renderModelAsExcel } from "../domain/spreadsheetRenderer.js";
import { setElementContent } from "../utils/helpers.js";


let modelEnv = null;
let modelValidationTimeout = null;
let validationTimeout = null;
let modelCommitTime = null;
let lastCommittedText = null;

const DEBOUNCE_DELAY = 500; // milliseconds

export function getModelEnv() {
  return modelEnv;
}

export function setModelEnv(newModelEnv) {
  modelEnv = newModelEnv;
  modelCommitTime = new Date();
  updateLoadedInfo();
  
  // Trigger modelLoaded event so other components can update
  window.dispatchEvent(new CustomEvent('modelLoaded'));
}

function setLogText(s) {
  setElementContent(ui.log, s)
}

function languageEnvIsSet() {
  if (!getLanguageEnv()) {
    setLogText("✖ Load language.xml first.");
    return false;
  }
  return true;
}

function updateLoadedInfo() {
  if (modelCommitTime) {
    ui.modelLoaded.textContent = `Loaded: ${modelCommitTime.toLocaleString()}`;
  } else {
    ui.modelLoaded.textContent = "";
  }
}

function updateDirtyIndicator() {
  const currentText = ui.modelText.value.trim();
  const isDirty = lastCommittedText !== null && currentText !== lastCommittedText;
  
  if (isDirty) {
    ui.modelDirty.textContent = "✖ Unsaved changes";
    ui.modelDirty.style.display = "inline";
  } else {
    ui.modelDirty.textContent = "";
    ui.modelDirty.style.display = "none";
  }
}

function validateModel(text, filename, lang) {
  try {
    text = text.trim();
    const result = validateModelCore(text, filename, lang);
    setLogText(formatModelResult(result));
    modelEnv = result;
    modelCommitTime = new Date();
    lastCommittedText = text;
    ui.downloadModel.disabled = false;   // ✅ valid
    ui.downloadSpreadsheet.disabled = false;  // ✅ enable spreadsheet download
    updateModelStatus("✓ Valid", "success");
    updateLoadedInfo();
    updateDirtyIndicator();
    
    // Dispatch event for graph UI
    window.dispatchEvent(new CustomEvent('modelLoaded'));
  } catch (er) {
    setLogText(formatError(er));
    modelEnv = null;
    ui.downloadModel.disabled = true;    // ❌ invalid
    ui.downloadSpreadsheet.disabled = true;  // ❌ disable spreadsheet download
    updateModelStatus(formatErrorNoStack(er), "error");
    updateDirtyIndicator();  // ✅ ADD THIS - also update on error
  }
}
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

function updateModelStatus(message, statusClass) {
  ui.modelStatus.textContent = message;
  ui.modelStatus.className = `status ${statusClass}`;
}

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

export function wireModelHandlers() {
  // Add input event listener with debouncing
  ui.modelText.addEventListener("input", (e) => {
    if (!languageEnvIsSet()) return;
    debouncedValidateModel(e.target.value,getLanguageEnv());
  });

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
      alert("Error rendering spreadsheet: " + error.message);
      console.error("Spreadsheet rendering error:", error);
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
