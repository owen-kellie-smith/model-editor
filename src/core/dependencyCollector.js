import { removeStringLiterals, asArray, throwModelError } from "../utils/helpers.js";
import { getIdentifierTokens } from "./model.js";
import { runtimeIdentifiers } from "./language.js";

/*
PARAMETERS:
  ref – the name of the function or reference to look for  e.g. "foo"
  text – the full input string  e.g. "foo(step + 3)"
  keyword (optional) – the shift keyword - defaults to "step"
*/
/**
 * Extracts the integer time-step shift for a given reference inside an expression.
 * For example, given ref="B" and text="B(step - 2)", returns -2.
 *
 * @param {string} ref - The identifier to look for (e.g. a variable name)
 * @param {string} text - The full expression string to search
 * @param {string} keyword - The shift keyword to look for inside the call (e.g. "step")
 * @returns {number} The shift amount (positive or negative integer), or 0 if no shift found
 */
function computeShift(ref, text, keyword) {

  const re = new RegExp(ref + "\\s*\\(([^)]*)\\)", "i");
  const m = re.exec(text);
  if (!m) return 0;

  const args = m[1];

  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shiftRe = new RegExp(`${escaped}\\s*([+-])\\s*(\\d+)`, "i");

  const shiftMatch = args.match(shiftRe);
  if (!shiftMatch) return 0;

  const sign = shiftMatch[1] === "-" ? -1 : 1;
  return sign * Number(shiftMatch[2]);
}


/**
 * Computes a shift for any of the provided index keywords.
 * Priority order is the order of `keywords`.
 *
 * @param {string} ref - The identifier to look for
 * @param {string} text - The full expression string to search
 * @param {string[]} keywords - Ordered list of shift keywords to try
 * @returns {number} The first non-zero shift found, or 0 if no shift is detected
 */
function computeShiftAny(ref, text, keywords) {
  for (const kw of keywords) {
    if (!kw) continue
    const shift = computeShift(ref, text, kw)
    if (shift !== 0) return shift
  }
  return 0
}

/**
 * Creates a dependency collector that accumulates variable references found in
 * a variable's definition into the provided `deps` Set.
 *
 * The returned object exposes `addDependenciesFromDefinition`, which dispatches
 * to the appropriate parser for each definition type (expression, piecewise,
 * tableLookup).
 *
 * @param {{ indexSets: Map, units: Map, tables: Map, variables: Map }} symbols - Model symbol maps
 * @param {Object} lang - Language environment containing the `functions` Map
 * @param {string} ownerName - Name of the variable being analysed (used in error messages)
 * @param {Set<{ name: string, shift: number }>} deps - Set to accumulate dependencies into
 * @returns {{ addDependenciesFromDefinition: (def: Object) => void }}
 */
export function makeDependencyCollector(symbols, lang, ownerName, deps) {

  // --------------------------------------------------
  // low level primitive
  // --------------------------------------------------
  /**
   * Adds a single variable reference to `deps` after validating it exists.
   * Detects temporal shifts by inspecting the surrounding expression text.
   *
   * @param {string} ref - Uppercase identifier to validate and add
   * @param {{ label?: string, text?: string }} [options={}] - Optional context for error messages and shift detection
   * @throws {Error} If `ref` is not a known variable
   */
  function addDependencyIfVariable(ref, options = {}) {
    const { label = "", ...extra } = options;

    if (!symbols.variables.has(ref)) {
      const where = label ? ` for ${label}` : "";

      throwModelError(`Missing reference: undefined identifier${where}`, {
        variable: ownerName,
        reference: ref,
        ...extra
      });
    }
    // Detect shifts against any indexSet name (or the model's temporal role).
    // This avoids hard-coding step/month/year/etc.
    const indexSetIds = Array.from(symbols.indexSets.values()).map(x => x?.id).filter(Boolean)
    const temporal = Array.from(symbols.indexSets.values()).find(x => String(x?.role ?? '').toLowerCase() === 'temporal')
    const keywords = [temporal?.id, ...indexSetIds]
    const shift = computeShiftAny(ref, extra.text ?? '', keywords)
    deps.add({ name: ref, shift });
  }

  // --------------------------------------------------
  // expression
  // --------------------------------------------------
  /**
   * Scans an expression or constant text node for variable references and
   * adds each to `deps`, skipping language functions, runtime identifiers,
   * table-only identifiers, and index set names.
   *
   * @param {{ "#text"?: string } | string} node - The text node to analyse
   */
  function addDependenciesFromExpression(node) {
    const rawText = node?.["#text"] ?? "";
    const text = removeStringLiterals(rawText);
    for (const r of getIdentifierTokens(text)) {
      const ref = r.toUpperCase();

      if (lang.functions.has(ref)) continue;
      if (runtimeIdentifiers.has(ref)) continue;
      if (symbols.tables.has(ref) && !symbols.variables.has(ref)) continue;
      if (symbols.indexSets.has(ref)) continue;

      addDependencyIfVariable(ref, { text });
    }

  }

  // --------------------------------------------------
  // table lookup
  // --------------------------------------------------
  /**
   * Extracts the row-selector and column-selector variable references from
   * a tableLookup definition and adds them to `deps`.
   *
   * @param {{ row?: { ref?: string }, columnSelector?: { ref?: string } }} def - The tableLookup definition object
   */
  function addDependenciesFromTableLookup(def) {
    const row = def.row?.ref?.toUpperCase();
    if (row) {
      addDependencyIfVariable(row, { label: "row selector" });
    }

    const colSel = def.columnSelector?.ref?.toUpperCase();
    if (colSel) {
      addDependencyIfVariable(colSel, { label: "column selector" });
    }
  }

  // --------------------------------------------------
  // dispatcher (the brain)
  // --------------------------------------------------
  /**
   * Dispatches to the appropriate dependency-extraction function based on
   * the definition's `type` property (expression, piecewise, or tableLookup).
   * Does nothing if `def` is absent or has an unrecognised type.
   *
   * @param {{ type?: string } | null} def - The variable definition object
   */
  function addDependenciesFromDefinition(def) {
    if (!def) return;

    if (def.type === "expression") {
      addDependenciesFromExpression(def);
      return;
    }

    if (def.type === "piecewise") {
      for (const c of asArray(def.case)) {
        addDependenciesFromExpression(c.when);
        addDependenciesFromExpression(c.value);
      }
      return;
    }

    if (def.type === "tableLookup") {
      addDependenciesFromTableLookup(def);
      return;
    }
  }

  return {
    addDependenciesFromDefinition
  };
}

