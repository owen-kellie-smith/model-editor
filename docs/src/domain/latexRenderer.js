import { asArray, throwModelError } from "../utils/helpers.js";
import {
  buildVariableMap,
  getDefinitionText,
  getDefinitionType,
} from "./renderShared.js";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function normalize(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/** Escape characters that are special in LaTeX text mode. */
function escapeLatexText(s) {
  // Process each character individually to avoid chained-replacement bugs
  // where an introduced backslash would be re-escaped by a subsequent pass.
  return String(s ?? "").split("").map(ch => {
    switch (ch) {
      case "\\": return "\\textbackslash{}";
      case "{":  return "\\{";
      case "}":  return "\\}";
      case "$":  return "\\$";
      case "#":  return "\\#";
      case "%":  return "\\%";
      case "&":  return "\\&";
      case "~":  return "\\textasciitilde{}";
      case "^":  return "\\textasciicircum{}";
      case "_":  return "\\_";
      default:   return ch;
    }
  }).join("");
}

/**
 * Convert a variable id to a LaTeX command: underscores become subscripts.
 * e.g. "annual_pv" -> "\text{annual\_pv}" or "annual\_{pv}" style
 * We wrap in \text{} so it renders as roman (non-italic) text in math mode.
 */
function varToLatex(id) {
  const parts = String(id).split("_");
  if (parts.length === 1) {
    return `\\text{${escapeLatexText(id)}}`;
  }
  // first part is the "name", remaining become a subscript
  const base = escapeLatexText(parts[0]);
  const sub = escapeLatexText(parts.slice(1).join("\\_"));
  return `\\text{${base}}_{\\text{${sub}}}`;
}

/**
 * Extract the argument of a function call by matching balanced parentheses.
 * @param {string} s - The full expression string
 * @param {number} openPos - Index of the opening '('
 * @returns {{ arg: string, end: number } | null} arg content and index of closing ')'
 */
function extractBalancedArg(s, openPos) {
  if (s[openPos] !== "(") return null;
  let depth = 0;
  for (let i = openPos; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return { arg: s.slice(openPos + 1, i), end: i };
    }
  }
  return null;
}

/**
 * Replace all occurrences of funcName(...) using balanced-parenthesis extraction.
 * The replaceFn receives the balanced argument string.
 */
function replaceFuncBalanced(s, funcName, replaceFn) {
  const re = new RegExp(`\\b${funcName}\\s*\\(`, "gi");
  let result = "";
  let last = 0;
  let match;
  while ((match = re.exec(s)) !== null) {
    const openPos = match.index + match[0].length - 1;
    const extracted = extractBalancedArg(s, openPos);
    if (!extracted) continue;
    result += s.slice(last, match.index) + replaceFn(extracted.arg);
    last = extracted.end + 1;
    re.lastIndex = last;
  }
  result += s.slice(last);
  return result;
}

/**
 * Best-effort translation of a model expression to LaTeX math.
 *
 * Transformations:
 *  1. Power ^  ->  ^{}
 *  2. Ternary cond ? a : b  ->  \begin{cases} a & \text{if } cond \\ b & \text{otherwise} \end{cases}
 *  3. sqrt(x)  ->  \sqrt{x}
 *  4. exp(x)   ->  e^{x}
 *  5. log(x)   ->  \ln(x)
 *  6. abs(x)   ->  |x|
 *  7. ceil/ceiling(x)  ->  \lceil x \rceil
 *  8. floor(x) ->  \lfloor x \rfloor
 *  9. Variable identifiers -> \text{var\_name}
 * 10. * -> \cdot
 * 11. <= -> \leq,  >= -> \geq,  != -> \neq,  <> -> \neq
 */
function exprToLatex(expr, varIdsLongestFirst) {
  let s = normalize(expr);
  if (!s) return "0";

  // Relational operators (do before other replacements)
  s = s.replace(/!=/g, "\\neq ");
  s = s.replace(/<>/g, "\\neq ");
  s = s.replace(/<=/g, "\\leq ");
  s = s.replace(/>=/g, "\\geq ");
  // Equality: lone = in model expressions means equality test (leave as-is in LaTeX)
  // s = s.replace(...)  // no transformation needed; = is already valid LaTeX

  // Ternary: convert to \text{if}/\text{else}
  s = convertTernaryLatex(s);

  // Named functions -> LaTeX using balanced parenthesis extraction
  s = replaceFuncBalanced(s, "sqrt", (arg) => `\\sqrt{${exprToLatex(arg, varIdsLongestFirst)}}`);
  s = replaceFuncBalanced(s, "exp", (arg) => `e^{${exprToLatex(arg, varIdsLongestFirst)}}`);
  s = replaceFuncBalanced(s, "log", (arg) => `\\ln(${exprToLatex(arg, varIdsLongestFirst)})`);
  s = replaceFuncBalanced(s, "abs", (arg) => `|${exprToLatex(arg, varIdsLongestFirst)}|`);
  s = replaceFuncBalanced(s, "ceiling", (arg) => `\\lceil ${exprToLatex(arg, varIdsLongestFirst)} \\rceil`);
  s = replaceFuncBalanced(s, "ceil", (arg) => `\\lceil ${exprToLatex(arg, varIdsLongestFirst)} \\rceil`);
  s = replaceFuncBalanced(s, "floor", (arg) => `\\lfloor ${exprToLatex(arg, varIdsLongestFirst)} \\rfloor`);
  s = s.replace(/\bsin\s*\(/gi, "\\sin(");
  s = s.replace(/\bcos\s*\(/gi, "\\cos(");
  s = s.replace(/\btan\s*\(/gi, "\\tan(");
  s = s.replace(/\basin\s*\(/gi, "\\arcsin(");
  s = s.replace(/\bacos\s*\(/gi, "\\arccos(");
  s = s.replace(/\batan\s*\(/gi, "\\arctan(");
  s = s.replace(/\bmin\s*\(/gi, "\\min(");
  s = s.replace(/\bmax\s*\(/gi, "\\max(");
  s = s.replace(/\bround\s*\(/gi, "\\operatorname{round}(");

  // Power operator: a^b -> a^{b}  (basic: wrap token or bracketed group after ^)
  s = s.replace(/\^([A-Za-z0-9_.]+)/g, "^{$1}");
  s = s.replace(/\^\(([^)]*)\)/g, "^{$1}");

  // Variable identifiers (longest first to avoid partial substitution)
  for (const vid of varIdsLongestFirst) {
    const esc = vid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Replace vid( -> varToLatex(vid)(  and bare vid -> varToLatex(vid)
    s = s.replace(new RegExp(`\\b${esc}\\s*\\(`, "g"), `${varToLatex(vid)}(`);
    s = s.replace(new RegExp(`\\b${esc}\\b(?!\\\\)`, "g"), varToLatex(vid));
  }

  // Multiplication * -> \cdot
  s = s.replace(/\*/g, " \\cdot ");

  return s;
}

function convertTernaryLatex(expr) {
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
  return `\\begin{cases} ${a} & \\text{if } ${cond} \\\\ ${b} & \\text{otherwise} \\end{cases}`;
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/**
 * Export all model variable formulas as a LaTeX document.
 *
 * @param {object} modelObj  - validated model object
 * @param {object} features  - model features from validateModelCore
 * @returns {string}         - LaTeX source
 */
export function renderModelAsLatex(modelObj, features) {
  if (!modelObj?.model) throwModelError("Invalid model object");
  if (!features?.resolvedVarsWithArguments) throwModelError("Invalid model features");

  const variableMap = buildVariableMap(modelObj);
  const varIds = Array.from(variableMap.values()).map(v => String(v.id));
  const varIdsLongestFirst = [...varIds].sort((a, b) => b.length - a.length);

  const modelId = String(modelObj?.model?.id ?? "model");
  const lines = [];

  // Preamble
  lines.push("\\documentclass{article}");
  lines.push("\\usepackage{amsmath}");
  lines.push("\\usepackage{amssymb}");
  lines.push("\\usepackage[margin=2cm]{geometry}");
  lines.push("\\usepackage{hyperref}");
  lines.push("");
  lines.push(`\\title{Model equations: ${escapeLatexText(modelId)}}`);
  lines.push("\\author{Generated by the declarative model editor}");
  lines.push("\\date{\\today}");
  lines.push("");
  lines.push("\\begin{document}");
  lines.push("\\maketitle");
  lines.push("");

  // Index sets
  const indexSets = asArray(modelObj?.model?.indexSets?.indexSet);
  if (indexSets.length > 0) {
    lines.push("\\section*{Index Sets}");
    lines.push("\\begin{itemize}");
    for (const is of indexSets) {
      const id = escapeLatexText(String(is?.id ?? ""));
      const desc = is?.description ? ` -- ${escapeLatexText(String(is.description))}` : "";
      const range = (is?.min != null && is?.max != null)
        ? ` $[${is.min}, ${is.max}]$`
        : "";
      lines.push(`  \\item $${varToLatex(is?.id ?? "?")}$: \\texttt{${id}}${range}${desc}`);
    }
    lines.push("\\end{itemize}");
    lines.push("");
  }

  // Variables section
  lines.push("\\section*{Variable Equations}");
  lines.push("");

  for (const v of variableMap.values()) {
    const id = String(v.id);
    const defType = getDefinitionType(v);
    const defNode = v.definition;
    const desc = v?.description ? String(v.description).trim() : "";
    const unit = v?.unit ? String(v.unit).trim() : "";

    // Variable heading
    lines.push(`\\subsection*{${escapeLatexText(id)}}`);
    if (desc) lines.push(`\\textit{${escapeLatexText(desc)}}\\\\`);
    if (unit) lines.push(`\\textbf{Unit:} \\texttt{${escapeLatexText(unit)}}\\\\`);

    const rv = features.resolvedVarsWithArguments.get(id.toUpperCase());
    const domain = Array.isArray(rv?.domain) ? rv.domain.map(String) : [];
    if (domain.length > 0) {
      const domStr = domain.map(d => `${varToLatex(d)}`).join(", ");
      lines.push(`\\textbf{Domain:} $${domStr}$\\\\`);
    }

    // Formula
    lines.push("\\textbf{Definition:}");
    lines.push("");

    if (defType === "constant" || defType === "expression") {
      const text = normalize(getDefinitionText(v));
      const latex = exprToLatex(text, varIdsLongestFirst);
      const lhs = domain.length > 0
        ? `${varToLatex(id)}(${domain.map(d => varToLatex(d)).join(", ")})`
        : varToLatex(id);
      lines.push("\\begin{equation*}");
      lines.push(`  ${lhs} = ${latex}`);
      lines.push("\\end{equation*}");
    } else if (defType === "piecewise") {
      const cases = asArray(defNode?.case);
      const lhs = domain.length > 0
        ? `${varToLatex(id)}(${domain.map(d => varToLatex(d)).join(", ")})`
        : varToLatex(id);
      lines.push("\\begin{equation*}");
      lines.push(`  ${lhs} = \\begin{cases}`);
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        const when = normalize(c?.when?.["#text"] ?? c?.when ?? "");
        const value = normalize(c?.value?.["#text"] ?? c?.value ?? "");
        const whenLatex = when ? exprToLatex(when, varIdsLongestFirst) : "\\text{otherwise}";
        const valueLatex = exprToLatex(value, varIdsLongestFirst);
        const suffix = i < cases.length - 1 ? " \\\\" : "";
        if (when) {
          lines.push(`    ${valueLatex} & \\text{if } ${whenLatex}${suffix}`);
        } else {
          lines.push(`    ${valueLatex} & \\text{otherwise}${suffix}`);
        }
      }
      lines.push("  \\end{cases}");
      lines.push("\\end{equation*}");
    } else if (defType === "table") {
      const tableRef = defNode?.table?.ref || defNode?.table?.["#text"] || "?";
      const colRef = defNode?.column?.ref || defNode?.column?.["#text"] || "";
      const lhs = domain.length > 0
        ? `${varToLatex(id)}(${domain.map(d => varToLatex(d)).join(", ")})`
        : varToLatex(id);
      lines.push("\\begin{equation*}");
      if (colRef) {
        lines.push(`  ${lhs} = \\text{Table}[\\texttt{${escapeLatexText(tableRef)}}][\\texttt{${escapeLatexText(colRef)}}]`);
      } else {
        lines.push(`  ${lhs} = \\text{Table}[\\texttt{${escapeLatexText(tableRef)}}]`);
      }
      lines.push("\\end{equation*}");
    } else if (defType === "tableLookup") {
      const tableRef = defNode?.table?.ref || defNode?.table?.["#text"] || "?";
      const rowRef = defNode?.row?.ref || defNode?.row?.["#text"] || "";
      const colSel = defNode?.columnSelector?.ref || defNode?.columnSelector?.["#text"] || "";
      const lhs = domain.length > 0
        ? `${varToLatex(id)}(${domain.map(d => varToLatex(d)).join(", ")})`
        : varToLatex(id);
      lines.push("\\begin{equation*}");
      lines.push(`  ${lhs} = \\text{Lookup}[\\texttt{${escapeLatexText(tableRef)}}](${rowRef ? varToLatex(rowRef) : "\\cdot"})[${colSel ? varToLatex(colSel) : "\\cdot"}]`);
      lines.push("\\end{equation*}");
    } else {
      lines.push(`\\textit{(${escapeLatexText(defType || "undefined")})}`);
    }

    lines.push("");
  }

  lines.push("\\end{document}");

  return lines.join("\n") + "\n";
}
