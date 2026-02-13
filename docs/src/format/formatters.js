import {
  getStringfromObject,
  getObjectFromMap,
  getObjectFromMapOfSets,
} from "../utils/helpers.js";
import { log } from "../utils/logger.js";

export function formatError(err) {
  const lines = ["✖ Validation error:", err.message + " in " + err.stack];
  if (err.context) {
    lines.push("", "Context:", getStringfromObject(err.context));
  }
    return lines.join("\n");
}

export function formatErrorNoStack(err) {
  const lines = [err.message ];
  if (err.context) {
    lines.push("", "Context:", getStringfromObject(err.context));
  }
  return lines.join("\n");
}

export function formatLanguageLoaded(lang) {
  return (
    "Language loaded:\n " +
    getStringfromObject({ functions: Object.fromEntries(lang.functions) })
  );
}

export function formatModelResult({ features, obj, filename }) {
  return formatModelResultHTML({ features, obj, filename });
}

function formatModelResultText({ features, obj, filename }) {
  const {
    indexSets,
    variables,
    resolvedVarsWithArguments,
    precedents,
  } = features;

  return [
    "✔ Model is structurally valid",
    "",
    "Index sets:",
    indexSets.join(", ") || "(none)",
    "",
    "Variables:",
    variables.join(", ") || "(none)",
    "",
    "Precedents:",
    getStringfromObject(getObjectFromMapOfSets(precedents)),
    "",
    "Resolved variables:",
    getStringfromObject(getObjectFromMap(resolvedVarsWithArguments)),
    "",
    `${filename} as object:`,
    getStringfromObject(obj),
  ].join("\n");
}

function addListElements(el, group, parentKey = null) {
  // Convert any iterable/object to array
  let items;
  let isMap = false;
  
  if (Array.isArray(group)) {
    items = group.map((item, index) => ({ key: index, value: item }));
  } else if (group instanceof Set) {
    items = Array.from(group).map((item, index) => ({ key: index, value: item }));
  } else if (group instanceof Map) {
    items = Array.from(group.entries()).map(([key, value]) => ({ key, value }));
    isMap = true;
  } else if (typeof group === 'object' && group !== null) {
    items = Object.entries(group).map(([key, value]) => ({ key, value }));
  } else {
    return;
  }

  items.forEach(({ key, value: element }) => {
    const li = document.createElement("li");
    
    // Check if element is an object
    if (typeof element === 'object' && element !== null && 
        !(element instanceof Date) && !(element instanceof RegExp)) {
      
      // Create label with key + object description
      let label = key + ": ";
      if (Array.isArray(element)) {
        label += `[Array: ${element.length} items]`;
      } else if (element instanceof Set) {
        label += `[Set: ${element.size} items]`;
      } else if (element instanceof Map) {
        label += `[Map: ${element.size} items]`;
      } else {
        label += JSON.stringify(element);
      }
      
      li.textContent = label;
      
      // Create nested ul
      const ul = document.createElement("ul");
      addListElements(ul, element, key);  // Recursive call with key
      li.appendChild(ul);
    } else {
      // Simple element - show key: value
      li.textContent = `${key}: ${element}`;
    }
    
    el.appendChild(li);
  });
}

function appendModelResultSection(trunk, label, group){
  const h = document.createElement("h3");
  h.textContent = label;
  trunk.appendChild(h)
  const ul = document.createElement("ul");
  addListElements(ul, group);
  trunk.appendChild(ul);
}

function formatModelResultHTML({ features, obj, filename }) {
  const {
    indexSets,
    variables,
    resolvedVarsWithArguments,
    precedents,
  } = features;

  const d = document.createElement("div");
  const p = document.createElement("p");
  p.innerText = "✔ Model is structurally valid";
  d.appendChild(p);
  appendModelResultSection(d,"Index sets",indexSets);
  appendModelResultSection(d,"Variables",variables);
  appendModelResultSection(d,"Precedents",getObjectFromMapOfSets(precedents));
  appendModelResultSection(d,"Resolved variables",getObjectFromMap(resolvedVarsWithArguments));
  appendModelResultSection(d,`${filename} as object`,obj);

  return d;
}

