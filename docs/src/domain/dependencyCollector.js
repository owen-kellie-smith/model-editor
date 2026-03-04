import { removeStringLiterals, asArray, throwModelError } from "../utils/helpers.js";
import { getIdentifierTokens } from "./model.js";
import { runtimeIdentifiers } from "./language.js";

/*
PARAMETERS:
  ref – the name of the function or reference to look for  e.g. "foo"
  text – the full input string  e.g. "foo(step + 3)"
  keyword (optional) – the shift keyword - defaults to "step"
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
 */
function computeShiftAny(ref, text, keywords) {
  for (const kw of keywords) {
    if (!kw) continue
    const shift = computeShift(ref, text, kw)
    if (shift !== 0) return shift
  }
  return 0
}

export function makeDependencyCollector(symbols, lang, ownerName, deps) {

  // --------------------------------------------------
  // low level primitive
  // --------------------------------------------------
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

