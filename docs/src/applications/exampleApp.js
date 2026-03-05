import { exampleFiles } from "../exampleFiles.js";
import { ui } from "../ui.js";
import { commitOrRejectLanguage, getLanguageEnv } from "./languageApp.js";
import { loadModelFromText } from "./modelApp.js";

function toFetchPath(path) {
  return path.replace(/^docs\//, "");
}
let availableLanguage = [];
let availableModel = [];

export async function refreshExampleVisibility(){
  // Immediately hide the model example link if no language is loaded.
  // Without this, the link can remain visible during the async HEAD-request
  // phase even after the language env has been cleared, causing clicks to
  // silently do nothing (loadModelFromText returns early when languageEnv is
  // null but shows no feedback to the user).
  if (!getLanguageEnv()) {
    ui.modelExample.style.visibility = "hidden";
  }

  const languageFiles = exampleFiles.filter(f => f.category === "language");
  const modelFiles = exampleFiles.filter(f => f.category === "model");

  const [availLangFlags, availModelFlags] = await Promise.all([
    Promise.all(languageFiles.map(f => isAvailable(f.path))),
    Promise.all(modelFiles.map(f => isAvailable(f.path))),
  ]);

  availableLanguage = languageFiles.filter((_, i) => availLangFlags[i]);
  availableModel = modelFiles.filter((_, i) => availModelFlags[i]);
  
  if (availableLanguage.length > 0) {
    ui.languageExample.style.visibility = "visible";
  }
  if (getLanguageEnv() && availableModel.length > 0) {
    ui.modelExample.style.visibility = "visible";
  } else {
    ui.modelExample.style.visibility = "hidden";
  }

}

async function isAvailable(path) {
  try {
    const res = await fetch(toFetchPath(path), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

function setLinkLoading(element, isLoading) {
  element.style.pointerEvents = isLoading ? "none" : "";
  element.style.cursor = isLoading ? "wait" : "";
}

export async function wireExampleHandlers() {
  await refreshExampleVisibility();
  let languageIndex = -1;
  let modelIndex = -1;
  let languageLoading = false;
  let modelLoading = false;

  ui.languageExample.addEventListener("click", async () => {
    if (availableLanguage.length === 0) return;
    if (languageLoading) return;
    languageLoading = true;
    setLinkLoading(ui.languageExample, true);
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
    } finally {
      languageLoading = false;
      setLinkLoading(ui.languageExample, false);
    }
  });

  ui.modelExample.addEventListener("click", async () => {
    if (availableModel.length === 0) return;
    if (modelLoading) return;
    modelLoading = true;
    setLinkLoading(ui.modelExample, true);
    modelIndex = (modelIndex + 1) % availableModel.length;
    const file = availableModel[modelIndex];
    try {
      const res = await fetch(toFetchPath(file.path));
      if (!res.ok) throw new Error(`Failed to load ${file.path}: ${res.status}`);
      const text = await res.text();
      loadModelFromText(text, file.path.split("/").pop());
    } catch (err) {
      console.error(err);
    } finally {
      modelLoading = false;
      setLinkLoading(ui.modelExample, false);
    }
  });
}
