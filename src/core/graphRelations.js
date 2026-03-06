/**
 * Graph Relations Module
 * 
 * Provides functions for exploring dependency relationships in models
 * as graphs, supporting requirement R9.
 */

/**
 * Get all variables within a specified depth from a root variable.
 * 
 * Returns variables connected to the root via dependencies, including the root itself.
 * The root variable is always included to enable drawing edges in graph visualizations.
 * For example, if A = B and B = D, then at depth 1 from B we get {B, D, A} so we can
 * draw edges D→B and B→A.
 * 
 * @param {Object} modelFeatures - The model features object containing incoming and outgoing maps
 * @param {string} rootVariable - The name of the root variable to start from
 * @param {number} depth - The maximum depth to traverse (0 = only root, 1 = root + immediate neighbors, etc.)
 * @returns {Set<string>} A set of variable names within the specified depth from root
 */
export function getRelations(modelFeatures, rootVariable, depth) {
  const rootVarUpper = rootVariable.toUpperCase();
  
  // Always start with the root variable in the set
  const allRelations = new Set([rootVarUpper]);
  
  // If depth is 0, return only the root variable
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
 * Special handling: Self-referential edges (e.g., B→B) are only included if the variable
 * actually references itself in its formula (e.g., B(t) = B(t-1) * C).
 * 
 * @param {Object} modelFeatures - The model features object containing incoming and outgoing maps
 * @param {string} rootVariable - The name of the root variable to start from
 * @param {number} depth - The maximum depth to traverse
 * @returns {Object} An object with variables (Set) and edges (Map<string, Set<string>>)
 */
export function getGraphOfRelations(modelFeatures, rootVariable, depth) {
  const rootVarUpper = rootVariable.toUpperCase();
  
  // Get the set of variables within the specified depth
  const variables = getRelations(modelFeatures, rootVariable, depth);
  
  // Check if root variable references itself
  const rootHasSelfReference = modelFeatures.incoming.get(rootVarUpper)
    ? Array.from(modelFeatures.incoming.get(rootVarUpper)).some(inVar => inVar.name === rootVarUpper)
    : false;
  
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
          // Special case: exclude self-referential edge for root unless it actually has self-reference
          if (varName === rootVarUpper && dep.name === rootVarUpper && !rootHasSelfReference) {
            continue;
          }
          outgoingEdges.add(dep.name);
        }
      }
    }
    
    edges.set(varName, outgoingEdges);
  }
  
  return { variables, edges };
}

/**
 * Get all variables within a specified depth from any of the given root variables.
 *
 * Returns the union of all variables reachable (via getRelations) from each root variable.
 *
 * @param {Object} modelFeatures - The model features object containing incoming and outgoing maps
 * @param {string[]} rootVariables - Array of root variable names to start from
 * @param {number} depth - The maximum depth to traverse from each root
 * @returns {Set<string>} A set of variable names reachable from any root within the depth
 */
export function getRelationsMulti(modelFeatures, rootVariables, depth) {
  const allRelations = new Set();
  for (const rootVariable of rootVariables) {
    const relations = getRelations(modelFeatures, rootVariable, depth);
    for (const varName of relations) {
      allRelations.add(varName);
    }
  }
  return allRelations;
}

/**
 * Get a graph representation for multiple root variables.
 *
 * Returns the union of all variables reachable from any of the root variables within
 * the given depth, along with the edges between those variables.
 *
 * @param {Object} modelFeatures - The model features object containing incoming and outgoing maps
 * @param {string[]} rootVariables - Array of root variable names to start from
 * @param {number} depth - The maximum depth to traverse from each root
 * @returns {Object} An object with variables (Set) and edges (Map<string, Set<string>>)
 */
export function getGraphOfRelationsMulti(modelFeatures, rootVariables, depth) {
  // Get the union of all reachable variables from all root variables
  const variables = getRelationsMulti(modelFeatures, rootVariables, depth);

  // Build the edges map, including only connections between variables in the union set
  const edges = new Map();

  for (const varName of variables) {
    const outgoingEdges = new Set();

    const outgoing = modelFeatures.outgoing.get(varName);
    if (outgoing) {
      for (const dep of outgoing) {
        if (variables.has(dep.name)) {
          outgoingEdges.add(dep.name);
        }
      }
    }

    edges.set(varName, outgoingEdges);
  }

  return { variables, edges };
}
