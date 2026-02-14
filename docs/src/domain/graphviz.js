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

/**
 * Generate GraphViz DOT format with clustering by depth level
 * Groups variables into visual clusters based on their distance from the root
 * 
 * @param {Object} graph - Graph object with variables (Set) and edges (Map<string, Set<string>>)
 * @param {string} rootVariable - The root variable name
 * @param {number} maxDepth - Maximum depth for traversal
 * @returns {string} DOT format string with clusters
 */
export function generateClusterDot(graph, rootVariable, maxDepth) {
  const lines = [];
  lines.push('digraph dependencies {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box];');
  lines.push('');
  
  // Calculate depth for each variable using BFS
  const depths = new Map();
  const queue = [[rootVariable.toUpperCase(), 0]];
  const visited = new Set();
  
  while (queue.length > 0) {
    const [varName, depth] = queue.shift();
    
    if (visited.has(varName) || depth > maxDepth) {
      continue;
    }
    
    visited.add(varName);
    depths.set(varName, depth);
    
    // Get outgoing edges from this variable
    if (graph.edges.has(varName)) {
      for (const target of graph.edges.get(varName)) {
        if (!visited.has(target)) {
          queue.push([target, depth + 1]);
        }
      }
    }
    
    // Get incoming edges to this variable (reverse direction)
    for (const [source, targets] of graph.edges) {
      if (targets.has(varName) && !visited.has(source)) {
        queue.push([source, depth + 1]);
      }
    }
  }
  
  // Group variables by depth
  const depthGroups = new Map();
  for (const [varName, depth] of depths) {
    if (!depthGroups.has(depth)) {
      depthGroups.set(depth, []);
    }
    depthGroups.get(depth).push(varName);
  }
  
  // Create clusters for each depth level
  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
  
  for (const depth of sortedDepths) {
    const variables = depthGroups.get(depth);
    const label = depth === 0 ? 'Root' : `Depth ${depth}`;
    
    lines.push(`  subgraph cluster_${depth} {`);
    lines.push(`    label="${label}";`);
    lines.push('    style=filled;');
    lines.push('    color=lightgrey;');
    lines.push('');
    
    // Add variables in this cluster
    for (const varName of variables) {
      if (varName === rootVariable.toUpperCase()) {
        lines.push(`    "${varName}" [style=filled, fillcolor=lightblue];`);
      } else {
        lines.push(`    "${varName}";`);
      }
    }
    
    lines.push('  }');
    lines.push('');
  }
  
  // Add edges (outside of clusters)
  for (const [varName, targets] of graph.edges) {
    for (const targetName of targets) {
      lines.push(`  "${varName}" -> "${targetName}";`);
    }
  }
  
  lines.push('}');
  return lines.join('\n');
}
