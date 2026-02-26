import { asArray, throwModelError } from "../utils/helpers.js";
import {
  buildVariableMap,
  getTemporalIndexSetId,
  getStepRange,
  getDefinitionText,
  getDefinitionType,
  buildTableSheetsData,
} from "./renderShared.js";

// ------------------------------------------------------------
// JS-side helpers for emitting Python
// ------------------------------------------------------------

function normalize(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function escapePyString(s) {
  // JSON.stringify gives us a safe double-quoted string literal.
  return JSON.stringify(String(s ?? ""));
}

// Convert a single (top-level) ternary "cond ? a : b" into Python "(a if cond else b)".
// Handles nesting reasonably by tracking parentheses/brackets/braces.
function convertTernary(expr) {
  let s = String(expr ?? "");
  let depth = 0;
  let qPos = -1;
  let colonPos = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    else if (ch === '?' && depth === 0) { qPos = i; break; }
  }
  if (qPos === -1) return s;
  depth = 0;
  for (let i = qPos + 1; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) { colonPos = i; break; }
  }
  if (colonPos === -1) return s;
  const cond = s.slice(0, qPos).trim();
  const a = s.slice(qPos + 1, colonPos).trim();
  const b = s.slice(colonPos + 1).trim();
  return `(${a} if ${cond} else ${b})`;
}

function translateExprToPython(expr, varIdsLongestFirst) {
  let s = normalize(expr);
  if (!s) return "0";

  // ternary
  s = convertTernary(s);

  // power operator
  s = s.replace(/\^/g, "**");

  // inequality operator in some vendor formats uses "<>"
  s = s.replace(/<>/g, "!=");

  // equality in model language: single '=' means equality test.
  // Keep >=, <=, !=, == intact.
  s = s.replace(/(?<![!<>=])=(?!=)/g, "==");

  // Map common function names to Python math equivalents (runtime provides aliases too).
  // Keep min/max/abs/round/pow as builtins.
  s = s
    .replace(/\bfloor\s*\(/gi, "math.floor(")
    .replace(/\bceiling\s*\(/gi, "math.ceil(")
    .replace(/\bceil\s*\(/gi, "math.ceil(")
    .replace(/\bexp\s*\(/gi, "math.exp(")
    .replace(/\blog\s*\(/gi, "math.log(")
    .replace(/\bsin\s*\(/gi, "math.sin(")
    .replace(/\bcos\s*\(/gi, "math.cos(")
    .replace(/\btan\s*\(/gi, "math.tan(")
    .replace(/\basin\s*\(/gi, "math.asin(")
    .replace(/\bacos\s*\(/gi, "math.acos(")
    .replace(/\batan\s*\(/gi, "math.atan(")
    .replace(/\bsqrt\s*\(/gi, "math.sqrt(");

  // Replace variable calls foo(...) → V('foo', ...)
  for (const vid of varIdsLongestFirst) {
    const esc = vid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`\\b${esc}\\s*\\(`, "g"), `V(${escapePyString(vid)}, `);
  }

  // Replace bare variable identifiers foo → V('foo') (longest-first avoids partial overlap)
  // IMPORTANT: do NOT replace inside string literals we just introduced (e.g. the "radius" inside V("radius")).
  // A simple regex pass will match word-boundaries inside quotes and corrupt the expression
  // into things like V("V(\"radius\")"). Instead, scan the string and only substitute when we're
  // not inside quotes.
  function replaceBareIdOutsideStrings(input, vid) {
    const esc = vid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${esc}\\b(?!\\s*\\()`, "g");
    if (!input.includes('"')) {
      return input.replace(re, `V(${escapePyString(vid)})`);
    }
    let out = "";
    let last = 0;
    let inStr = false;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '"' && input[i - 1] !== "\\") {
        // process segment up to this quote
        if (!inStr) {
          out += input.slice(last, i).replace(re, `V(${escapePyString(vid)})`);
        } else {
          out += input.slice(last, i);
        }
        inStr = !inStr;
        out += ch;
        last = i + 1;
      }
    }
    // tail
    if (!inStr) out += input.slice(last).replace(re, `V(${escapePyString(vid)})`);
    else out += input.slice(last);
    return out;
  }

  for (const vid of varIdsLongestFirst) {
    s = replaceBareIdOutsideStrings(s, vid);
  }

  return s;
}

function pythonLiteralTableSheets(modelObj) {
  const sheets = buildTableSheetsData(modelObj);
  // Convert to a minimal dict: tableId -> {headers, rows}
  const tables = {};
  for (const s of sheets) {
    const tableId = String(s.name).replace(/^input_/, "");
    tables[tableId] = {
      headers: s.headers,
      rows: s.dataRows,
    };
  }
  return JSON.stringify(tables, null, 2);
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/**
 * Export a validated model as a runnable Python program.
 *
 * The generated program is a small interpreter specialized to this model:
 *  - embeds variable definitions and domains
 *  - embeds default sample table inputs (same as XLSX sample rows)
 *  - optionally loads input_{table}.csv files at runtime to override samples
 */
export function renderModelAsPython(modelObj, features) {
  if (!modelObj?.model) throwModelError("Invalid model object");
  if (!features?.resolvedVarsWithArguments) throwModelError("Invalid model features");

  const variableMap = buildVariableMap(modelObj);
  const varIds = Array.from(variableMap.values()).map(v => String(v.id));
  const varIdsLongestFirst = [...varIds].sort((a, b) => b.length - a.length);

  // Index set metadata
  const indexSets = asArray(modelObj?.model?.indexSets?.indexSet).map(is => ({
    id: String(is?.id ?? ""),
    role: String(is?.role ?? ""),
    dataType: String(is?.dataType ?? is?.datatype ?? ""),
    min: is?.min,
    max: is?.max,
  })).filter(x => x.id);

  const temporalId = getTemporalIndexSetId(modelObj) ?? "step";
  const { min: tMin, max: tMax } = getStepRange(modelObj, temporalId);

  // Variable definitions + domains
  const defs = {};
  const domains = {};
  for (const v of variableMap.values()) {
    const id = String(v.id);
    const defType = getDefinitionType(v);
    const defNode = v.definition;
    const def = { type: defType };
    if (defType === "constant" || defType === "expression") {
      def.text = normalize(getDefinitionText(v));
    } else if (defType === "piecewise") {
      def.cases = asArray(defNode?.case).map(c => ({
        when: normalize(c?.when?.["#text"] ?? c?.when ?? ""),
        value: normalize(c?.value?.["#text"] ?? c?.value ?? ""),
      }));
    } else if (defType === "table") {
      def.table = defNode?.table?.ref || defNode?.table?.["#text"] || "";
      def.column = defNode?.column?.ref || defNode?.column?.["#text"] || "";
    } else if (defType === "tableLookup") {
      def.table = defNode?.table?.ref || defNode?.table?.["#text"] || "";
      def.row = defNode?.row?.ref || defNode?.row?.["#text"] || "";
      def.columnSelector = defNode?.columnSelector?.ref || defNode?.columnSelector?.["#text"] || "";
    }
    defs[id] = def;

    const rv = features.resolvedVarsWithArguments.get(id.toUpperCase());
    domains[id] = Array.isArray(rv?.domain) ? rv.domain.map(String) : [];
  }

  // Pre-translate expressions to Python expressions that call V('var', ...)
  for (const [id, def] of Object.entries(defs)) {
    if (def.type === "constant" || def.type === "expression") {
      def.py = translateExprToPython(def.text ?? "", varIdsLongestFirst);
    } else if (def.type === "piecewise") {
      def.cases = (def.cases ?? []).map(c => ({
        when_py: translateExprToPython(c.when ?? "", varIdsLongestFirst),
        value_py: translateExprToPython(c.value ?? "", varIdsLongestFirst),
      }));
    }
  }

  const embeddedTablesJson = pythonLiteralTableSheets(modelObj);

  // Python source
  const lines = [];
  lines.push("#!/usr/bin/env python3");
  lines.push('"""');
  lines.push("Generated by the declarative model editor");
  lines.push(`Model id: ${modelObj?.model?.id ?? ""}`);
  lines.push(`Temporal indexSet: ${temporalId} (default ${tMin}..${tMax})`);
  lines.push("");
  lines.push("Runtime notes:");
  lines.push("- This is an interpreter specialized to the exported model.");
  lines.push("- If input tables exist as CSV files named input_<table>.csv next to this script,");
  lines.push("  they override the embedded sample table rows.");
  lines.push('"""');
  lines.push("");
  lines.push("from __future__ import annotations");
  lines.push("");
  lines.push("import argparse");
  lines.push("import csv");
  lines.push("import math");
  lines.push("import os");
  lines.push("from typing import Any, Dict, List, Tuple");
  lines.push("");

  // Embed metadata
  lines.push("# ---- Model metadata (embedded) ----");
  lines.push(`TEMPORAL_ID = ${escapePyString(temporalId)}`);
  lines.push(`INDEXSETS = ${JSON.stringify(indexSets, null, 2)}`);
  lines.push(`VAR_DOMAINS: Dict[str, List[str]] = ${JSON.stringify(domains, null, 2)}`);
  lines.push(`VAR_DEFS: Dict[str, Any] = ${JSON.stringify(defs, null, 2)}`);
  lines.push(`DEFAULT_TABLES: Dict[str, Any] = ${embeddedTablesJson}`);
  lines.push("");

  // Runtime helpers (tables + evaluation)
  lines.push("# ---- Runtime helpers ----");
  lines.push("def _coerce_cell(x: str) -> Any:");
  lines.push("    s = x.strip()");
  lines.push("    if s == '':");
  lines.push("        return ''");
  lines.push("    # try int, then float; else keep string");
  lines.push("    try:");
  lines.push("        if s.isdigit() or (s.startswith('-') and s[1:].isdigit()):");
  lines.push("            return int(s)");
  lines.push("    except Exception:");
  lines.push("        pass");
  lines.push("    try:");
  lines.push("        return float(s)");
  lines.push("    except Exception:");
  lines.push("        return s");
  lines.push("");

  lines.push("def load_tables_from_csv(base_dir: str, default_tables: Dict[str, Any]) -> Dict[str, Any]:");
  lines.push("    tables = {k: {'headers': v['headers'][:], 'rows': [r[:] for r in v['rows']]} for k, v in default_tables.items()}");
  lines.push("    for table_id in list(tables.keys()):");
  lines.push("        path = os.path.join(base_dir, f'input_{table_id}.csv')");
  lines.push("        if not os.path.exists(path):");
  lines.push("            continue");
  lines.push("        with open(path, newline='') as f:");
  lines.push("            rdr = csv.reader(f)");
  lines.push("            rows = list(rdr)");
  lines.push("        if not rows:");
  lines.push("            continue");
  lines.push("        headers = rows[0]");
  lines.push("        data = []");
  lines.push("        for r in rows[1:]:");
  lines.push("            if not r or all(c.strip() == '' for c in r):");
  lines.push("                continue");
  lines.push("            data.append([_coerce_cell(c) for c in r])");
  lines.push("        tables[table_id] = {'headers': headers, 'rows': data}");
  lines.push("    return tables");
  lines.push("");

  lines.push("def table_get(table: Dict[str, Any], row_key: Any, col_name: str) -> Any:");
  lines.push("    headers = table.get('headers') or []");
  lines.push("    rows = table.get('rows') or []");
  lines.push("    if col_name not in headers:");
  lines.push("        raise KeyError(f'Column {col_name} not found in table')");
  lines.push("    col_idx = headers.index(col_name)");
  lines.push("    # rowIndex is always column 0. Use exact match for non-numeric keys;" );
  lines.push("    # for numeric keys, use largest row_index <= key (stepwise curve)." );
  lines.push("    best = None");
  lines.push("    for r in rows:");
  lines.push("        if len(r) == 0:");
  lines.push("            continue");
  lines.push("        rk = r[0]");
  lines.push("        if isinstance(row_key, (int, float)) and isinstance(rk, (int, float)):");
  lines.push("            if rk <= row_key:");
  lines.push("                best = r");
  lines.push("            else:");
  lines.push("                break");
  lines.push("        else:");
  lines.push("            if rk == row_key:");
  lines.push("                best = r");
  lines.push("                break");
  lines.push("    if best is None:");
  lines.push("        return None");
  lines.push("    return best[col_idx] if col_idx < len(best) else None");
  lines.push("");

  lines.push("# Evaluation cache: (var_id, idx_tuple) -> value");
  lines.push("CACHE: Dict[Tuple[str, Tuple[Any, ...]], Any] = {}");
  lines.push("IN_PROGRESS: set[Tuple[str, Tuple[Any, ...]]] = set()" );
  lines.push("");

  lines.push("def V(var_id: str, *args: Any) -> Any:");
  lines.push("    dom = VAR_DOMAINS.get(var_id, [])");
  lines.push("    if len(args) > len(dom):");
  lines.push("        raise TypeError(f'{var_id} expects {len(dom)} args, got {len(args)}')");
  lines.push("    idx = dict(zip(dom, args))");
  lines.push("    return eval_var(var_id, idx)");
  lines.push("");

  lines.push("def eval_var(var_id: str, idx: Dict[str, Any]) -> Any:");
  lines.push("    dom = VAR_DOMAINS.get(var_id, [])");
  lines.push("    key_tuple = tuple(idx.get(d) for d in dom)");
  lines.push("    key = (var_id, key_tuple)");
  lines.push("    if key in CACHE:");
  lines.push("        return CACHE[key]");
  lines.push("    if key in IN_PROGRESS:");
  lines.push("        # break cycles gracefully");
  lines.push("        return 0.0");
  lines.push("    IN_PROGRESS.add(key)");
  lines.push("    d = VAR_DEFS.get(var_id) or {}" );
  lines.push("    t = d.get('type')" );
  lines.push("    try:" );
  lines.push("        if t in ('constant', 'expression'):" );
  lines.push("            expr = d.get('py') or '0'" );
  lines.push("            env = {'math': math, 'V': V, 'min': min, 'max': max, 'abs': abs, 'round': round, 'pow': pow, 'int': int}" );
  lines.push("            # also expose index variables like step/month/cohort as plain names" );
  lines.push("            env.update(idx)" );
  lines.push("            val = eval(expr, {'__builtins__': {}}, env)" );
  lines.push("        elif t == 'piecewise':" );
  lines.push("            val = 0.0" );
  lines.push("            for c in d.get('cases', []):" );
  lines.push("                cond = c.get('when_py') or 'False'" );
  lines.push("                env = {'math': math, 'V': V, 'min': min, 'max': max, 'abs': abs, 'round': round, 'pow': pow, 'int': int}" );
  lines.push("                env.update(idx)" );
  lines.push("                if bool(eval(cond, {'__builtins__': {}}, env)):" );
  lines.push("                    rhs = c.get('value_py') or '0'" );
  lines.push("                    val = eval(rhs, {'__builtins__': {}}, env)" );
  lines.push("                    break" );
  lines.push("        elif t == 'table':" );
  lines.push("            table_id = d.get('table')" );
  lines.push("            col = d.get('column')" );
  lines.push("            if not table_id or not col:" );
  lines.push("                val = None" );
  lines.push("            else:" );
  lines.push("                table = TABLES.get(table_id)" );
  lines.push("                if not table:" );
  lines.push("                    val = None" );
  lines.push("                else:" );
  lines.push("                    # row key: if a domain exists, use the first domain index; else use None" );
  lines.push("                    dom = VAR_DOMAINS.get(var_id, [])" );
  lines.push("                    row_key = idx.get(dom[0]) if dom else None" );
  lines.push("                    val = table_get(table, row_key, col)" );
  lines.push("        elif t == 'tableLookup':" );
  lines.push("            table_id = d.get('table')" );
  lines.push("            row_ref = d.get('row')" );
  lines.push("            col_sel = d.get('columnSelector')" );
  lines.push("            table = TABLES.get(table_id)" );
  lines.push("            if not table:" );
  lines.push("                val = None" );
  lines.push("            else:" );
  lines.push("                row_key = V(row_ref, *[idx.get(a) for a in VAR_DOMAINS.get(row_ref, [])]) if row_ref else idx.get(TEMPORAL_ID)" );
  lines.push("                if col_sel:" );
  lines.push("                    col_name = V(col_sel, *[idx.get(a) for a in VAR_DOMAINS.get(col_sel, [])])" );
  lines.push("                    val = table_get(table, row_key, str(col_name))" );
  lines.push("                else:" );
  lines.push("                    # default: second column" );
  lines.push("                    headers = table.get('headers') or []" );
  lines.push("                    if len(headers) < 2:" );
  lines.push("                        val = None" );
  lines.push("                    else:" );
  lines.push("                        val = table_get(table, row_key, headers[1])" );
  lines.push("        else:" );
  lines.push("            val = None" );
  lines.push("    finally:" );
  lines.push("        IN_PROGRESS.discard(key)" );
  lines.push("    # Excel-style blank semantics: treat missing values as 0.0" );
  lines.push("    if val is None:" );
  lines.push("        val = 0.0" );
  lines.push("    CACHE[key] = val" );
  lines.push("    return val" );
  lines.push("");

  // Export and iteration
  lines.push("def index_values(indexset_id: str, temporal_max: int, overrides: Dict[str, List[str]]) -> List[Any]:");
  lines.push("    # integer ranges if min/max exist; else use overrides or defaults");
  lines.push("    meta = next((x for x in INDEXSETS if x.get('id') == indexset_id), None)" );
  lines.push("    dt = str((meta or {}).get('dataType') or '').lower()" );
  lines.push("    if indexset_id == TEMPORAL_ID:" );
  lines.push("        # always 0..temporal_max" );
  lines.push("        return list(range(0, temporal_max + 1))" );
  lines.push("    if dt in ('integer', 'int') and meta and meta.get('min') is not None and meta.get('max') is not None:" );
  lines.push("        try:" );
  lines.push("            lo = int(float(meta['min']))" );
  lines.push("            hi = int(float(meta['max']))" );
  lines.push("            return list(range(lo, hi + 1))" );
  lines.push("        except Exception:" );
  lines.push("            pass" );
  lines.push("    # If any table uses this indexset as its rowIndex, infer values from that table's first column" );
  lines.push("    for tid, t in TABLES.items():" );
  lines.push("        hdr = (t.get('headers') or [])" );
  lines.push("        if hdr and hdr[0] == indexset_id:" );
  lines.push("            vals = []" );
  lines.push("            for r in (t.get('rows') or []):" );
  lines.push("                if r and r[0] not in vals:" );
  lines.push("                    vals.append(r[0])" );
  lines.push("            if vals:" );
  lines.push("                return vals" );
  lines.push("    # fallback: overrides from CLI" );
  lines.push("    if indexset_id in overrides:" );
  lines.push("        raw = overrides[indexset_id]" );
  lines.push("        # attempt numeric coercion" );
  lines.push("        out = []" );
  lines.push("        for s in raw:" );
  lines.push("            out.append(_coerce_cell(s))" );
  lines.push("        return out" );
  lines.push("    # final fallback" );
  lines.push("    return [1] if indexset_id.lower() == 'cohort' else ['default']" );
  lines.push("");

  lines.push("def main() -> None:");
  lines.push("    ap = argparse.ArgumentParser(description='Run exported model')");
  lines.push(`    ap.add_argument('--steps', type=int, default=${tMax}, help='temporal max (inclusive)')`);
  lines.push("    ap.add_argument('--csv', type=str, default='model_out.csv', help='output CSV path')");
  lines.push("    ap.add_argument('--index', action='append', default=[], help='Override index values: --index cohort=1,2 or --index day_type=weekday,weekend')");
  lines.push("    args = ap.parse_args()" );
  lines.push("");
  lines.push("    overrides: Dict[str, List[str]] = {}" );
  lines.push("    for item in args.index:" );
  lines.push("        if '=' not in item:" );
  lines.push("            continue" );
  lines.push("        k, v = item.split('=', 1)" );
  lines.push("        overrides[k.strip()] = [x.strip() for x in v.split(',') if x.strip() != '']" );
  lines.push("");
  lines.push("    base_dir = os.path.dirname(os.path.abspath(__file__))" );
  lines.push("    global TABLES" );
  lines.push("    TABLES = load_tables_from_csv(base_dir, DEFAULT_TABLES)" );
  lines.push("    temporal_max = int(args.steps)" );
  lines.push("    if temporal_max < 0: raise SystemExit('steps must be >= 0')" );
  lines.push("");

  lines.push("    # Determine index values for all index sets used by any variable" );
  lines.push("    used_indexsets = set()" );
  lines.push("    for dom in VAR_DOMAINS.values():" );
  lines.push("        for d in dom:" );
  lines.push("            used_indexsets.add(d)" );
  lines.push("    idx_vals: Dict[str, List[Any]] = {d: index_values(d, temporal_max, overrides) for d in used_indexsets}" );
  lines.push("");

  lines.push("    # Build output columns: all variables (scalar first), then indexed" );
  lines.push("    scalar_vars = [vid for vid, dom in VAR_DOMAINS.items() if len(dom) == 0]" );
  lines.push("    indexed_vars = [vid for vid, dom in VAR_DOMAINS.items() if len(dom) > 0]" );
  lines.push("    scalar_vars.sort()" );
  lines.push("    indexed_vars.sort()" );
  lines.push("");

  lines.push("    # For CSV output, we emit one row per combination of index values for indexed vars." );
  lines.push("    # To keep files manageable, we use the union of domains: one big cartesian product over used_indexsets." );
  lines.push("    axis = sorted(list(used_indexsets), key=lambda x: (x != TEMPORAL_ID, x))" );
  lines.push("    headers = axis + scalar_vars + indexed_vars" );
  lines.push("    with open(args.csv, 'w', newline='') as f:" );
  lines.push("        w = csv.writer(f)" );
  lines.push("        w.writerow(headers)" );

  lines.push("        # Precompute scalar values once" );
  lines.push("        scalar_vals = {vid: eval_var(vid, {}) for vid in scalar_vars}" );

  lines.push("        # Cartesian product over axis" );
  lines.push("        def rec(i: int, cur: Dict[str, Any]):" );
  lines.push("            if i >= len(axis):" );
  lines.push("                row = [cur.get(a) for a in axis]" );
  lines.push("                row += [scalar_vals.get(v) for v in scalar_vars]" );
  lines.push("                for v in indexed_vars:" );
  lines.push("                    dom = VAR_DOMAINS.get(v, [])" );
  lines.push("                    idx = {d: cur.get(d) for d in dom}" );
  lines.push("                    row.append(eval_var(v, idx))" );
  lines.push("                w.writerow(row)" );
  lines.push("                return" );
  lines.push("            a = axis[i]" );
  lines.push("            for val in idx_vals.get(a, []):" );
  lines.push("                cur[a] = val" );
  lines.push("                rec(i + 1, cur)" );
  lines.push("            cur.pop(a, None)" );

  lines.push("        rec(0, {})" );
  lines.push("");
  lines.push("    print(f'Wrote {args.csv}')" );
  lines.push("");
  lines.push("if __name__ == '__main__':" );
  lines.push("    main()" );

  return lines.join("\n");
}
