import { exampleFiles } from "../exampleFiles.js";
import { ui } from "../ui.js";
import { loadModelFromText } from "./modelApp.js";

let availableModel = [];

/**
 * Refreshes the visibility of the "Load example" links by checking which example
 * files are actually available via HTTP HEAD requests.
 *
 * @returns {Promise<void>}
 */
export async function refreshExampleVisibility(){
  const modelFiles = exampleFiles.filter(f => f.category === "model");

  const availModelFlags = await Promise.all(modelFiles.map(f => isAvailable(f.path)));

  availableModel = modelFiles.filter((_, i) => availModelFlags[i]);
  
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
 * Wires click handlers for the "Load example model" link.
 * Each click cycles through the available example files in round-robin order.
 * Refreshes example link visibility before attaching handlers.
 *
 * @returns {Promise<void>}
 */
export async function wireExampleHandlers() {
  await refreshExampleVisibility();
  let modelIndex = -1;
  let modelLoading = false;

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
