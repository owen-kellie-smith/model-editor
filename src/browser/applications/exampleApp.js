import { exampleFiles } from "../exampleFiles.js";
import { ui } from "../ui.js";
import { commitOrRejectLanguage } from "./languageApp.js";
import { loadModelFromText } from "./modelApp.js";

let availableLanguage = [];
let availableModel = [];

/**
 * Refreshes the visibility of the "Load example" links by checking which example
 * files are actually available via HTTP HEAD requests.
 *
 * @returns {Promise<void>}
 */
export async function refreshExampleVisibility(){
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
  if (availableModel.length > 0) {
    ui.modelExample.style.visibility = "visible";
  } else {
    ui.modelExample.style.visibility = "hidden";
  }

}

/**
 * Checks whether a file at the given path is reachable via an HTTP HEAD request.
 *
 * @param {string} path - The URL path to check
 * @returns {Promise<boolean>} Resolves to true if the server returns a 2xx status
 */
async function isAvailable(path) {
  try {
    const res = await fetch(path, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sets or restores normal pointer-events and cursor styling on a link element
 * to indicate a loading / ready state.
 *
 * @param {Element} element - The anchor element to update
 * @param {boolean} isLoading - True to show a wait cursor and disable clicks; false to restore
 * @returns {void}
 */
function setLinkLoading(element, isLoading) {
  element.style.pointerEvents = isLoading ? "none" : "";
  element.style.cursor = isLoading ? "wait" : "";
}

/**
 * Wires click handlers for the "Load example language" and "Load example model" links.
 * Each click cycles through the available example files in round-robin order.
 * Refreshes example link visibility before attaching handlers.
 *
 * @returns {Promise<void>}
 */
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
      const res = await fetch(file.path);
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
      const res = await fetch(file.path);
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
