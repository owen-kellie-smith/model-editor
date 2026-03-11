import { asArray, throwModelError, parseXmlOrThrow, getObjectFromXML } from "../utils/helpers.js";
import { makeDependencyCollector } from "./dependencyCollector.js";
import { getFunctionsFromModelObj } from "./language.js";
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

  if (typeof raw === "string" || typeof raw === "number") {
    return String(raw).trim();
  }

  if (typeof raw === "object") {
    if (raw["#text"] !== undefined) {
      return String(raw["#text"]).trim();
    }

    // fallback: try first value in object
    const val = Object.values(raw)[0];
    return val ? String(val).trim() : "";
  }

  return "";
}


/**
 * Parses and validates a raw XML model string, returning the parsed object and computed features.
 *
 * The `lang` parameter is optional.  When omitted (or null/undefined), the language
 * environment is derived automatically from the model's own `<functions>` section
 * combined with the built-in standard functions.  Passing an explicit `lang` object
 * (as returned by `getFunctionsFromLanguage`) is still supported for backward
 * compatibility but is deprecated; declare functions in the model instead.
 *
 * @param {string} text - The raw XML text of the model
 * @param {string} filename - Label used in error messages to identify the source
 * @param {Object|null} [lang] - Language environment (from getFunctionsFromLanguage), or null/undefined
 * @param {Object} [options={}] - Validation options (e.g. { ignoreUnits: true })
 * @returns {{ features: Object, obj: Object, filename: string }} Validated model result
 * @throws {Error} If the XML is invalid or the model violates domain rules
 */
export function validateModelCore(text, filename, lang, options = {}) {
  const xml = parseXmlOrThrow(text, filename);
  const obj = getObjectFromXML(xml);

  // Derive language environment from the model when none is supplied.
  const resolvedLang = (lang && typeof lang === "object" && lang.functions instanceof Map)
    ? lang
    : getFunctionsFromModelObj(obj);

  const features = getModelFeatures(obj, resolvedLang, options);

  return { features, obj, filename };
}

  // returns in one object maps of indexSets, units, tables, variables in xml
  // throws error if domain rules are broken (duplicate index sets, duplicate variables)
/**
 * Builds case-insensitive maps of all model properties (indexSets, units, tables, variables).
 * Also validates units for non-legacy models and applies the legacy XML fallback loader
 * when no `<variables>` element is present.
 *
 * @param {Object} xml - Parsed model object (from getObjectFromXML)
 * @param {Object} [options={}] - Options, e.g. { ignoreUnits: true } to skip unit validation
 * @returns {{ indexSets: Map, units: Map, tables: Map, variables: Map }}
 * @throws {Error} If duplicates are found or a variable references an undeclared unit
 */
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

//console.log("RAW UNIT:", v.unit);
//console.log("UNIT VALUE:", unitValue);
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
/**
 * Resolves variable arguments, confirming each argument refers to a known index set.
 * Returns a map from uppercase variable name to { name, domain, xml }.
 *
 * @param {{ indexSets: Map, variables: Map }} symbols - Maps produced by getMapsOfModelProperties
 * @returns {Map<string, { name: string, domain: string[], xml: Object }>}
 * @throws {Error} If any variable argument does not correspond to a declared index set
 */
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
/**
 * Builds a map of incoming dependencies for every variable.
 * For each variable, the set contains all variables whose values it directly uses.
 *
 * @param {{ indexSets: Map, units: Map, tables: Map, variables: Map }} symbols
 * @param {Map<string, { name: string, domain: string[], xml: Object }>} resolvedVarsWithArguments
 * @param {Object} lang - Language environment (from getFunctionsFromLanguage)
 * @returns {Map<string, Set<{ name: string, shift: number }>>}
 * @throws {Error} If a formula contains a reference that is neither a known variable nor a function
 */
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
/**
 * Builds a map of outgoing dependencies (the inverse of incoming).
 * For each variable, the set contains all variables that directly depend on it.
 *
 * @param {Map<string, Set<{ name: string, shift: number }>>} incomingAll
 * @param {Map<string, { name: string, domain: string[], xml: Object }>} resolvedVarsWithArguments
 * @returns {Map<string, Set<{ name: string, shift: number }>>}
 */
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
/**
 * Detects circular dependency chains in the variable graph and throws if one is found.
 * Uses a BFS-style walk keyed on `{variableName}@{timeOffset}` to correctly allow
 * shifted self-references (e.g. B(t) = B(t-1)) while still catching true cycles.
 *
 * @param {Map<string, Set<{ name: string, shift: number }>>} incoming - Map from variable name to its incoming dependencies
 * @returns {void}
 * @throws {Error} If a circular dependency is detected
 */
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
/**
 * Extracts all word-like identifier tokens from an expression string.
 * A token matches the pattern `[a-zA-Z_][a-zA-Z0-9_]*` (i.e. a valid identifier).
 *
 * @param {string} exprText - The expression text to scan
 * @returns {string[]} Deduplicated array of identifier strings found in the expression
 */
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
/**
 * Orchestrates the full model parsing pipeline: builds symbol maps, resolves arguments,
 * computes incoming/outgoing dependency maps, and checks for circular expressions.
 *
 * @param {Object} xmlModel - Parsed model object (from getObjectFromXML)
 * @param {Object} lang - Language environment (from getFunctionsFromLanguage)
 * @param {Object} [options={}] - Options passed through to getMapsOfModelProperties
 * @returns {{ indexSets: string[], variables: string[], resolvedVarsWithArguments: Map, incoming: Map, outgoing: Map }}
 * @throws {Error} If any domain rule is violated (unknown reference, duplicate, unit error, circular expression, etc.)
 */
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
    return {
      indexSets: [...symbols.indexSets.keys()],   // an array containing all the keys from the indexSets map
      variables: [...symbols.variables.keys()],    // an array containing all the keys from the variables map
      resolvedVarsWithArguments,
      incoming,
      outgoing   
    };
  }

