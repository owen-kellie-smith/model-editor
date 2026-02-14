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
 * Helper function to determine if a dependency is index-only (structural) rather than semantic.
 * 
 * Index-only dependencies occur when variables have different domain structures, meaning
 * one variable depends on another purely for parametric/structural reasons (e.g., a time
 * constant) rather than semantic domain relationships.
 * 
 * Examples:
 * - MONTHLY_SURVIVAL_RATE(cohort, step) depends on ANNUAL_MORTALITY_RATE(cohort, step):
 *   Both have domain [cohort, step] → same length → SEMANTIC dependency
 * - MONTHLY_SURVIVAL_RATE(cohort, step) depends on STEP_LENGTH (no indices):
 *   Domains [cohort, step] vs [] → different lengths → INDEX-ONLY dependency
 * - CONSTANT_A depends on CONSTANT_B (both no indices):
 *   Both have domain [] → same length → SEMANTIC dependency
 * 
 * @param {string} sourceVarName - The source variable name
 * @param {string} targetVarName - The target variable name (dependency)
 * @param {Map} resolvedVarsWithArguments - Map of variable names to their domain info
 * @returns {boolean} True if this is an index-only dependency (should be filtered for clustering)
 */
function isIndexOnlyDependency(sourceVarName, targetVarName, resolvedVarsWithArguments) {
  const sourceVar = resolvedVarsWithArguments.get(sourceVarName);
  const targetVar = resolvedVarsWithArguments.get(targetVarName);
  
  if (!sourceVar || !targetVar) {
    return false; // If either variable not found, keep the edge (shouldn't happen)
  }
  
  const sourceDomainLength = sourceVar.domain?.length || 0;
  const targetDomainLength = targetVar.domain?.length || 0;
  
  // Index-only if domains have different lengths
  return sourceDomainLength !== targetDomainLength;
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
 * Filtering: Index-only dependencies (where source and target have different domain lengths)
 * are filtered out to prevent structural constants from affecting semantic clustering.
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
  // Filter out index-only dependencies to preserve semantic relationships for clustering
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
          
          // Filter out index-only dependencies (structural constants)
          // Keep only semantic dependencies (same domain structure)
          if (!isIndexOnlyDependency(varName, dep.name, modelFeatures.resolvedVarsWithArguments)) {
            outgoingEdges.add(dep.name);
          }
        }
      }
    }
    
    edges.set(varName, outgoingEdges);
  }
  
  return { variables, edges };
}
