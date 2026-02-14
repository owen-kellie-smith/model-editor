/**
 * Variable Clustering Module
 * 
 * Generic, model-agnostic algorithm for clustering variables into semantic modules
 * based on dependency analysis and semantic similarity.
 */

/**
 * Check if a variable is a constant (has definition type="constant")
 * 
 * @param {string} varName - Variable name
 * @param {Map} resolvedVarsWithArguments - Map of variables with their XML definitions
 * @returns {boolean} True if variable is a constant
 */
function isConstant(varName, resolvedVarsWithArguments) {
  const varData = resolvedVarsWithArguments.get(varName)
  if (!varData || !varData.xml || !varData.xml.definition) {
    return false
  }
  return varData.xml.definition.type === 'constant'
}

/**
 * Determine if a dependency is index-only (differs only by index arguments or shifts)
 * 
 * An index-only dependency occurs when both variables have the same number of arguments.
 * These dependencies represent structural/temporal relationships rather than semantic domain relationships.
 * However, if both variables share a strong semantic keyword (like "survival", "mortality"),
 * the dependency is considered semantic, not index-only.
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
  
  // If they don't have the same number of arguments, not index-only
  if (sourceArgCount !== targetArgCount || targetArgCount === 0) {
    return false
  }
  
  // Check if both variables share a strong semantic keyword
  // These keywords indicate a semantic relationship beyond just structural similarity
  const strongSemanticKeywords = [
    'survival', 'mortality', 'death', 'cashflow', 'annuity', 
    'payment', 'discount', 'value', 'cost', 'premium'
  ]
  
  const sourceLower = sourceVarName.toLowerCase()
  const targetLower = targetVarName.toLowerCase()
  
  for (const keyword of strongSemanticKeywords) {
    if (sourceLower.includes(keyword) && targetLower.includes(keyword)) {
      // Both variables share a strong semantic keyword, so this is a semantic dependency
      return false
    }
  }
  
  // Index-only if both have the same number of arguments and no shared semantic keywords
  return true
}

/**
 * Filter dependencies to exclude index-only ones for clustering purposes
 * 
 * @param {Set<Object>|Array<Object>} dependencies - Set or array of dependency objects {name, shift}
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
 * Filter out constants from dependencies for clustering non-constants
 * 
 * @param {Set<Object>|Array<Object>} dependencies - Set or array of dependency objects {name, shift}
 * @param {Map} resolvedVarsWithArguments - Map of variables with their arguments
 * @returns {Array} Filtered array of dependencies
 */
function filterConstants(dependencies, resolvedVarsWithArguments) {
  const depsArray = Array.isArray(dependencies) ? dependencies : Array.from(dependencies)
  return depsArray.filter(dep => !isConstant(dep.name, resolvedVarsWithArguments))
}

/**
 * Cluster variables into semantic modules
 * 
 * @param {Object} modelFeatures - Model features containing incoming/outgoing dependencies
 * @param {Object} semanticConfig - Parsed semantic configuration
 * @returns {Object} Clustering results with modules, stats, and metadata
 */
export function clusterVariables(modelFeatures, semanticConfig) {
  const allVariables = Array.from(modelFeatures.incoming.keys())
  
  // Separate constants from non-constants
  const constants = []
  const nonConstants = []
  
  for (const varName of allVariables) {
    if (isConstant(varName, modelFeatures.resolvedVarsWithArguments)) {
      constants.push(varName)
    } else {
      nonConstants.push(varName)
    }
  }
  
  console.log("\n=== Constants vs Non-Constants ===")
  console.log("Constants:", constants)
  console.log("Non-constants count:", nonConstants.length)
  
  // Step 1: Assign semantic scores to NON-CONSTANT variables only
  const semanticScores = assignSemanticScores(nonConstants, semanticConfig.domains)
  
  // Step 2: Initialize clusters (one per domain, plus an "Other" cluster)
  const clusters = initializeClusters(semanticConfig.domains)
  
  // Step 3: Assign NON-CONSTANT variables to clusters based on semantic scores and dependencies
  const assignments = assignVariablesToClusters(
    nonConstants,
    semanticScores,
    modelFeatures,
    semanticConfig.parameters
  )
  
  // Step 4: Assign CONSTANTS to clusters based on where they're used (dependencies)
  assignConstantsToClusters(
    constants,
    assignments,
    modelFeatures
  )
  
  // Step 5: Build cluster objects
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
  
  // Step 6: Filter out empty clusters and sort variables within each cluster
  const nonEmptyClusters = Array.from(clusters.values())
    .filter(cluster => cluster.variables.length > 0)
    .map(cluster => ({
      ...cluster,
      variables: cluster.variables.sort()
    }))
  
  // Step 7: Calculate inter-cluster dependencies
  const interClusterEdges = calculateInterClusterEdges(
    nonEmptyClusters,
    assignments,
    modelFeatures
  )
  
  // Step 8: Generate statistics
  const stats = generateStats(nonEmptyClusters, allVariables.length, interClusterEdges)
  
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
    
    // Find the best matching domain(s) - there might be ties
    let bestScore = 0
    const bestDomains = []
    
    for (const [domain, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score
        bestDomains.length = 0
        bestDomains.push(domain)
      } else if (score === bestScore) {
        bestDomains.push(domain)
      }
    }
    
    const bestDomain = bestDomains[0] || 'Other'
    
    // Check if we should use dependency-based clustering
    // (assign to same cluster as dependencies if strong semantic match)
    if (bestScore >= parameters.semanticThreshold) {
      // If there are multiple domains with the same score, try each one
      // and pick the one with the most dependency connections
      let selectedCluster = null
      let maxDependencyCount = 0
      
      // Debug logging for specific variables
      const debugVars = ["MONTHLY_SURVIVAL_RATE", "SURVIVAL_TO_START_OF_STEP"]
      if (debugVars.includes(varName)) {
        console.log(`\n=== Debug ${varName} ===`)
        console.log(`Best domains (tied at score ${bestScore}):`, bestDomains)
      }
      
      for (const candidateDomain of bestDomains) {
        const depCluster = findDependencyCluster(
          varName,
          modelFeatures,
          assignments,
          candidateDomain
        )
        
        if (debugVars.includes(varName)) {
          console.log(`  Candidate: ${candidateDomain}, depCluster: ${depCluster}`)
        }
        
        if (depCluster) {
          // Count how many dependencies are in this cluster
          const incoming = modelFeatures.incoming.get(varName) || []
          const semanticIncoming = filterIndexOnlyDependencies(
            incoming,
            varName,
            modelFeatures.resolvedVarsWithArguments
          )
          // Filter out constants since they haven't been assigned yet
          const nonConstantIncoming = filterConstants(
            semanticIncoming,
            modelFeatures.resolvedVarsWithArguments
          )
          
          if (debugVars.includes(varName)) {
            console.log(`    Incoming deps:`, nonConstantIncoming.map(d => `${d.name} (in ${assignments.get(d.name)})`))
          }
          
          const depCount = nonConstantIncoming.filter(dep => 
            assignments.get(dep.name) === depCluster
          ).length
          
          if (debugVars.includes(varName)) {
            console.log(`    depCount: ${depCount}`)
          }
          
          if (depCount > maxDependencyCount) {
            maxDependencyCount = depCount
            selectedCluster = depCluster
          }
        }
      }
      
      if (debugVars.includes(varName)) {
        console.log(`  Selected cluster: ${selectedCluster}`)
      }
      
      if (selectedCluster) {
        assignments.set(varName, selectedCluster)
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
 * Assign constants to clusters based on where they're used
 * 
 * Constants don't have semantic meaning by themselves, so we assign them
 * to clusters based on their outgoing dependencies (which variables use them).
 * 
 * @param {Array<string>} constants - List of constant variable names
 * @param {Map<string, string>} assignments - Current variable-to-cluster assignments
 * @param {Object} modelFeatures - Model features with dependencies
 */
function assignConstantsToClusters(constants, assignments, modelFeatures) {
  for (const constName of constants) {
    // Get variables that use this constant
    const outgoing = modelFeatures.outgoing.get(constName)
    
    if (!outgoing || outgoing.size === 0) {
      // Constant is not used by anyone, assign to "Other"
      assignments.set(constName, 'Other')
      continue
    }
    
    // Count which clusters use this constant
    const clusterCounts = new Map()
    for (const dep of outgoing) {
      const depCluster = assignments.get(dep.name)
      if (depCluster) {
        clusterCounts.set(depCluster, (clusterCounts.get(depCluster) || 0) + 1)
      }
    }
    
    // Assign constant to the cluster that uses it most
    let maxCount = 0
    let bestCluster = 'Other'
    for (const [cluster, count] of clusterCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        bestCluster = cluster
      }
    }
    
    assignments.set(constName, bestCluster)
  }
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
  
  // Filter out constants since they haven't been assigned yet when clustering non-constants
  const nonConstantIncoming = filterConstants(
    semanticIncoming,
    modelFeatures.resolvedVarsWithArguments
  )
  
  if (nonConstantIncoming.length === 0) {
    return null
  }
  
  const clusterCounts = new Map()
  
  for (const dep of nonConstantIncoming) {
    const depCluster = assignments.get(dep.name)
    if (depCluster) {
      clusterCounts.set(depCluster, (clusterCounts.get(depCluster) || 0) + 1)
    }
  }
  
  // If most dependencies are in the semantic match cluster, use that
  const semanticCount = clusterCounts.get(semanticMatch) || 0
  if (semanticCount >= nonConstantIncoming.length * 0.5) {
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
