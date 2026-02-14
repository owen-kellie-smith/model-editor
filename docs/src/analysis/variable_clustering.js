/**
 * Variable Clustering Module
 * 
 * Generic, model-agnostic algorithm for clustering variables into semantic modules
 * based on dependency analysis and semantic similarity.
 */

/**
 * Determine if a dependency is index-only (differs only by index arguments or shifts)
 * 
 * An index-only dependency occurs when both variables have the same number of arguments.
 * These dependencies represent structural/temporal relationships rather than semantic domain relationships.
 * 
 * @param {string} sourceVarName - Source variable name
 * @param {string} targetVarName - Target variable name
 * @param {Map} resolvedVarsWithArguments - Map of variables with their arguments
 * @returns {boolean} True if dependency is index-only, false otherwise
 */
function isIndexOnlyDependency(sourceVarName, targetVarName, resolvedVarsWithArguments) {
  const sourceVar = resolvedVarsWithArguments.get(sourceVarName)
  const targetVar = resolvedVarsWithArguments.get(targetVarName)
  
  // If either variable doesn't exist, not index-only
  if (!sourceVar || !targetVar) {
    return false
  }
  
  const sourceArgCount = sourceVar.domain?.length || 0
  const targetArgCount = targetVar.domain?.length || 0
  
  // Index-only if both have the same number of arguments (and both have at least one argument)
  // If target has 0 args but source has args, it's a structural/parametric dependency
  return sourceArgCount === targetArgCount && targetArgCount > 0
}

/**
 * Filter dependencies to exclude index-only ones for clustering purposes
 * 
 * @param {Set|Array} dependencies - Set or array of dependency objects {name, shift}
 * @param {string} sourceVarName - Source variable name
 * @param {Map} resolvedVarsWithArguments - Map of variables with their arguments
 * @returns {Array} Filtered array of dependencies
 */
function filterIndexOnlyDependencies(dependencies, sourceVarName, resolvedVarsWithArguments) {
  const depsArray = Array.isArray(dependencies) ? dependencies : Array.from(dependencies)
  return depsArray.filter(dep => 
    !isIndexOnlyDependency(sourceVarName, dep.name, resolvedVarsWithArguments)
  )
}

/**
 * Cluster variables into semantic modules
 * 
 * @param {Object} modelFeatures - Model features containing incoming/outgoing dependencies
 * @param {Object} semanticConfig - Parsed semantic configuration
 * @returns {Object} Clustering results with modules, stats, and metadata
 */
export function clusterVariables(modelFeatures, semanticConfig) {
  const variables = Array.from(modelFeatures.incoming.keys())
  
  // Step 1: Assign semantic scores to each variable
  const semanticScores = assignSemanticScores(variables, semanticConfig.domains)
  
  // Step 2: Initialize clusters (one per domain, plus an "Other" cluster)
  const clusters = initializeClusters(semanticConfig.domains)
  
  // Step 3: Assign variables to clusters based on semantic scores and dependencies
  const assignments = assignVariablesToClusters(
    variables,
    semanticScores,
    modelFeatures,
    semanticConfig.parameters
  )
  
  // Step 4: Build cluster objects
  for (const [varName, clusterKey] of assignments.entries()) {
    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, {
        id: clusterKey,
        displayName: clusterKey,
        variables: []
      })
    }
    clusters.get(clusterKey).variables.push(varName)
  }
  
  // Step 5: Filter out empty clusters and sort variables within each cluster
  const nonEmptyClusters = Array.from(clusters.values())
    .filter(cluster => cluster.variables.length > 0)
    .map(cluster => ({
      ...cluster,
      variables: cluster.variables.sort()
    }))
  
  // Step 6: Calculate inter-cluster dependencies
  const interClusterEdges = calculateInterClusterEdges(
    nonEmptyClusters,
    assignments,
    modelFeatures
  )
  
  // Step 7: Generate statistics
  const stats = generateStats(nonEmptyClusters, variables.length, interClusterEdges)
  
  return {
    modules: nonEmptyClusters,
    stats,
    interClusterEdges
  }
}

/**
 * Assign semantic scores to variables based on pattern matching
 * 
 * @param {Array<string>} variables - List of variable names
 * @param {Array<Object>} domains - Semantic domain definitions
 * @returns {Map<string, Map<string, number>>} Variable name -> domain -> score
 */
function assignSemanticScores(variables, domains) {
  const scores = new Map()
  
  for (const varName of variables) {
    const varLower = varName.toLowerCase()
    const domainScores = new Map()
    
    for (const domain of domains) {
      let score = 0
      for (const pattern of domain.patterns) {
        if (varLower.includes(pattern)) {
          score += 1
        }
      }
      if (score > 0) {
        domainScores.set(domain.displayName, score)
      }
    }
    
    scores.set(varName, domainScores)
  }
  
  return scores
}

/**
 * Initialize empty clusters for each domain
 * 
 * @param {Array<Object>} domains - Semantic domain definitions
 * @returns {Map<string, Object>} Cluster key -> cluster object
 */
function initializeClusters(domains) {
  const clusters = new Map()
  
  for (const domain of domains) {
    clusters.set(domain.displayName, {
      id: domain.displayName,
      displayName: domain.displayName,
      variables: []
    })
  }
  
  // Add "Other" cluster for variables that don't match any domain
  clusters.set('Other', {
    id: 'Other',
    displayName: 'Other',
    variables: []
  })
  
  return clusters
}

/**
 * Assign variables to clusters based on semantic scores
 * 
 * @param {Array<string>} variables - List of variable names
 * @param {Map<string, Map<string, number>>} semanticScores - Semantic scores
 * @param {Object} modelFeatures - Model features with dependencies
 * @param {Object} parameters - Clustering parameters
 * @returns {Map<string, string>} Variable name -> cluster key
 */
function assignVariablesToClusters(variables, semanticScores, modelFeatures, parameters) {
  const assignments = new Map()
  
  // Sort variables by dependency order (variables with no dependencies first)
  const sortedVars = topologicalSort(variables, modelFeatures)
  
  for (const varName of sortedVars) {
    const scores = semanticScores.get(varName)
    
    // If no semantic match, assign to "Other"
    if (!scores || scores.size === 0) {
      assignments.set(varName, 'Other')
      continue
    }
    
    // Find the best matching domain
    let bestDomain = 'Other'
    let bestScore = 0
    
    for (const [domain, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score
        bestDomain = domain
      }
    }
    
    // Check if we should use dependency-based clustering
    // (assign to same cluster as dependencies if strong semantic match)
    if (bestScore >= parameters.semanticThreshold) {
      const dependencyCluster = findDependencyCluster(
        varName,
        modelFeatures,
        assignments,
        bestDomain
      )
      
      if (dependencyCluster) {
        assignments.set(varName, dependencyCluster)
      } else {
        assignments.set(varName, bestDomain)
      }
    } else {
      assignments.set(varName, 'Other')
    }
  }
  
  return assignments
}

/**
 * Topological sort of variables by dependency order
 * 
 * @param {Array<string>} variables - List of variable names
 * @param {Object} modelFeatures - Model features with dependencies
 * @returns {Array<string>} Sorted variables
 */
function topologicalSort(variables, modelFeatures) {
  const sorted = []
  const visited = new Set()
  const temp = new Set()
  
  function visit(varName) {
    if (temp.has(varName)) {
      return // Cycle detected, skip
    }
    if (visited.has(varName)) {
      return
    }
    
    temp.add(varName)
    
    const incoming = modelFeatures.incoming.get(varName)
    if (incoming) {
      for (const dep of incoming) {
        if (variables.includes(dep.name)) {
          visit(dep.name)
        }
      }
    }
    
    temp.delete(varName)
    visited.add(varName)
    sorted.push(varName)
  }
  
  for (const varName of variables) {
    if (!visited.has(varName)) {
      visit(varName)
    }
  }
  
  return sorted
}

/**
 * Find the cluster that most dependencies belong to
 * 
 * @param {string} varName - Variable name
 * @param {Object} modelFeatures - Model features with dependencies
 * @param {Map<string, string>} assignments - Current assignments
 * @param {string} semanticMatch - Best semantic match
 * @returns {string|null} Cluster key or null
 */
function findDependencyCluster(varName, modelFeatures, assignments, semanticMatch) {
  const incoming = modelFeatures.incoming.get(varName)
  if (!incoming || incoming.length === 0) {
    return null
  }
  
  // Filter out index-only dependencies for clustering purposes
  const semanticIncoming = filterIndexOnlyDependencies(
    incoming,
    varName,
    modelFeatures.resolvedVarsWithArguments
  )
  
  if (semanticIncoming.length === 0) {
    return null
  }
  
  const clusterCounts = new Map()
  
  for (const dep of semanticIncoming) {
    const depCluster = assignments.get(dep.name)
    if (depCluster) {
      clusterCounts.set(depCluster, (clusterCounts.get(depCluster) || 0) + 1)
    }
  }
  
  // If most dependencies are in the semantic match cluster, use that
  const semanticCount = clusterCounts.get(semanticMatch) || 0
  if (semanticCount >= semanticIncoming.length * 0.5) {
    return semanticMatch
  }
  
  return null
}

/**
 * Calculate edges between clusters
 * 
 * @param {Array<Object>} clusters - List of cluster objects
 * @param {Map<string, string>} assignments - Variable assignments
 * @param {Object} modelFeatures - Model features with dependencies
 * @returns {Array<Object>} Array of edge objects
 */
function calculateInterClusterEdges(clusters, assignments, modelFeatures) {
  const edges = []
  const edgeSet = new Set()
  
  for (const cluster of clusters) {
    for (const varName of cluster.variables) {
      const outgoing = modelFeatures.outgoing.get(varName)
      if (!outgoing) continue
      
      // Filter out index-only dependencies for clustering purposes
      const semanticOutgoing = filterIndexOnlyDependencies(
        outgoing,
        varName,
        modelFeatures.resolvedVarsWithArguments
      )
      
      for (const dep of semanticOutgoing) {
        const targetCluster = assignments.get(dep.name)
        if (targetCluster && targetCluster !== cluster.id) {
          const edgeKey = `${cluster.id}->${targetCluster}`
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey)
            edges.push({
              from: cluster.id,
              to: targetCluster
            })
          }
        }
      }
    }
  }
  
  return edges
}

/**
 * Generate statistics about the clustering
 * 
 * @param {Array<Object>} clusters - List of cluster objects
 * @param {number} totalVars - Total number of variables
 * @param {Array<Object>} interClusterEdges - Inter-cluster edges
 * @returns {Object} Statistics object
 */
function generateStats(clusters, totalVars, interClusterEdges) {
  const clusterSizes = clusters.map(c => c.variables.length)
  
  return {
    totalVariables: totalVars,
    totalClusters: clusters.length,
    avgClusterSize: clusterSizes.length > 0 
      ? parseFloat((clusterSizes.reduce((a, b) => a + b, 0) / clusterSizes.length).toFixed(1))
      : 0,
    minClusterSize: clusterSizes.length > 0 ? Math.min(...clusterSizes) : 0,
    maxClusterSize: clusterSizes.length > 0 ? Math.max(...clusterSizes) : 0,
    interClusterEdges: interClusterEdges.length
  }
}

/**
 * Generate DOT graph representation of the clustering
 * 
 * @param {Object} clusteringResult - Result from clusterVariables
 * @returns {string} DOT format string
 */
export function generateClusterDot(clusteringResult) {
  const lines = ['digraph ClusterGraph {']
  lines.push('  rankdir=LR;')
  lines.push('  node [shape=box, style=filled, fillcolor=lightblue];')
  lines.push('')
  
  // Add nodes (clusters)
  for (const module of clusteringResult.modules) {
    const label = `${module.displayName}\\n(${module.variables.length} vars)`
    lines.push(`  "${module.id}" [label="${label}"];`)
  }
  
  lines.push('')
  
  // Add edges
  for (const edge of clusteringResult.interClusterEdges) {
    lines.push(`  "${edge.from}" -> "${edge.to}";`)
  }
  
  lines.push('}')
  
  return lines.join('\n')
}
