/**
 * Graph Relations Module
 * 
 * Provides functions for exploring dependency relationships in models
 * as graphs, supporting requirement R9.
 */

/**
 * Get all variables within a specified depth from a root variable.
 * 
 * A variable is only included in relations if it's connected to the root via dependencies.
 * The root variable itself is only included if it references itself in its formula (e.g., B(t) = B(t-1) * SCALE).
 * 
 * @param {Object} modelFeatures - The model features object containing incoming and outgoing maps
 * @param {string} rootVariable - The name of the root variable to start from
 * @param {number} depth - The maximum depth to traverse (0 = no relations unless self-referential, 1 = immediate neighbors, etc.)
 * @returns {Set<string>} A set of variable names within the specified depth from root
 */
export function getRelations(modelFeatures, rootVariable, depth) {
  const rootVarUpper = rootVariable.toUpperCase();
  
  // Check if root variable references itself
  const hasSelfReference = modelFeatures.incoming.get(rootVarUpper)
    ? Array.from(modelFeatures.incoming.get(rootVarUpper)).some(inVar => inVar.name === rootVarUpper)
    : false;
  
  // Start with empty set (root is only included if it has a self-reference)
  const allRelations = new Set();
  if (hasSelfReference) {
    allRelations.add(rootVarUpper);
  }
  
  // If depth is 0, return empty set (or just root if self-referential)
  if (depth === 0) {
    return allRelations;
  }
  
  // Keep track of variables at each depth level (start from root)
  let unexaminedVariables = new Set([rootVarUpper]);
  
  // Expand for each depth level
  for (let i = 0; i < depth; i++) {
    const newlyDiscoveredVariables = new Set();
    
    for (const varName of unexaminedVariables) {
      // Add incoming variables (variables that flow into this variable)
      const incoming = modelFeatures.incoming.get(varName);
      if (incoming) {
        for (const inVar of incoming) {
          // Skip if it's the root variable (unless it has self-reference, then it's already added)
          if (inVar.name === rootVarUpper && !hasSelfReference) {
            continue;
          }
          if (!allRelations.has(inVar.name) && !unexaminedVariables.has(inVar.name)) {
            newlyDiscoveredVariables.add(inVar.name);
            allRelations.add(inVar.name);
          }
        }
      }
      
      // Add outgoing variables (variables that this variable flows into)
      const outgoing = modelFeatures.outgoing.get(varName);
      if (outgoing) {
        for (const outVar of outgoing) {
          // Skip if it's the root variable (unless it has self-reference, then it's already added)
          if (outVar.name === rootVarUpper && !hasSelfReference) {
            continue;
          }
          if (!allRelations.has(outVar.name) && !unexaminedVariables.has(outVar.name)) {
            newlyDiscoveredVariables.add(outVar.name);
            allRelations.add(outVar.name);
          }
        }
      }
    }
    
    unexaminedVariables = newlyDiscoveredVariables;
    
    // If no new variables were found, we can stop early
    if (unexaminedVariables.size === 0) {
      break;
    }
  }
  
  return allRelations;
}

/**
 * Get a graph representation of variables and their relationships.
 * 
 * Returns an object containing:
 * - variables: Set of variable names (same as getRelations)
 * - edges: Map from variable name to Set of variables it flows into (outgoing connections)
 *          Limited to only include connections between variables in the relation set
 * 
 * @param {Object} modelFeatures - The model features object containing incoming and outgoing maps
 * @param {string} rootVariable - The name of the root variable to start from
 * @param {number} depth - The maximum depth to traverse
 * @returns {Object} An object with variables (Set) and edges (Map<string, Set<string>>)
 */
export function getGraphOfRelations(modelFeatures, rootVariable, depth) {
  // Get the set of variables within the specified depth
  const variables = getRelations(modelFeatures, rootVariable, depth);
  
  // Build the edges map, including only connections between variables in the set
  const edges = new Map();
  
  for (const varName of variables) {
    const outgoingEdges = new Set();
    
    // Get all outgoing connections for this variable
    const outgoing = modelFeatures.outgoing.get(varName);
    if (outgoing) {
      for (const dep of outgoing) {
        // Only include the edge if the target variable is also in our set
        if (variables.has(dep.name)) {
          outgoingEdges.add(dep.name);
        }
      }
    }
    
    edges.set(varName, outgoingEdges);
  }
  
  return { variables, edges };
}
