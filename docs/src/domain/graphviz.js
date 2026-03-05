/**
 * GraphViz DOT Generation Module
 * 
 * Provides functions for generating GraphViz DOT format from graph relations
 */

/**
 * Generate GraphViz DOT format from a graph of relations
 * 
 * @param {Object} graph - Graph object with variables (Set) and edges (Map<string, Set<string>>)
 * @param {string} rootVariable - The primary root variable name (always highlighted)
 * @param {Set<string>|null} focusedVariables - Optional set of all focused variable names to highlight
 * @returns {string} DOT format string
 */
export function generateDot(graph, rootVariable, focusedVariables = null) {
  const lines = [];
  lines.push('digraph dependencies {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box];');
  lines.push('');
  
  // Build the set of all variables to highlight
  const rootUpper = rootVariable.toUpperCase();
  const highlighted = focusedVariables
    ? new Set(Array.from(focusedVariables).map(v => v.toUpperCase()))
    : new Set([rootUpper]);
  highlighted.add(rootUpper);

  // Highlight all focused variables
  for (const varName of highlighted) {
    lines.push(`  "${varName}" [style=filled, fillcolor=lightblue];`);
  }
  lines.push('');
  
  // Add edges
  for (const [varName, targets] of graph.edges) {
    for (const targetName of targets) {
      lines.push(`  "${varName}" -> "${targetName}";`);
    }
  }
  
  lines.push('}');
  return lines.join('\n');
}
