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
      variables.set(v.id.toUpperCase(), v);
    }
    // ------------------------------------------------------
    // FALLBACK: ModelMaker style
    // ------------------------------------------------------
    if (variables.size === 0 && xml.model.ModelPointFields) {
      log("info","Using ModelMaker fallback loader");

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

  // gets a map of dependencies
  // throws error if there is an undefined reference: string in formula not a variable nor a function, or undefined table)
export function getDependencies(symbols, resolvedVarsWithArguments, lang) {
  const dependencies = new Map(); 

  for (const [name, resolvedVariable] of resolvedVarsWithArguments) {
    const deps = new Set();
    dependencies.set(name.toUpperCase(), deps);

    const collector = makeDependencyCollector(symbols, lang, name, deps);
    collector.addDependenciesFromDefinition(
      resolvedVariable.xml.definition
    );
  }

  return dependencies;   
}
  // throw an error if e.g. a depends on B which depends on C which depends on A.
export function throwErrorForCircularExpressions(dependencies) {

  for (const root of dependencies.keys()) {

    // nodes we must still expand
    // key = `${name}@${offset}`
    const total = new Map();   // key -> { name, offset }
    const checked = new Set();

    const startKey = `${root}@0`;
    checked.add(startKey);

    // seed with immediate dependencies of root at offset 0
    for (const e of dependencies.get(root) ?? []) {
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

      // expand its dependencies
      for (const e of dependencies.get(name) ?? []) {
        const nextOffset = offset + (e.shift ?? 0);
        const nextKey = `${e.name}@${nextOffset}`;

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

// passes xmlModel and lang to parsers to get an object containing parsed model features (variables, dependencie i.e. immediate precedents) 
export  function getModelFeatures(xmlModel, lang) {
    const symbols = getMapsOfModelProperties(xmlModel);
  log("debug","symbols:", symbols);
    const resolvedVarsWithArguments = getVariablesWithTheirArgumentsConfirmedAsIndexSets(symbols);
  log("debug","resolvedVarsWithArguments:", resolvedVarsWithArguments);
    const dependencies = getDependencies(symbols, resolvedVarsWithArguments, lang);
  log("debug","dependencies:", dependencies);
    throwErrorForCircularExpressions(dependencies);
    return {
      indexSets: [...symbols.indexSets.keys()],   // an array containing all the keys from the indexSets map
      variables: [...symbols.variables.keys()],    // an array containing all the keys from the variables map
      resolvedVarsWithArguments,
      dependencies   
    };
  }

