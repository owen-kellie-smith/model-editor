import { exampleFiles } from "../exampleFiles.js";
import { ui } from "../ui.js";
import { commitOrRejectLanguage, getLanguageEnv } from "./languageApp.js";
import { loadModelFromText } from "./modelApp.js";

function toFetchPath(path) {
  return path.replace(/^docs\//, "");
}

async function isAvailable(path) {
  try {
    const res = await fetch(toFetchPath(path), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function wireExampleHandlers() {
  const languageFiles = exampleFiles.filter(f => f.category === "language");
  const modelFiles = exampleFiles.filter(f => f.category === "model");

  const [availLangFlags, availModelFlags] = await Promise.all([
    Promise.all(languageFiles.map(f => isAvailable(f.path))),
    Promise.all(modelFiles.map(f => isAvailable(f.path))),
  ]);

  const availableLanguage = languageFiles.filter((_, i) => availLangFlags[i]);
  const availableModel = modelFiles.filter((_, i) => availModelFlags[i]);

  if (availableLanguage.length > 0) {
    ui.languageExample.style.visibility = "visible";
  }
  if (getLanguageEnv() && availableModel.length > 0) {
    ui.modelExample.style.visibility = "visible";
  }

  let languageIndex = -1;
  let modelIndex = -1;

  ui.languageExample.addEventListener("click", async () => {
    if (availableLanguage.length === 0) return;
    languageIndex = (languageIndex + 1) % availableLanguage.length;
    const file = availableLanguage[languageIndex];
    try {
      const res = await fetch(toFetchPath(file.path));
      if (!res.ok) throw new Error(`Failed to load ${file.path}: ${res.status}`);
      const text = await res.text();
      ui.languageText.value = text;
      commitOrRejectLanguage(text, file.path.split("/").pop());
    } catch (err) {
      console.error(err);
    }
  });

  ui.modelExample.addEventListener("click", async () => {
    if (availableModel.length === 0) return;
    modelIndex = (modelIndex + 1) % availableModel.length;
    const file = availableModel[modelIndex];
    try {
      const res = await fetch(toFetchPath(file.path));
      if (!res.ok) throw new Error(`Failed to load ${file.path}: ${res.status}`);
      const text = await res.text();
      loadModelFromText(text, file.path.split("/").pop());
    } catch (err) {
      console.error(err);
    }
  });
}
