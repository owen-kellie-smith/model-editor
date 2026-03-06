import { log } from "../utils/logger.js"

export const runtimeIdentifiers = new Set([
  "PROJECTIONTERM",
  "RECORDNUMBER",
  "T"
]);

export function getFunctionsFromLanguage(xmlDoc, filename) {
  const functions = new Map();
  const fnNodes = xmlDoc.querySelectorAll("functions > function");

  for (const fn of fnNodes) {
    if (!fn) {
      log("warn","FUNCTION NODE IS NULL HERE");
    }

    const name = fn.getAttribute("name");
    const minArgs = Number(fn.getAttribute("minArgs"));
    const maxArgs = Number(fn.getAttribute("maxArgs"));
    const arity = Number(fn.getAttribute("arity"));

    const serializer = new XMLSerializer();
    const fnXml = serializer.serializeToString(fn);

    if (!name) {
      throw new Error(
        "Invalid function declaration in " + filename + ": function without name\n" + fnXml
      );
    }
    if (Number.isNaN(arity)) {
      throw new Error("Invalid function declaration in " + filename + ": function with non-numeric arity\n" + fnXml);
    }
    if (Number.isNaN(minArgs)) {
      throw new Error("Invalid function declaration in " + filename + ": function with non-numeric minArgs\n" + fnXml);
    }
    if (Number.isNaN(maxArgs)) {
      throw new Error("Invalid function declaration in " + filename + ": function with non-numeric maxArgs\n" + fnXml);
    }

    functions.set(name.toUpperCase(), { arity, minArgs, maxArgs });
  }

  return { functions };
}

