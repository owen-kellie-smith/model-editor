import { ui } from "../ui.js";
import { parseXmlOrThrow, enableElement, getObjectFromXML, setElementContent } from "../utils/helpers.js";
import { formatError, formatErrorNoStack, formatLanguageLoaded } from "../format/formatters.js";
import { getFunctionsFromLanguage } from "../domain/language.js";
import { exportFile } from "../utils/export.js";
import { serializeLanguage } from "../domain/serialize.js";

let languageEnv = null;
let languageObj = null;
let validationTimeout = null;
let languageCommitTime = null;
let lastCommittedText = null;

const DEBOUNCE_DELAY = 500; // milliseconds

export function getLanguageEnv() {
  return languageEnv;
}

function setLogText(s) {
  setElementContent(ui.log, s)
}
 


function resetModelInputs() {
  ui.loadModelFile.value = null;
  ui.modelText.value = "";
}

function enableControls(isLoaded) {
  enableElement(ui.loadModelFile, isLoaded);
  enableElement(ui.modelText, isLoaded);
  enableElement(ui.loadModelText, isLoaded);
}

function updateLoadedInfo() {
  if (languageCommitTime) {
    ui.languageLoaded.textContent = `Loaded: ${languageCommitTime.toLocaleString()}`;
  } else {
    ui.languageLoaded.textContent = "";
  }
}

function updateDirtyIndicator() {
  const currentText = ui.languageText.value;
  const isDirty = lastCommittedText !== null && currentText !== lastCommittedText;
  
  if (isDirty) {
    ui.languageDirty.textContent = "✖ Unsaved changes";
    ui.languageDirty.style.display = "inline";
  } else {
    ui.languageDirty.textContent = "";
    ui.languageDirty.style.display = "none";
  }
}

function commitLanguage(lang, obj) {
  languageEnv = lang;
  languageObj = obj;
  languageCommitTime = new Date();
  lastCommittedText = ui.languageText.value;
  
  setLogText(formatLanguageLoaded(lang));
  enableControls(true);
  ui.downloadLanguage.disabled = false;   // ✅
  resetModelInputs();
  updateLanguageStatus("✓ Valid", "success");
  updateLoadedInfo();
  updateDirtyIndicator();
}

function rejectLanguage(er) {
  languageEnv = null;
  languageObj = null;
  setLogText(formatError(er));
  enableControls(false);
  ui.downloadLanguage.disabled = true;    // ❌
  resetModelInputs();
  updateLanguageStatus(er.message, "error");
}

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

function updateLanguageStatus(message, statusClass) {
  ui.languageStatus.textContent = message;
  ui.languageStatus.className = `status ${statusClass}`;
}

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

export function wireLanguageHandlers() {
  // Add input event listener with debouncing
  ui.languageText.addEventListener("input", (e) => {
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

