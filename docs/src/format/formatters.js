import {
  getStringfromObject,
  getObjectFromMap,
  getObjectFromMapOfSets,
} from "../utils/helpers.js";

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
  const {
    indexSets,
    variables,
    resolvedVarsWithArguments,
    dependencies,
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
    "Dependencies:",
    getStringfromObject(getObjectFromMapOfSets(dependencies)),
    "",
    "Resolved variables:",
    getStringfromObject(getObjectFromMap(resolvedVarsWithArguments)),
    "",
    `${filename} as object:`,
    getStringfromObject(obj),
  ].join("\n");
}

