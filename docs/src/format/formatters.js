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

function appendModelResultSection(trunk, label, group){
  const h = document.createElement("h3");
  h.textContent = label;
  trunk.appendChild(h)
  const list = document.createElement("ol");
  addListElements(list, group);
  trunk.appendChild(list);
}

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

