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
// Helpers
// ------------------------------------------------------------

function normalize(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function escapeRString(s) {
  return JSON.stringify(String(s ?? ""));
}

/**
 * Translate a model expression string to valid R code.
 *
 * Transformations applied (in order):
 *  1. Ternary cond ? a : b  ->  ifelse(cond, a, b)
 *  2. Power operator ^       stays as ^ (R native)
 *  3. Vendor not-equal <>    -> !=
 *  4. Equality test =        -> ==  (avoid touching <=, >=, !=, ==)
 *  5. Math functions         -> R equivalents
 *  6. Variable calls         -> G("var", ...)
 *  7. Bare variable ids      -> G("var")
 */
function translateExprToR(expr, varIdsLongestFirst, domains, temporalId) {
  let s = normalize(expr);
  if (!s) return "0";

  // 1. Ternary: cond ? a : b -> ifelse(cond, a, b)
  s = convertTernary(s);

  // 2. ^ stays as ^ in R

  // 3. Vendor not-equal
  s = s.replace(/<>/g, "!=");

  // 4. Equality test: single = -> ==
  s = s.replace(/(?<![!<>=])=(?!=)/g, "==");

  // 5. Math function names to R equivalents
  s = s
    .replace(/\bfloor\s*\(/gi, "floor(")
    .replace(/\bceiling\s*\(/gi, "ceiling(")
    .replace(/\bceil\s*\(/gi, "ceiling(")
    .replace(/\bexp\s*\(/gi, "exp(")
    .replace(/\blog\s*\(/gi, "log(")
    .replace(/\bsin\s*\(/gi, "sin(")
    .replace(/\bcos\s*\(/gi, "cos(")
    .replace(/\btan\s*\(/gi, "tan(")
    .replace(/\basin\s*\(/gi, "asin(")
    .replace(/\bacos\s*\(/gi, "acos(")
    .replace(/\batan\s*\(/gi, "atan(")
    .replace(/\bsqrt\s*\(/gi, "sqrt(")
    .replace(/\babs\s*\(/gi, "abs(")
    .replace(/\bround\s*\(/gi, "round(")
    .replace(/\bint\s*\(/gi, "as.integer(")
    .replace(/\bfloat\s*\(/gi, "as.numeric(");

  // 6+7. Variable id rewrites – same pattern as Python renderer
  //      Vendor-format: 0-arg vars sometimes appear as vid(anything)
  for (const vid of varIdsLongestFirst) {
    const dom = Array.isArray(domains?.[vid]) ? domains[vid].map(String) : [];
    const esc = vid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    if (dom.length === 0) {
      s = s.replace(new RegExp(`\\b${esc}\\s*\\(\\s*[^)]*\\)`, "g"), `G(${escapeRString(vid)})`);
      continue;
    }

    const d0 = (dom[0] || "").toLowerCase();
    const d1 = String(dom[1] || "");
    if (dom.length === 2 && d0 === "cohort" && d1 === temporalId) {
      s = s.replace(
        new RegExp(`\\b${esc}\\s*\\(\\s*([^,)]*)\\)`, "g"),
        (m, arg) => `${vid}(cohort, ${arg.trim()})`
      );
    }
  }

  for (const vid of varIdsLongestFirst) {
    const esc = vid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`\\b${esc}\\s*\\(`, "g"), `G(${escapeRString(vid)}, `);
  }

  for (const vid of varIdsLongestFirst) {
    s = replaceBareIdOutsideStrings(s, vid, escapeRString(vid));
  }

  return s;
}

function convertTernary(expr) {
  let s = String(expr ?? "");
  let depth = 0;
  let qPos = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === "?" && depth === 0) { qPos = i; break; }
  }
  if (qPos === -1) return s;
  depth = 0;
  let colonPos = -1;
  for (let i = qPos + 1; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === ":" && depth === 0) { colonPos = i; break; }
  }
  if (colonPos === -1) return s;
  const cond = s.slice(0, qPos).trim();
  const a = s.slice(qPos + 1, colonPos).trim();
  const b = s.slice(colonPos + 1).trim();
  return `ifelse(${cond}, ${a}, ${b})`;
}

function replaceBareIdOutsideStrings(input, vid, replacement) {
  const esc = vid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${esc}\\b(?!\\s*\\()`, "g");
  if (!input.includes('"')) {
    return input.replace(re, `G(${replacement})`);
  }
  let out = "";
  let last = 0;
  let inStr = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && input[i - 1] !== "\\") {
      if (!inStr) {
        out += input.slice(last, i).replace(re, `G(${replacement})`);
      } else {
        out += input.slice(last, i);
      }
      inStr = !inStr;
      out += ch;
      last = i + 1;
    }
  }
  if (!inStr) out += input.slice(last).replace(re, `G(${replacement})`);
  else out += input.slice(last);
  return out;
}

function rLiteralTableSheets(modelObj) {
  const sheets = buildTableSheetsData(modelObj);
  const tables = {};
  for (const s of sheets) {
    const tableId = String(s.name).replace(/^input_/, "");
    tables[tableId] = { headers: s.headers, rows: s.dataRows };
  }
  return tables;
}

function rLiteralValue(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return isFinite(v) ? String(v) : "NA_real_";
  return escapeRString(v);
}

function rLiteralList(obj) {
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "list()";
    return "list(" + obj.map(rLiteralList).join(", ") + ")";
  }
  if (obj !== null && typeof obj === "object") {
    const entries = Object.entries(obj);
    if (entries.length === 0) return "list()";
    return "list(" + entries.map(([k, v]) => `${JSON.stringify(k)}=${rLiteralList(v)}`).join(", ") + ")";
  }
  return rLiteralValue(obj);
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/**
 * Export a validated model as a runnable R script.
 *
 * The generated script is a small interpreter specialized to this model:
 *  - embeds variable definitions and domains
 *  - embeds default sample table inputs (same as XLSX sample rows)
 *  - optionally loads input_{table}.csv files at runtime to override samples
 *
 * @param {object} modelObj  - validated model object
 * @param {object} features  - model features from validateModelCore
 * @returns {string}         - R source code
 */
export function renderModelAsR(modelObj, features) {
  if (!modelObj?.model) throwModelError("Invalid model object");
  if (!features?.resolvedVarsWithArguments) throwModelError("Invalid model features");
  if (!features?.incoming) throwModelError("Invalid model features (missing incoming dependencies)");

  const variableMap = buildVariableMap(modelObj);
  const varIds = Array.from(variableMap.values()).map(v => String(v.id));
  const varIdsLongestFirst = [...varIds].sort((a, b) => b.length - a.length);

  const indexSets = asArray(modelObj?.model?.indexSets?.indexSet).map(is => ({
    id: String(is?.id ?? ""),
    role: String(is?.role ?? ""),
    dataType: String(is?.dataType ?? is?.datatype ?? ""),
    min: is?.min,
    max: is?.max,
  })).filter(x => x.id);

  const temporalId = getTemporalIndexSetId(modelObj) ?? "step";
  const { min: tMin, max: tMax } = getStepRange(modelObj, temporalId);

  // Build variable definitions and domains
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

  // Translate expressions to R
  for (const [id, def] of Object.entries(defs)) {
    if (def.type === "constant" || def.type === "expression") {
      def.r_expr = translateExprToR(def.text ?? "", varIdsLongestFirst, domains, temporalId);
    } else if (def.type === "piecewise") {
      def.cases = (def.cases ?? []).map(c => ({
        when_r: translateExprToR(c.when ?? "", varIdsLongestFirst, domains, temporalId),
        value_r: translateExprToR(c.value ?? "", varIdsLongestFirst, domains, temporalId),
      }));
    }
  }

  const embeddedTables = rLiteralTableSheets(modelObj);

  // Topological sort (shift==0 edges only)
  const topoVars = topoSortVarsForPoint(defs, buildDeps(features, variableMap));

  const L = (s = "") => s;
  const lines = [];
  const push = (...ss) => ss.forEach(s => lines.push(L(s)));

  // Header
  push(
    "#!/usr/bin/env Rscript",
    "# Generated by the declarative model editor",
    `# Model id: ${modelObj?.model?.id ?? ""}`,
    `# Temporal indexSet: ${temporalId} (default ${tMin}..${tMax})`,
    "#",
    "# Runtime notes:",
    "# - This is an interpreter specialized to the exported model.",
    "# - If input tables exist as CSV files named input_<table>.csv next to this script,",
    "#   they override the embedded sample table rows.",
    "# - Command-line arguments (when run via Rscript):",
    "#     --steps N      : temporal max (inclusive, default shown above)",
    "#     --csv PATH     : output CSV path",
    "#     --index id=v1,v2 : override index set values",
    "#     --strict       : fail fast on evaluation errors",
    ""
  );

  // Model metadata
  push(
    "# ---- Model metadata (embedded) ----",
    `TEMPORAL_ID <- ${escapeRString(temporalId)}`,
    `MODEL_ID <- ${escapeRString(String(modelObj?.model?.id ?? "model"))}`,
    `TEMP_MIN <- ${tMin}L`,
    `TEMP_MAX <- ${tMax}L`,
    `INDEXSETS <- ${rLiteralList(indexSets)}`,
    `VAR_DOMAINS <- ${rLiteralList(domains)}`,
    `TOPO_VARS <- ${rLiteralList(topoVars)}`,
    `VAR_DEFS <- ${rLiteralList(defs)}`,
    ""
  );

  // Embedded table data
  push("# ---- Embedded default table inputs ----");
  push(`DEFAULT_TABLES <- ${rLiteralList(embeddedTables)}`);
  push("");

  // Runtime helpers
  push(
    "# ---- Runtime helpers ----",
    ".r_nan <- function() NA_real_",
    "",
    ".sanitize_filename <- function(name) {",
    "  s <- gsub('[^A-Za-z0-9_\\\\-]', '_', as.character(name %||% 'model'))",
    "  s <- gsub('_+', '_', s)",
    "  s <- gsub('^_+|_+$', '', s)",
    "  if (nchar(s) == 0) 'model' else s",
    "}",
    "",
    "`%||%` <- function(a, b) if (!is.null(a) && length(a) > 0 && !is.na(a[[1]])) a else b",
    "",
    ".coerce_cell <- function(x) {",
    "  s <- trimws(as.character(x))",
    "  if (s == '') return('')",
    "  n <- suppressWarnings(as.integer(s))",
    "  if (!is.na(n) && as.character(n) == s) return(n)",
    "  d <- suppressWarnings(as.numeric(s))",
    "  if (!is.na(d)) return(d)",
    "  return(s)",
    "}",
    "",
    "load_tables_from_csv <- function(base_dir, default_tables) {",
    "  tables <- lapply(default_tables, function(t) list(headers=t$headers, rows=t$rows))",
    "  sources <- setNames(rep('embedded', length(tables)), names(tables))",
    "  for (table_id in names(tables)) {",
    "    path <- file.path(base_dir, paste0('input_', table_id, '.csv'))",
    "    if (!file.exists(path)) next",
    "    raw <- read.csv(path, header=TRUE, stringsAsFactors=FALSE, check.names=FALSE)",
    "    headers <- colnames(raw)",
    "    rows <- lapply(seq_len(nrow(raw)), function(i) lapply(as.list(raw[i, ]), .coerce_cell))",
    "    tables[[table_id]] <- list(headers=headers, rows=rows)",
    "    sources[[table_id]] <- paste0('csv:', path)",
    "  }",
    "  list(tables=tables, sources=sources)",
    "}",
    "",
    "table_get <- function(tbl, row_key, col_name) {",
    "  headers <- tbl$headers",
    "  rows <- tbl$rows",
    "  col_idx <- match(col_name, headers)",
    "  if (is.na(col_idx)) stop(paste('Column', col_name, 'not found in table'))",
    "  best <- NULL",
    "  for (r in rows) {",
    "    rk <- r[[1]]",
    "    if (is.numeric(row_key) && is.numeric(rk)) {",
    "      if (rk <= row_key) best <- r",
    "      else break",
    "    } else {",
    "      if (identical(rk, row_key) || rk == row_key) { best <- r; break }",
    "    }",
    "  }",
    "  if (is.null(best)) return(NA)",
    "  if (col_idx > length(best)) return(NA)",
    "  v <- best[[col_idx]]",
    "  if (is.null(v)) NA else v",
    "}",
    "",
    "safe_table_get <- function(tbl, row_key, col_name, var_id, key) {",
    "  tryCatch(",
    "    table_get(tbl, row_key, col_name),",
    "    error = function(e) {",
    "      if (isTRUE(STRICT)) stop(e)",
    "      .record_error('table_get', var_id, key, paste('table_get(...,', row_key, ',', col_name, ')'), e)",
    "      .r_nan()",
    "    }",
    "  )",
    "}",
    "",
    "# Evaluation cache: named environment  (key -> value)",
    "CACHE <- new.env(hash=TRUE, parent=emptyenv())",
    "ERRORS <- list()",
    "SEEN_ERRORS <- character(0)",
    "STRICT <- FALSE",
    "TABLES <- list()",
    "",
    ".record_error <- function(kind, var_id, key, expr, err) {",
    "  k <- paste(kind, var_id, paste(key, collapse=','), expr, sep='|')",
    "  if (k %in% SEEN_ERRORS) return(invisible(NULL))",
    "  SEEN_ERRORS <<- c(SEEN_ERRORS, k)",
    "  ERRORS[[length(ERRORS)+1]] <<- list(kind=kind, var=var_id, idx=key, expr=expr, error=conditionMessage(err))",
    "  invisible(NULL)",
    "}",
    "",
    ".key <- function(var_id, idx_list, dom) {",
    "  vals <- vapply(dom, function(d) as.character(idx_list[[d]] %||% 'NA'), character(1))",
    "  paste(c(var_id, vals), collapse='|')",
    "}",
    "",
    "G <- function(var_id, ...) {",
    "  dom <- VAR_DOMAINS[[var_id]] %||% character(0)",
    "  args <- list(...)",
    "  if (length(args) > length(dom)) {",
    "    warning(paste(var_id, 'expects', length(dom), 'args, got', length(args)))",
    "    args <- args[seq_len(length(dom))]",
    "  }",
    "  idx <- setNames(args, dom[seq_along(args)])",
    "  key <- .key(var_id, idx, dom)",
    "  if (exists(key, envir=CACHE, inherits=FALSE)) return(get(key, envir=CACHE, inherits=FALSE))",
    "  val <- tryCatch(",
    "    compute_value(var_id, idx),",
    "    error = function(e) {",
    "      if (isTRUE(STRICT)) stop(e)",
    "      .record_error('G', var_id, key, 'compute_value', e)",
    "      .r_nan()",
    "    }",
    "  )",
    "  if (is.null(val)) val <- .r_nan()",
    "  assign(key, val, envir=CACHE)",
    "  val",
    "}",
    "",
    ".make_eval_env <- function(idx_list) {",
    "  env <- list2env(as.list(idx_list), parent=baseenv())",
    "  env$G <- G",
    "  env$ifelse <- ifelse",
    "  env$min <- min; env$max <- max; env$abs <- abs",
    "  env$round <- round; env$floor <- floor; env$ceiling <- ceiling",
    "  env$exp <- exp; env$log <- log; env$sqrt <- sqrt",
    "  env$sin <- sin; env$cos <- cos; env$tan <- tan",
    "  env$asin <- asin; env$acos <- acos; env$atan <- atan",
    "  env$as.integer <- as.integer; env$as.numeric <- as.numeric",
    "  env",
    "}",
    "",
    "safe_eval <- function(expr_str, env, kind, var_id, key) {",
    "  tryCatch(",
    "    eval(parse(text=expr_str), envir=env),",
    "    error = function(e) {",
    "      if (isTRUE(STRICT)) stop(e)",
    "      .record_error(kind, var_id, key, expr_str, e)",
    "      .r_nan()",
    "    }",
    "  )",
    "}",
    "",
    "compute_value <- function(var_id, idx) {",
    "  d <- VAR_DEFS[[var_id]]",
    "  if (is.null(d)) return(.r_nan())",
    "  t <- d$type",
    "  dom <- VAR_DOMAINS[[var_id]] %||% character(0)",
    "  key <- .key(var_id, idx, dom)",
    "  if (t %in% c('constant', 'expression')) {",
    "    expr_str <- d$r_expr %||% '0'",
    "    if (is.null(expr_str) || expr_str == '') return(0)",
    "    env <- .make_eval_env(idx)",
    "    return(safe_eval(expr_str, env, 'expr', var_id, key))",
    "  }",
    "  if (t == 'piecewise') {",
    "    cases <- d$cases %||% list()",
    "    for (case_item in cases) {",
    "      env <- .make_eval_env(idx)",
    "      cond <- tryCatch(eval(parse(text=case_item$when_r %||% 'FALSE'), envir=env), error=function(e) FALSE)",
    "      if (isTRUE(cond)) {",
    "        return(safe_eval(case_item$value_r %||% '0', env, 'pw_rhs', var_id, key))",
    "      }",
    "    }",
    "    return(.r_nan())",
    "  }",
    "  if (t == 'table') {",
    "    table_id <- d$table",
    "    col <- d$column",
    "    tbl <- TABLES[[table_id]]",
    "    if (is.null(tbl) || is.null(col) || col == '') return(.r_nan())",
    "    row_key <- idx[[dom[[1]]]] %||% NULL",
    "    return(safe_table_get(tbl, row_key, col, var_id, key))",
    "  }",
    "  if (t == 'tableLookup') {",
    "    table_id <- d$table",
    "    row_ref <- d$row",
    "    col_sel <- d$columnSelector",
    "    tbl <- TABLES[[table_id]]",
    "    if (is.null(tbl)) return(.r_nan())",
    "    if (!is.null(row_ref) && row_ref != '') {",
    "      row_dom <- VAR_DOMAINS[[row_ref]] %||% character(0)",
    "      row_args <- lapply(row_dom, function(d) idx[[d]])",
    "      row_key <- do.call(G, c(list(row_ref), row_args))",
    "    } else {",
    "      row_key <- idx[[TEMPORAL_ID]] %||% NULL",
    "    }",
    "    if (!is.null(col_sel) && col_sel != '') {",
    "      col_dom <- VAR_DOMAINS[[col_sel]] %||% character(0)",
    "      col_args <- lapply(col_dom, function(d) idx[[d]])",
    "      col_name <- as.character(do.call(G, c(list(col_sel), col_args)))",
    "      return(safe_table_get(tbl, row_key, col_name, var_id, key))",
    "    }",
    "    headers <- tbl$headers %||% character(0)",
    "    if (length(headers) < 2) return(.r_nan())",
    "    return(safe_table_get(tbl, row_key, headers[[2]], var_id, key))",
    "  }",
    "  .r_nan()",
    "}",
    "",
    "compute_point <- function(idx) {",
    "  for (var_id in TOPO_VARS) {",
    "    dom <- VAR_DOMAINS[[var_id]] %||% character(0)",
    "    key <- .key(var_id, idx, dom)",
    "    if (exists(key, envir=CACHE, inherits=FALSE)) next",
    "    val <- compute_value(var_id, idx)",
    "    if (is.null(val)) val <- .r_nan()",
    "    assign(key, val, envir=CACHE)",
    "  }",
    "}",
    "",
    "index_values <- function(indexset_id, temp_max, overrides) {",
    "  meta <- NULL",
    "  for (is in INDEXSETS) {",
    "    if (is$id == indexset_id) { meta <- is; break }",
    "  }",
    "  dt <- tolower(as.character((meta %||% list())$dataType %||% ''))",
    "  if (indexset_id == TEMPORAL_ID) return(as.list(seq(0L, temp_max)))",
    "  if (dt %in% c('integer', 'int') && !is.null(meta$min) && !is.null(meta$max)) {",
    "    lo <- suppressWarnings(as.integer(meta$min))",
    "    hi <- suppressWarnings(as.integer(meta$max))",
    "    if (!is.na(lo) && !is.na(hi)) return(as.list(seq(lo, hi)))",
    "  }",
    "  if (indexset_id %in% names(overrides)) {",
    "    raw <- strsplit(overrides[[indexset_id]], ',')[[1]]",
    "    return(lapply(raw, .coerce_cell))",
    "  }",
    "  for (tid in names(TABLES)) {",
    "    hdr <- TABLES[[tid]]$headers %||% character(0)",
    "    if (length(hdr) > 0 && hdr[[1]] == indexset_id) {",
    "      vals <- unique(lapply(TABLES[[tid]]$rows, function(r) r[[1]]))",
    "      if (length(vals) > 0) return(vals)",
    "    }",
    "  }",
    "  if (tolower(indexset_id) == 'cohort') list(1L) else list('default')",
    "}",
    ""
  );

  // Main function
  push(
    "main <- function() {",
    "  # Parse command-line arguments when running via Rscript",
    "  args <- commandArgs(trailingOnly=TRUE)",
    `  steps <- ${tMax}L`,
    `  csv_path <- paste0(.sanitize_filename(MODEL_ID), '_out.csv')`,
    "  overrides <- list()",
    "  strict_mode <- FALSE",
    "  i <- 1L",
    "  while (i <= length(args)) {",
    "    a <- args[[i]]",
    "    if (a == '--steps' && i < length(args)) {",
    "      steps <- as.integer(args[[i+1]]); i <- i + 2L; next",
    "    }",
    "    if (a == '--csv' && i < length(args)) {",
    "      csv_path <- args[[i+1]]; i <- i + 2L; next",
    "    }",
    "    if (a == '--index' && i < length(args)) {",
    "      kv <- strsplit(args[[i+1]], '=', fixed=TRUE)[[1]]",
    "      if (length(kv) == 2) overrides[[kv[[1]]]] <- kv[[2]]",
    "      i <- i + 2L; next",
    "    }",
    "    if (a == '--strict') { strict_mode <- TRUE }",
    "    i <- i + 1L",
    "  }",
    "  STRICT <<- strict_mode",
    "",
    "  # Load tables (CSV overrides take precedence over embedded defaults)",
    "  result <- load_tables_from_csv(dirname(sys.frame(1)$ofile %||% '.'), DEFAULT_TABLES)",
    "  TABLES <<- result$tables",
    "",
    "  # Compute index set values",
    "  idx_vals <- setNames(",
    "    lapply(vapply(INDEXSETS, function(is) is$id, character(1)), function(id) index_values(id, steps, overrides)),",
    "    vapply(INDEXSETS, function(is) is$id, character(1))",
    "  )",
    "  if (is.null(idx_vals[[TEMPORAL_ID]])) idx_vals[[TEMPORAL_ID]] <- as.list(seq(0L, steps))",
    "",
    "  # Build all index combinations",
    "  non_temporal_ids <- setdiff(names(idx_vals), TEMPORAL_ID)",
    "  non_temporal_vals <- idx_vals[non_temporal_ids]",
    "",
    "  combos <- list(list())",
    "  for (is_id in non_temporal_ids) {",
    "    new_combos <- list()",
    "    for (combo in combos) {",
    "      for (val in idx_vals[[is_id]]) {",
    "        new_combo <- combo",
    "        new_combo[[is_id]] <- val",
    "        new_combos <- c(new_combos, list(new_combo))",
    "      }",
    "    }",
    "    combos <- new_combos",
    "  }",
    "  if (length(combos) == 0) combos <- list(list())",
    "",
    "  # Iterate and compute",
    "  temporal_steps <- idx_vals[[TEMPORAL_ID]] %||% as.list(seq(0L, steps))",
    "  for (base_idx in combos) {",
    "    for (t_val in temporal_steps) {",
    "      idx <- base_idx",
    "      idx[[TEMPORAL_ID]] <- t_val",
    "      compute_point(idx)",
    "    }",
    "  }",
    "",
    "  # Collect results and write CSV",
    "  out_rows <- list()",
    "  hdr <- c(names(idx_vals), TOPO_VARS)",
    "  out_rows[[1]] <- hdr",
    "",
    "  for (base_idx in combos) {",
    "    for (t_val in temporal_steps) {",
    "      idx <- base_idx",
    "      idx[[TEMPORAL_ID]] <- t_val",
    "      row_vals <- c(",
    "        lapply(names(idx_vals), function(id) as.character(idx[[id]] %||% '')),",
    "        lapply(TOPO_VARS, function(vid) {",
    "          dom <- VAR_DOMAINS[[vid]] %||% character(0)",
    "          key <- .key(vid, idx, dom)",
    "          val <- if (exists(key, envir=CACHE, inherits=FALSE)) get(key, envir=CACHE, inherits=FALSE) else NA",
    "          as.character(val %||% NA)",
    "        })",
    "      )",
    "      out_rows <- c(out_rows, list(row_vals))",
    "    }",
    "  }",
    "",
    "  # Write to CSV",
    "  df <- do.call(rbind, lapply(out_rows[-1], function(r) {",
    "    setNames(as.data.frame(t(unlist(r)), stringsAsFactors=FALSE), out_rows[[1]])",
    "  }))",
    "  if (nrow(df) > 0) {",
    "    write.csv(df, csv_path, row.names=FALSE)",
    `    cat(paste0('Output written to: ', csv_path, '\\n'))`,
    "  }",
    "",
    "  # Report errors",
    "  if (length(ERRORS) > 0) {",
    "    cat(paste0(length(ERRORS), ' evaluation error(s) encountered (use --strict to fail fast)\\n'))",
    "  }",
    "",
    "  invisible(df)",
    "}",
    "",
    "# Run main() when executed as a script (not when sourced)",
    "if (!interactive()) {",
    "  main()",
    "}"
  );

  return lines.join("\n") + "\n";
}

// ------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------

function buildDeps(features, variableMap) {
  const deps = {};
  for (const v of variableMap.values()) {
    const id = String(v.id);
    const key = id.toUpperCase();
    const inc = features.incoming.get(key) || features.incoming.get(id) || new Set();
    const arr = Array.from(inc).map(d => {
      const raw = String(d.name ?? "");
      const canon = variableMap.get(raw.toUpperCase())?.id || raw;
      return { name: String(canon), shift: Number(d.shift || 0) };
    });
    arr.sort((a, b) => a.name.localeCompare(b.name) || (a.shift - b.shift));
    deps[id] = arr;
  }
  return deps;
}

function topoSortVarsForPoint(defs, deps) {
  const ids = Object.keys(defs).map(String);
  const adj = new Map();
  const indeg = new Map();
  for (const id of ids) {
    adj.set(id, new Set());
    indeg.set(id, 0);
  }
  for (const [to, arr] of Object.entries(deps)) {
    for (const d of (arr || [])) {
      const from = String(d?.name ?? "");
      const shift = Number(d?.shift ?? 0);
      if (!from || from === to) continue;
      if (shift !== 0) continue;
      if (!adj.has(from) || !adj.has(to)) continue;
      if (!adj.get(from).has(to)) {
        adj.get(from).add(to);
        indeg.set(to, (indeg.get(to) || 0) + 1);
      }
    }
  }
  const ready = ids.filter(id => (indeg.get(id) || 0) === 0).sort();
  const out = [];
  while (ready.length) {
    const id = ready.shift();
    out.push(id);
    for (const nxt of adj.get(id) || []) {
      indeg.set(nxt, (indeg.get(nxt) || 0) - 1);
      if ((indeg.get(nxt) || 0) === 0) {
        const pos = ready.findIndex(x => x.localeCompare(nxt) > 0);
        if (pos === -1) ready.push(nxt);
        else ready.splice(pos, 0, nxt);
      }
    }
  }
  if (out.length !== ids.length) {
    return out.concat(ids.filter(id => !out.includes(id)).sort());
  }
  return out;
}
