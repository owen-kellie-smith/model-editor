import { asArray, throwModelError, parseXmlOrThrow, getObjectFromXML, removeStringLiterals } from "../utils/helpers.js";
import { makeDependencyCollector } from "./dependencyCollector.js";
import { log } from "../utils/logger.js"

// ---------------------------------------------------------------------------
// Unit helpers
// ---------------------------------------------------------------------------

/**
 * Normalises the raw value stored by the XML parser for a <unit> child element.
 * The parser may produce a plain string, the number 1, or { "#text": "..." }.
 * Returns the trimmed string, or "" if absent.
 */
export function getUnitValue(raw) {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "object" && raw["#text"] !== undefined) return String(raw["#text"]).trim();
  return String(raw).trim();
}

// ---------------------------------------------------------------------------
// Addend-splitting helpers (exported so they can be unit-tested directly)
// ---------------------------------------------------------------------------

/**
 * Splits an expression string at top-level `+` and `-` operators (i.e. not
 * inside parentheses or brackets).  Each returned term preserves its leading
 * sign character so that `isPureVariableCall` can strip it.
 *
 * Examples:
 *   "A + B"           → ["A", "+ B"]
 *   "A - B(x, y)"     → ["A", "- B(x, y)"]
 *   "(1 + r) ^ n"     → ["(1 + r) ^ n"]   ← the inner + is at depth 1
 *   "-A + B"          → ["-A", "+ B"]
 */
export function splitTopLevelAddends(text) {
  if (!text || typeof text !== "string") return [];
  const terms = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[") {
      depth++;
      current += ch;
    } else if (ch === ")" || ch === "]") {
      depth--;
      current += ch;
    } else if (depth === 0 && (ch === "+" || ch === "-")) {
      if (current.trim() !== "") {
        terms.push(current.trim());
        current = ch;           // start next term with the sign
      } else {
        current += ch;          // unary: keep as prefix
      }
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") terms.push(current.trim());
  return terms;
}

/**
 * Returns true when `term` (a single addend, possibly with a leading +/-)
 * is a pure variable call — i.e. just an identifier optionally followed by
 * a parenthesised argument list, with no arithmetic operators at the top level.
 *
 * Rejects terms that contain  * / ^ ? : = < >  outside parentheses, which
 * would indicate that the term is a sub-expression rather than a plain call.
 */
export function isPureVariableCall(term) {
  if (!term || typeof term !== "string") return false;
  // strip leading sign
  const stripped = term.replace(/^[+-]\s*/, "").trim();
  // must start with an identifier character
  if (!/^[a-zA-Z_]/.test(stripped)) return false;
  // must not contain arithmetic / comparison operators at top level
  let depth = 0;
  for (const ch of stripped) {
    if (ch === "(" || ch === "[") { depth++; }
    else if (ch === ")" || ch === "]") { depth--; }
    else if (depth === 0 && /[*\/^?:=<>]/.test(ch)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Union-find for unit equivalences
// ---------------------------------------------------------------------------

function makeUnionFind() {
  const parent = new Map();
  function find(x) {
    const key = x.toUpperCase();
    if (!parent.has(key)) return key;
    const root = find(parent.get(key));
    parent.set(key, root);
    return root;
  }
  function union(x, y) {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  }
  function compatible(x, y) {
    return find(x) === find(y);
  }
  return { find, union, compatible };
}

/**
 * Builds a compatibility checker for units.
 *
 * Equivalences come from two sources:
 *   1. `unitEquivalences` – array of [unitA, unitB] pairs from language.xml
 *      `<unitRules>` (e.g. ["DAYS","S"], ["HOURS","S"]).
 *   2. `dimension` attributes on <unit> elements in the model's <units>
 *      section (e.g. `<unit id="years" dimension="time"/>`).
 *
 * @param {Map}   unitsMap        – symbols.units  (id.toUpperCase() → unit object)
 * @param {Array} unitEquivalences – [[unitA, unitB], …] from language
 * @returns {{ areCompatible(a:string, b:string): boolean }}
 */
export function buildUnitCompatibilityChecker(unitsMap, unitEquivalences) {
  const uf = makeUnionFind();

  // 1. Language-level equivalence rules
  for (const [a, b] of (unitEquivalences ?? [])) {
    uf.union(a, b);
  }

  // 2. Model-level dimension attributes: group all units sharing the same
  //    dimension string.
  const byDimension = new Map();
  for (const [id, u] of unitsMap) {
    const dim = u.dimension ?? u["dimension"];
    if (dim && typeof dim === "string" && dim.trim()) {
      const key = dim.trim().toUpperCase();
      if (!byDimension.has(key)) byDimension.set(key, []);
      byDimension.get(key).push(id);
    }
  }
  for (const members of byDimension.values()) {
    for (let i = 1; i < members.length; i++) {
      uf.union(members[0], members[i]);
    }
  }

  return {
    areCompatible(a, b) {
      if (!a || !b) return false;
      return uf.compatible(a, b);
    }
  };
}

// ---------------------------------------------------------------------------
// Additive expression unit-consistency checker
// ---------------------------------------------------------------------------

/**
 * Walks every `expression` and every piecewise `value` expression in the model
 * and verifies that when two pure variable-call addends appear in a sum, their
 * units are compatible (identical OR linked via equivalence rules).
 *
 * Only top-level `+` / `-` operators are inspected — additions buried inside
 * function arguments (e.g. `max(a + b, 0)`) are at depth > 0 and are skipped.
 *
 * @param {Object} symbols         – from getMapsOfModelProperties
 * @param {Array}  unitEquivalences – [[unitA, unitB], …] from language (may be empty/null)
 */
export function checkAdditionUnitConsistency(symbols, unitEquivalences) {
  const checker = buildUnitCompatibilityChecker(symbols.units, unitEquivalences);

  for (const [varName, v] of symbols.variables) {
    const def = v.definition;
    if (!def) continue;

    const expressionTexts = [];

    if (def.type === "expression") {
      const t = def["#text"];
      if (t) expressionTexts.push(t);
    } else if (def.type === "piecewise") {
      for (const c of asArray(def.case)) {
        // check the value branch; skip the when-condition (boolean, not numeric)
        const valueNode = c.value;
        if (!valueNode) continue;
        const t = typeof valueNode === "string"
          ? valueNode
          : valueNode["#text"];
        if (t) expressionTexts.push(t);
      }
    }

    for (const rawText of expressionTexts) {
      const text = removeStringLiterals(rawText);
      const addends = splitTopLevelAddends(text);
      if (addends.length < 2) continue;

      // Collect the (name, unit) for every pure-variable-call addend
      const varAddends = [];
      for (const term of addends) {
        if (!isPureVariableCall(term)) continue;
        const nameMatch = term.match(/[a-zA-Z_][a-zA-Z0-9_]*/);
        if (!nameMatch) continue;
        const refName = nameMatch[0].toUpperCase();
        if (!symbols.variables.has(refName)) continue;   // index-set ref, etc.
        const refVar = symbols.variables.get(refName);
        const unit = getUnitValue(refVar.unit);
        if (unit) varAddends.push({ refName, unit });
      }

      if (varAddends.length < 2) continue;

      // All pure-variable-call addends must be mutually compatible
      const { refName: firstName, unit: firstUnit } = varAddends[0];
      for (const { refName: otherName, unit: otherUnit } of varAddends.slice(1)) {
        if (!checker.areCompatible(firstUnit, otherUnit)) {
          throwModelError(
            "Unit mismatch in addition: cannot add expressions with incompatible units",
            {
              variable: varName,
              term1: firstName, unit1: firstUnit,
              term2: otherName, unit2: otherUnit,
            }
          );
        }
      }
    }
  }
}


export function validateModelCore(text, filename, lang, options = {}) {
  const xml = parseXmlOrThrow(text, filename);
  const obj = getObjectFromXML(xml);
  const features = getModelFeatures(obj, lang, options);

  return { features, obj, filename };
}

  // returns in one object maps of indexSets, units, tables, variables in xml
  // throws error if domain rules are broken (duplicate index sets, duplicate variables)
export function getMapsOfModelProperties(xml, options = {}) {
    const indexSets = new Map();
    const units = new Map();
    const tables = new Map();
    const variables = new Map();
    for (const indSet of asArray(xml.model.indexSets?.indexSet)) {
      if (indexSets.has(indSet.id.toUpperCase())) {
        throwModelError("Duplicate index set", { id: indSet.id });
      }
      indexSets.set(indSet.id.toUpperCase(), indSet);
    }
    for (const u of asArray(xml.model.units?.unit)) {
      units.set(u.id.toUpperCase(), u);
    }
    for (const t of asArray(xml.model.tables?.table)) {
      tables.set(t.id.toUpperCase(), t);
    }
    for (const v of asArray(xml.model.variables?.variable)) {
      if (variables.has(v.id.toUpperCase())) {
        throwModelError("Duplicate variable", { id: v.id.toUpperCase() });
      }
      if (tables.has(v.id.toUpperCase())) {
        throwModelError("Variable identifier conflicts with table identifier", { id: v.id });
      }
      variables.set(v.id.toUpperCase(), v);
    }
    // ------------------------------------------------------
    // FALLBACK: Legacy style
    // ------------------------------------------------------
    if (variables.size === 0 && xml.model.ModelPointFields) {
      log("info","Using Legacy fallback loader");

      // -------------------------
      // variables
      // -------------------------
      for (const v of asArray(xml.model.ModelPointFields.VariableDefinition)) {
        variables.set(v.Name.toUpperCase(), {
          id: v.Name.toUpperCase(),
          definition: { type: "expression", "#text": v.Formula || "" }
        });
      }

      for (const v of asArray(xml.model.Formulas?.VariableDefinition)) {
        variables.set(v.Name.toUpperCase(), {
          id: v.Name.toUpperCase(),
          definition: { type: "expression", "#text": v.Formula || "" }
        });
      }

      const tableContainers = [
        xml.model.DoubleTables,
        xml.model.IntegerTables,
        xml.model.MortalityTables,
        xml.model.MultiUltMortalityTables,
      ];

      for (const container of tableContainers) {
        for (const t of asArray(container?.VariableDefinition)) {
          tables.set(t.Name.toUpperCase(), t);
        }
      }
    } else if (!options.ignoreUnits) {
      // Unit validation for non-legacy models.
      // v.unit may be a plain string, a number (e.g. 1 from <unit>1</unit>),
      // or an object { "#text": "..." } as produced by the XML parser for text-only elements.
      for (const [, v] of variables) {
        const unitValue = getUnitValue(v.unit);

        if (!unitValue) {
          throwModelError("Variable is missing a unit; use '1' for dimensionless", { variable: v.id });
        }
        if (unitValue !== "1" && !units.has(unitValue.toUpperCase())) {
          throwModelError("Variable uses a unit that is not declared in the model", { variable: v.id, unit: unitValue });
        }
      }
    }

    return { indexSets, units, tables, variables };
  }

 // returns map of variables whose arguments are verified to be IndexSets
  // throws error if domain rules are broken (arguments not recognised as IndexSets)
export function getVariablesWithTheirArgumentsConfirmedAsIndexSets(symbols) {
    const resolved = new Map(); 
    for (const [name, v] of symbols.variables) {
      const args = [];
      for (const arg of asArray(v.arguments?.arg)) {
        const indexSet = symbols.indexSets.get(arg.indexSet?.toUpperCase());
        if (!indexSet) {
          throwModelError("Unknown index set", {
            variable: name,
            indexSet: arg.indexSet
          });
        }
        args.push(indexSet.id);
      }
      resolved.set(name.toUpperCase(), {
        name: name.toUpperCase(),
        domain: args,
        xml: v
      });
    }
    return resolved;
  }

  // gets a map of incoming variables (variables that flow into each variable)
  // throws error if there is an undefined reference: string in formula not a variable nor a function, or undefined table)
export function getIncoming(symbols, resolvedVarsWithArguments, lang) {
  const incomingAll = new Map(); 

  for (const [name, resolvedVariable] of resolvedVarsWithArguments) {
    const incoming = new Set();
    incomingAll.set(name.toUpperCase(), incoming);

    const collector = makeDependencyCollector(symbols, lang, name, incoming);
    collector.addDependenciesFromDefinition(
      resolvedVariable.xml.definition
    );
  }

  return incomingAll;   
}

  // gets a map of outgoing variables (variables that this variable flows into)
  // for each variable, shows which variables use it as input
export function getOutgoing(incomingAll, resolvedVarsWithArguments) {
  const outgoingAll = new Map();
  
  // Initialize all variables with empty sets
  for (const [name] of resolvedVarsWithArguments) {
    outgoingAll.set(name.toUpperCase(), new Set());
  }
  
  // For each variable and its incoming variables,
  // add this variable as an outgoing variable of each incoming variable
  for (const [varName, incomings] of incomingAll) {
    for (const incoming of incomings) {
      const incomingName = incoming.name.toUpperCase();
      if (!outgoingAll.has(incomingName)) {
        outgoingAll.set(incomingName, new Set());
      }
      // Add varName as an outgoing variable of incomingName
      // Include shift information to match the structure of incoming
      outgoingAll.get(incomingName).add({ name: varName, shift: -(incoming.shift ?? 0) });
    }
  }
  
  return outgoingAll;
}

  // throw an error if e.g. A flows into C which flows into B which flows into A.
export function throwErrorForCircularExpressions(incoming) {

  for (const root of incoming.keys()) {

    // nodes we must still expand
    // key = `${name}@${offset}`
    const total = new Map();   // key -> { name, offset }
    const checked = new Set();

    const startKey = `${root}@0`;
    checked.add(startKey);

    // seed with immediate incoming variables of root at offset 0
    for (const e of incoming.get(root) ?? []) {
      const off = e.shift ?? 0;
      const key = `${e.name}@${off}`;
      total.set(key, { name: e.name, offset: off });
    }

    while (true) {

      // 🔥 real cycle = back to same variable AND same offset
      if (total.has(startKey)) {
        throwModelError("Circular expressions detected", {
          cycle: [root],
        });
      }

      // find something new to expand
      const nextEntry = [...total.entries()]
        .find(([k]) => !checked.has(k));

      if (!nextEntry) break;

      const [key, { name, offset }] = nextEntry;
      checked.add(key);

      // expand its incoming variables
      for (const e of incoming.get(name) ?? []) {
        const nextOffset = offset + (e.shift ?? 0);
        const nextKey = `${e.name}@${nextOffset}`;

        // Check for cycle before skipping - if this would create the start key, we have a cycle
        if (nextKey === startKey) {
          throwModelError("Circular expressions detected", {
            cycle: [root, name],
          });
        }

        if ([...checked].some(k => k.startsWith(e.name + "@"))) {
          continue;
        }

        if (!checked.has(nextKey)) {
          // if we already checked same variable at ANY time,
          // exploring another time gives nothing new
          total.set(nextKey, { name: e.name, offset: nextOffset });
        }
      }
    }
  }
}
 
    
  // gets words from exprText
export  function getIdentifierTokens(exprText) {
  const regex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g; // \b is word boundary so \b ... \b encloses a word

  const refs = new Set();
  let m;

  while ((m = regex.exec(exprText)) !== null) {
    refs.add(m[1]);
  }

  return [...refs];
  }

// passes xmlModel and lang to parsers to get an object containing parsed model features (variables, incoming and outgoing variables) 
export  function getModelFeatures(xmlModel, lang, options = {}) {
    const symbols = getMapsOfModelProperties(xmlModel, options);
  log("debug","symbols:", symbols);
    const resolvedVarsWithArguments = getVariablesWithTheirArgumentsConfirmedAsIndexSets(symbols);
  log("debug","resolvedVarsWithArguments:", resolvedVarsWithArguments);
    const incoming = getIncoming(symbols, resolvedVarsWithArguments, lang);
  log("debug","incoming:", incoming);
    const outgoing = getOutgoing(incoming, resolvedVarsWithArguments);
  log("debug","outgoing:", outgoing);
    throwErrorForCircularExpressions(incoming);
    if (!options.ignoreUnits) {
      checkAdditionUnitConsistency(symbols, lang?.unitEquivalences ?? []);
    }
    return {
      indexSets: [...symbols.indexSets.keys()],   // an array containing all the keys from the indexSets map
      variables: [...symbols.variables.keys()],    // an array containing all the keys from the variables map
      resolvedVarsWithArguments,
      incoming,
      outgoing   
    };
  }

