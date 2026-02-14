/**
 * GraphViz DOT Generation Module
 * 
 * Provides functions for generating GraphViz DOT format from graph relations
 */

/**
 * Generate GraphViz DOT format from a graph of relations
 * 
 * @param {Object} graph - Graph object with variables (Set) and edges (Map<string, Set<string>>)
 * @param {string} rootVariable - The root variable name
 * @returns {string} DOT format string
 */
export function generateDot(graph, rootVariable) {
  const lines = [];
  lines.push('digraph dependencies {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box];');
  lines.push('');
  
  // Highlight root variable
  const rootUpper = rootVariable.toUpperCase();
  lines.push(`  "${rootUpper}" [style=filled, fillcolor=lightblue];`);
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
