import { log } from "../utils/logger.js"

export const runtimeIdentifiers = new Set([
  "PROJECTIONTERM",
  "RECORDNUMBER",
  "T"
]);

/**
 * Parses the <unitRules> section of a language XML document and returns an
 * array of [unitA, unitB] equivalence pairs (both uppercased).
 *
 * Supported rule format: "1 <unitA> = <factor> <unitB>"
 * Example: "1 days = 86400 s"  →  ["DAYS", "S"]
 *
 * The numeric factor is intentionally ignored; only the unit names matter for
 * dimensional-consistency checking.  Compound-unit rules ("1 km/h = 1 km / 1 h")
 * are not supported by this parser; use a `dimension` attribute on <unit>
 * elements in the model instead.
 *
 * @param {Document} xmlDoc - a parsed language XML document
 * @returns {Array<[string,string]>} equivalence pairs
 */
export function getUnitEquivalencesFromLanguage(xmlDoc) {
  const pairs = [];
  const ruleNodes = xmlDoc.querySelectorAll("unitRules > rule");
  for (const rule of ruleNodes) {
    const text = (rule.textContent ?? "").trim();
    // Match: 1 <identA> = <non-letter stuff> <identB>
    const m = text.match(/^1\s+([a-zA-Z_]\w*)\s*=\s*[^a-zA-Z]+([a-zA-Z_]\w*)\s*$/);
    if (m) {
      pairs.push([m[1].toUpperCase(), m[2].toUpperCase()]);
    }
  }
  return pairs;
}

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

  const unitEquivalences = getUnitEquivalencesFromLanguage(xmlDoc);

  return { functions, unitEquivalences };
}

