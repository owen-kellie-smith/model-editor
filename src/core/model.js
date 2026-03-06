import { asArray, throwModelError, parseXmlOrThrow, getObjectFromXML } from "../utils/helpers.js";
import { makeDependencyCollector } from "./dependencyCollector.js";
import { log } from "../utils/logger.js"

// returns xml, javascript object, model features
export function validateModelCore(text, filename, lang) {
  const xml = parseXmlOrThrow(text, filename);
  const obj = getObjectFromXML(xml);
  const features = getModelFeatures(obj, lang);

  return { features, obj, filename };
}

  // returns in one object maps of indexSets, units, tables, variables in xml
  // throws error if domain rules are broken (duplicate index sets, duplicate variables)
export function getMapsOfModelProperties(xml) {
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
export  function getModelFeatures(xmlModel, lang) {
    const symbols = getMapsOfModelProperties(xmlModel);
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

