import { removeStringLiterals, asArray, throwModelError } from "../utils/helpers.js";
import { getIdentifierTokens } from "./model.js";
import { runtimeIdentifiers } from "./language.js";
import { log } from "../utils/logger.js"

/* computeShift(ref, text, keyword = "step")
PARAMETERS:
  ref – the name of the function or reference to look for  e.g. "foo"
  text – the full input string  e.g. "foo(step + 3)"
  keyword (optional) – the shift keyword - defaults to "step"
*/
function computeShift(ref, text, keyword = "step") {
//  log("debug","ref: ", ref);
//  log("debug","text: ", text);

  const re = new RegExp(ref + "\\s*\\(([^)]*)\\)", "i");
  const m = re.exec(text);
  if (!m) return 0;

  const args = m[1];
//  log("debug","args: ", args);

  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shiftRe = new RegExp(`${escaped}\\s*([+-])\\s*(\\d+)`, "i");

  const shiftMatch = args.match(shiftRe);
  if (!shiftMatch) return 0;

//  log("debug","shiftMatch: ", shiftMatch);

  const sign = shiftMatch[1] === "-" ? -1 : 1;
  return sign * Number(shiftMatch[2]);
}


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

    const shiftStd = computeShift(ref, extra.text);
    log("debug","ref:" + ref);
    log("debug","shiftStd:" + shiftStd);
    const shift_t = computeShift(ref, extra.text, "t");
    log("debug","shift_t:" + shift_t);
    const shift = (shiftStd == 0) ? shift_t : shiftStd;
    log("debug","shift:" + shift);
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

