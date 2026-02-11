import { ui } from "../ui.js";
import { parseXmlOrThrow, enableElement, getObjectFromXML } from "../utils/helpers.js";
import { formatError, formatLanguageLoaded } from "../format/formatters.js";
import { getFunctionsFromLanguage } from "../domain/language.js";
import { exportFile } from "../utils/export.js";
import { serializeLanguage } from "../domain/serialize.js";

let languageEnv = null;
let languageObj = null;

export function getLanguageEnv() {
  return languageEnv;
}

function setLogText(s) {
  ui.log.textContent = s;
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

function commitLanguage(lang, obj) {
  languageEnv = lang;
  languageObj = obj;
  setLogText(formatLanguageLoaded(lang));
  enableControls(true);
  ui.downloadLanguage.disabled = false;   // ✅
  resetModelInputs();
}

function rejectLanguage(er) {
  languageEnv = null;
  languageObj = null;
  setLogText(formatError(er));
  enableControls(false);
  ui.downloadLanguage.disabled = true;    // ❌
  resetModelInputs();
}

function commitOrRejectLanguage(text, label) {
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

export function wireLanguageHandlers() {
  ui.downloadLanguage.addEventListener("click", () => {
    if (!languageObj) return;
    const xml = serializeLanguage(languageObj);
    exportFile(xml, "exported_language.xml");
    ui.languageText.value = xml;
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

