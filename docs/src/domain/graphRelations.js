/**
 * Graph Relations Module
 * 
 * Provides functions for exploring dependency relationships in models
 * as graphs, supporting requirement R9.
 */

/**
 * Get all variables within a specified depth from a root variable.
 * 
 * @param {Object} modelFeatures - The model features object containing incoming and outgoing maps
 * @param {string} rootVariable - The name of the root variable to start from
 * @param {number} depth - The maximum depth to traverse (0 = only root, 1 = immediate neighbors, etc.)
 * @returns {Set<string>} A set of variable names within the specified depth
 */
export function getRelations(modelFeatures, rootVariable, depth) {
  const rootVarUpper = rootVariable.toUpperCase();
  
  // Start with the root variable
  const result = new Set([rootVarUpper]);
  
  // If depth is 0, return only the root variable
  if (depth === 0) {
    return result;
  }
  
  // Keep track of variables at each depth level
  let currentLevel = new Set([rootVarUpper]);
  
  // Expand for each depth level
  for (let i = 0; i < depth; i++) {
    const nextLevel = new Set();
    
    for (const varName of currentLevel) {
      // Add incoming variables (variables that flow into this variable)
      const incoming = modelFeatures.incoming.get(varName);
      if (incoming) {
        for (const dep of incoming) {
          if (!result.has(dep.name)) {
            nextLevel.add(dep.name);
            result.add(dep.name);
          }
        }
      }
      
      // Add outgoing variables (variables that this variable flows into)
      const outgoing = modelFeatures.outgoing.get(varName);
      if (outgoing) {
        for (const dep of outgoing) {
          if (!result.has(dep.name)) {
            nextLevel.add(dep.name);
            result.add(dep.name);
          }
        }
      }
    }
    
    currentLevel = nextLevel;
    
    // If no new variables were found, we can stop early
    if (currentLevel.size === 0) {
      break;
    }
  }
  
  return result;
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
