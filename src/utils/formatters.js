import {
  getStringfromObject,
  getObjectFromMap,
  getObjectFromMapOfSets,
} from "./helpers.js";
import { log } from "./logger.js";

/**
 * Formats a caught Error into a multi-line string including the stack trace and optional context.
 *
 * @param {Error} err - The error to format
 * @returns {string} A human-readable error string
 */
export function formatError(err) {
  const lines = ["✖ Validation error:", err.message + " in " + err.stack];
  if (err.context) {
    lines.push("", "Context:", getStringfromObject(err.context));
  }
    return lines.join("\n");
}

/**
 * Formats a caught Error into a multi-line string without the stack trace.
 * Suitable for display in the status bar where brevity is preferred.
 *
 * @param {Error} err - The error to format
 * @returns {string} A concise human-readable error string
 */
export function formatErrorNoStack(err) {
  const lines = [err.message ];
  if (err.context) {
    lines.push("", "Context:", getStringfromObject(err.context));
  }
  return lines.join("\n");
}

/**
 * Formats a successfully loaded language environment into a display string.
 *
 * @param {{ functions: Map }} lang - The language environment from getFunctionsFromLanguage
 * @returns {string} A summary string listing the loaded functions
 */
export function formatLanguageLoaded(lang) {
  return (
    "Language loaded:\n " +
    getStringfromObject({ functions: Object.fromEntries(lang.functions) })
  );
}

/**
 * Formats a validated model result into a DOM Element for display in the log area.
 *
 * @param {{ features: Object, obj: Object, filename: string }} modelResult - Result from validateModelCore
 * @returns {Element} A `<div>` element containing an HTML summary of the model
 */
export function formatModelResult({ features, obj, filename }) {
  return formatModelResultHTML({ features, obj, filename });
}

/**
 * Recursively adds `<li>` elements to a list element for each entry in a group.
 * Handles arrays, plain objects, and primitive values.
 *
 * @param {Element} el - The list element (`<ul>` or `<ol>`) to append items to
 * @param {Array|Object|*} group - The data to iterate over
 * @param {string|null} [parentKey=null] - The key of the parent entry (unused, kept for recursion context)
 * @returns {void}
 */
function addListElements(el, group, parentKey = null) {
  let items;
  if (Array.isArray(group)) {
    items = group.map((item, index) => ({ key: index, value: item }));
  } else if (typeof group === 'object' && group !== null) {
    items = Object.entries(group).map(([key, value]) => ({ key, value }));
  } else {
    return;
  }

  items.forEach(({ key, value: element }) => {
    const li = document.createElement("li");

    if (typeof element === 'object' && element !== null &&
        !(element instanceof Date) && !(element instanceof RegExp)) {
      let label = key + ": ";
      if (Array.isArray(element)) {
        label += `[Array: ${element.length} items]`;
      } else {
        label += JSON.stringify(element);
      }
      li.textContent = label;
      const ul = document.createElement("ul");
      addListElements(ul, element, key);
      li.appendChild(ul);
    } else {
      li.textContent = `${key}: ${element}`;
    }

    el.appendChild(li);
  });
}

/**
 * Appends a labelled section (heading + ordered list) to a container element.
 *
 * @param {Element} trunk - The container element to append to
 * @param {string} label - The section heading text
 * @param {Array|Object} group - The data to display as a list
 * @returns {void}
 */
function appendModelResultSection(trunk, label, group){
  const h = document.createElement("h3");
  h.textContent = label;
  trunk.appendChild(h)
  const list = document.createElement("ol");
  addListElements(list, group);
  trunk.appendChild(list);
}

/**
 * Builds a `<div>` Element summarising a validated model result for display in the log area.
 * Includes sections for index sets, variables, outgoing/incoming maps, and the raw model object.
 *
 * @param {{ features: Object, obj: Object, filename: string }} param0
 * @returns {Element} A `<div>` element containing the formatted model summary
 */
function formatModelResultHTML({ features, obj, filename }) {
  const {
    indexSets,
    variables,
    resolvedVarsWithArguments,
    incoming,
    outgoing,
  } = features;

  const d = document.createElement("div");
  const p = document.createElement("p");
  p.innerText = "✔ Model is structurally valid";
  d.appendChild(p);
  appendModelResultSection(d,"Index sets",indexSets);
  appendModelResultSection(d,"Variables",variables);
  appendModelResultSection(d,"Outgoing variables",getObjectFromMapOfSets(outgoing));
  appendModelResultSection(d,"Incoming variables",getObjectFromMapOfSets(incoming));
  appendModelResultSection(d,"Resolved variables",getObjectFromMap(resolvedVarsWithArguments));
  appendModelResultSection(d,`${filename} as object`,obj);

  return d;
}

