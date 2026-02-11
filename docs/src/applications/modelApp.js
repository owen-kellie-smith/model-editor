import { ui } from "../ui.js";
import { formatError, formatModelResult } from "../format/formatters.js";
import { getLanguageEnv } from "./languageApp.js";
import { validateModelCore } from "../domain/model.js";
import { exportFile } from "../utils/export.js";

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
    const result = validateModelCore(text, filename, lang);
    setLogText(formatModelResult(result));
    ui.downloadModel.disabled = false;   // ✅ valid
  } catch (er) {
    setLogText(formatError(er));
    ui.downloadModel.disabled = true;    // ❌ invalid
  }
}

export function wireModelHandlers() {
  ui.downloadModel.addEventListener("click", () => {
    exportFile(ui.modelText.value, "exported_model.xml");
  });
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

