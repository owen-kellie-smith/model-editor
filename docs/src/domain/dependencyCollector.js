import { removeStringLiterals, asArray, throwModelError } from "../utils/helpers.js";
import { getIdentifierTokens } from "./model.js";
import { runtimeIdentifiers } from "./language.js";
export function makeDependencyCollector(symbols, lang, ownerName, deps) {

  // --------------------------------------------------
  // low level primitive
  // --------------------------------------------------
  function addDependencyIfVariable(ref, options = {}) {
    const { label = "", ...extra } = options;

    if (!symbols.variables.has(ref)) {
      const where = label ? ` for ${label}` : "";

      throwModelError(`Unknown identifier${where}`, {
        variable: ownerName,
        reference: ref,
        ...extra
      });
    }

    deps.add(ref);
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
      if (symbols.tables.has(ref)) continue;  
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

