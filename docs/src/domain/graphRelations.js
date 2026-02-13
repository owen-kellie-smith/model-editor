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
 * The root variable itself is never included in the result, as it is at distance 0 from itself.
 * Even for self-referential variables like B(t) = B(t-1) * C, the variable B is one step away
 * from both C and B(t-1), so it's not included at depth 0.
 * 
 * @param {Object} modelFeatures - The model features object containing incoming and outgoing maps
 * @param {string} rootVariable - The name of the root variable to start from
 * @param {number} depth - The maximum depth to traverse (0 = always empty, 1 = immediate neighbors, etc.)
 * @returns {Set<string>} A set of variable names within the specified depth from root
 */
export function getRelations(modelFeatures, rootVariable, depth) {
  const rootVarUpper = rootVariable.toUpperCase();
  
  // Start with empty set (root variable is never included)
  const allRelations = new Set();
  
  // If depth is 0, return empty set
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
          // Skip the root variable - it's never included in relations
          if (inVar.name === rootVarUpper) {
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
          // Skip the root variable - it's never included in relations
          if (outVar.name === rootVarUpper) {
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
