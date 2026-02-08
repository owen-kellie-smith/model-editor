import { ui } from "../ui.js";
import { parseXmlOrThrow, getObjectFromXML } from "../utils/helpers.js";
import { formatError, formatModelResult } from "../format/formatters.js";
import { getLanguageEnv } from "./languageApp.js";
import { getModelFeatures } from "../domain/model.js";

function setLogText(s) {
  ui.log.textContent = s;
}

function languageEnvIsSet() {
  if (!getLanguageEnv()) {
    setLogText("✖ Load language.xml first.");
    return false;
  }
  return true;
}

function validateModel(text, filename, lang) {
  try {
    const xml = parseXmlOrThrow(text, filename);
    const obj = getObjectFromXML(xml);   // move helper later if needed
    const features = getModelFeatures(obj, lang);
    setLogText(formatModelResult({ features, obj, filename }));
  } catch (er) {
    setLogText(formatError(er));
  }
}

export function wireModelHandlers() {
  ui.loadModelText.addEventListener("click", () => {
    if (!languageEnvIsSet()) return;
    const text = ui.modelText.value.trim();
    if (!text) return;
    validateModel(text, "model in textarea", getLanguageEnv());
  });

  ui.loadModelFile.addEventListener("change", (e) => {
    if (!languageEnvIsSet()) return;

    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      ui.modelText.value = reader.result;
      validateModel(reader.result, file.name, getLanguageEnv());
    };
    reader.readAsText(file);
  });
}

