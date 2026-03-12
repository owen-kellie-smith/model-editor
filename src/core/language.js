import { asArray } from "../utils/helpers.js";
import { log } from "../utils/logger.js"

export const runtimeIdentifiers = new Set([
  "PROJECTIONTERM",
  "RECORDNUMBER",
  "T"
]);

/**
 * Human-readable descriptions of every built-in standard function.
 * Used by the CLI `functions` command and the browser help dialog to
 * document what functions are available without any declaration in model.xml.
 *
 * Each entry has:
 *   - `name`        – lowercase function name
 *   - `signature`   – call signature shown to the user
 *   - `description` – one-line plain-text description
 *
 * @type {Array<{ name: string, signature: string, description: string }>}
 */
export const standardFunctionDescriptions = [
  // rounding / truncation
  { name: 'floor',   signature: 'floor(x)',            description: 'Round x down to the nearest integer' },
  { name: 'ceil',    signature: 'ceil(x)',             description: 'Round x up to the nearest integer (alias: ceiling)' },
  { name: 'round',   signature: 'round(x, n)',         description: 'Round x to n decimal places' },
  { name: 'int',     signature: 'int(x)',              description: 'Truncate x towards zero' },
  // general numeric
  { name: 'abs',     signature: 'abs(x)',              description: 'Absolute value of x' },
  { name: 'sqrt',    signature: 'sqrt(x)',             description: 'Square root of x' },
  { name: 'pow',     signature: 'pow(base, exp)',      description: 'Raise base to the power exp' },
  // exponential / logarithmic
  { name: 'log',     signature: 'log(x)',              description: 'Natural logarithm of x' },
  { name: 'exp',     signature: 'exp(x)',              description: 'e raised to the power x' },
  // trigonometric
  { name: 'sin',     signature: 'sin(x)',              description: 'Sine of x (x in radians)' },
  { name: 'cos',     signature: 'cos(x)',              description: 'Cosine of x (x in radians)' },
  { name: 'tan',     signature: 'tan(x)',              description: 'Tangent of x (x in radians)' },
  { name: 'asin',    signature: 'asin(x)',             description: 'Inverse sine; result in radians' },
  { name: 'acos',    signature: 'acos(x)',             description: 'Inverse cosine; result in radians' },
  { name: 'atan',    signature: 'atan(x)',             description: 'Inverse tangent; result in radians' },
  // aggregate – pairwise
  { name: 'min',     signature: 'min(a, b)',           description: 'Minimum of two values' },
  { name: 'max',     signature: 'max(a, b)',           description: 'Maximum of two values' },
  // aggregate – over an index set
  { name: 'sum',     signature: 'sum(expr, indexSet)', description: 'Sum expr over all values of the named index set' },
  // conditional
  { name: 'if',      signature: 'if(cond, a, b)',      description: 'Return a when cond is true, b otherwise' },
];

/**
 * The built-in standard functions that the system recognises and can render
 * to Excel formulas and Python code.  Model XML files do not need to declare
 * these; they are always available during validation and export.
 *
 * Shape of each entry: `{ arity, minArgs, maxArgs }` where:
 *   - `arity`   – exact argument count when non-zero; 0 means "variadic"
 *   - `minArgs` – minimum argument count (0 = no lower bound enforced)
 *   - `maxArgs` – maximum argument count (0 = unlimited)
 *
 * @type {Map<string, { arity: number, minArgs: number, maxArgs: number }>}
 */
export const standardFunctions = new Map([
  // numeric – rounding / truncation
  ["FLOOR",   { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["CEIL",    { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["CEILING", { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["ROUND",   { arity: 2, minArgs: 2, maxArgs: 2 }],
  ["INT",     { arity: 1, minArgs: 1, maxArgs: 1 }],
  // numeric – general
  ["ABS",     { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["SQRT",    { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["POW",     { arity: 2, minArgs: 2, maxArgs: 2 }],
  // numeric – exponential / logarithmic
  ["LOG",     { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["EXP",     { arity: 1, minArgs: 1, maxArgs: 1 }],
  // numeric – trigonometric
  ["SIN",     { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["COS",     { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["TAN",     { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["ASIN",    { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["ACOS",    { arity: 1, minArgs: 1, maxArgs: 1 }],
  ["ATAN",    { arity: 1, minArgs: 1, maxArgs: 1 }],
  // aggregate – binary (also supported in min/max over an index: min(expr, indexSet))
  ["MIN",     { arity: 2, minArgs: 2, maxArgs: 2 }],
  ["MAX",     { arity: 2, minArgs: 2, maxArgs: 2 }],
  // aggregate – sum over an index set: sum(expr, indexSet)
  // arity=0 indicates variadic; minArgs=1; maxArgs=0 means unlimited.
  ["SUM",     { arity: 0, minArgs: 1, maxArgs: 0 }],
  // conditional
  ["IF",      { arity: 3, minArgs: 3, maxArgs: 3 }],
]);

/**
 * Builds a language environment from a parsed model object.
 * Starts with all standard functions, then merges in any functions declared
 * in the model's optional `<functions>` section.
 *
 * A model function entry may carry an optional `definition` property that
 * describes how the function is computed (using the same format as a variable
 * definition: expression, piecewise, etc.).  The definition is stored on the
 * map entry for use by renderers, but is not currently validated here.
 *
 * @param {Object} obj - Parsed model object (from getObjectFromXML)
 * @returns {{ functions: Map<string, { arity: number, minArgs: number, maxArgs: number, definition?: Object }> }}
 * @throws {Error} If a function declaration is missing a name or has a non-numeric arity/minArgs/maxArgs
 */
export function getFunctionsFromModelObj(obj) {
  const functions = new Map(standardFunctions);

  for (const fn of asArray(obj?.model?.functions?.function)) {
    const name = fn?.name;
    if (!name) {
      throw new Error("Invalid function declaration in model: function without name");
    }

    const arity    = Number(fn.arity    ?? 0);
    const minArgs  = Number(fn.minArgs  ?? 0);
    const maxArgs  = Number(fn.maxArgs  ?? 0);

    if (Number.isNaN(arity)) {
      throw new Error(`Invalid function declaration in model: function '${name}' has non-numeric arity`);
    }
    if (Number.isNaN(minArgs)) {
      throw new Error(`Invalid function declaration in model: function '${name}' has non-numeric minArgs`);
    }
    if (Number.isNaN(maxArgs)) {
      throw new Error(`Invalid function declaration in model: function '${name}' has non-numeric maxArgs`);
    }

    const entry = { arity, minArgs, maxArgs };
    if (fn.definition) {
      entry.definition = fn.definition;
    }

    functions.set(name.toUpperCase(), entry);
  }

  return { functions };
}

/**
 * Parses a language XML document and returns a map of declared functions.
 * Each function entry records its arity, minArgs, and maxArgs.
 *
 * @deprecated Language.xml is no longer used as an input.  Declare functions
 *   in the model's `<functions>` section instead.  Standard functions are
 *   always available without any declaration.  This function is kept for
 *   backward compatibility only.
 *
 * @param {Document} xmlDoc - Parsed XML document (from parseXmlOrThrow)
 * @param {string} filename - Label used in error messages to identify the source
 * @returns {{ functions: Map<string, { arity: number, minArgs: number, maxArgs: number }> }}
 * @throws {Error} If any function declaration is missing a name or has non-numeric arity/minArgs/maxArgs
 */
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
