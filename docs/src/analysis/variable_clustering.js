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
 * These dependencies represent structural/temporal relationships where variables operate
 * over the same index space but may represent logically independent concepts.
 * 
 * For structural clustering, we want to be MORE inclusive - only filter out pure
 * index shifts (like recursive time-stepping) but keep dependencies that represent
 * real computational relationships.
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
  
  // If they don't have the same number of arguments, definitely not index-only
  // This is a real semantic dependency
  if (sourceArgCount !== targetArgCount || targetArgCount === 0) {
    return false
  }
  
  // For structural clustering: if both have the same arguments AND it's a self-reference,
  // treat it as index-only (temporal recursion like x(t) = x(t-1) + y(t))
  // Otherwise, assume it's a real computational dependency
  if (sourceVarName === targetVarName) {
    return true // Self-reference with same args = index-only
  }
  
  // For structural clustering, we keep all cross-variable dependencies
  // even if they have the same argument structure
  return false
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
 * Build an undirected dependency graph for variables
 * Excludes index-only and constant dependencies
 * 
 * @param {Array<string>} variables - List of variable names
 * @param {Object} modelFeatures - Model features with dependencies
 * @returns {Map<string, Set<string>>} Adjacency list representation of the graph
 */
function buildDependencyGraph(variables, modelFeatures) {
  const graph = new Map()
  
  // Initialize graph with all variables
  for (const varName of variables) {
    graph.set(varName, new Set())
  }
  
  // Add edges based on dependencies
  for (const varName of variables) {
    const incoming = modelFeatures.incoming.get(varName) || []
    
    // Filter to get semantic dependencies (non-index-only, non-constant)
    const semanticIncoming = filterIndexOnlyDependencies(
      incoming,
      varName,
      modelFeatures.resolvedVarsWithArguments
    )
    const nonConstantIncoming = filterConstants(
      semanticIncoming,
      modelFeatures.resolvedVarsWithArguments
    )
    
    // Add edges (undirected: both directions)
    for (const dep of nonConstantIncoming) {
      const depName = dep.name
      if (graph.has(depName)) {
        graph.get(varName).add(depName)
        graph.get(depName).add(varName)
      }
    }
  }
  
  return graph
}

/**
 * Calculate shortest path distance between all pairs of vertices using BFS
 * Only used for small components due to O(V²E) complexity
 * 
 * @param {Map<string, Set<string>>} graph - Adjacency list representation
 * @param {Array<string>} vertices - List of vertices
 * @returns {Map<string, Map<string, number>>} Distance matrix
 */
function calculateDistanceMatrix(graph, vertices) {
  const distances = new Map()
  
  for (const start of vertices) {
    const dist = new Map()
    const queue = [start]
    const visited = new Set([start])
    dist.set(start, 0)
    
    while (queue.length > 0) {
      const current = queue.shift()
      const currentDist = dist.get(current)
      
      const neighbors = graph.get(current) || new Set()
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          dist.set(neighbor, currentDist + 1)
          queue.push(neighbor)
        }
      }
    }
    
    // Set infinite distance for unreachable vertices
    for (const vertex of vertices) {
      if (!dist.has(vertex)) {
        dist.set(vertex, Infinity)
      }
    }
    
    distances.set(start, dist)
  }
  
  return distances
}

/**
 * Perform Louvain community detection on a graph
 * Efficient O(n log n) algorithm suitable for large graphs (1000+ nodes)
 * 
 * @param {Array<string>} variables - Variables in the component
 * @param {Map<string, Set<string>>} graph - Dependency graph
 * @param {number} targetClusters - Desired number of clusters (hint, not guaranteed)
 * @returns {Array<Array<string>>} Array of clusters
 */
function louvainCommunityDetection(variables, graph, targetClusters) {
  // Initialize: each node is its own community
  const nodeToCommunity = new Map()
  variables.forEach(v => nodeToCommunity.set(v, v))
  
  // Calculate total edge weight (for our unweighted graph, this is just edge count)
  let m = 0
  for (const node of variables) {
    const neighbors = graph.get(node) || new Set()
    m += neighbors.size
  }
  m = m / 2 // Each edge counted twice
  
  if (m === 0) {
    // No edges, return each variable as its own cluster
    return variables.map(v => [v])
  }
  
  let improved = true
  let iteration = 0
  const maxIterations = 10
  
  // Phase 1: Optimize modularity by moving nodes between communities
  while (improved && iteration < maxIterations) {
    improved = false
    iteration++
    
    for (const node of variables) {
      const currentCommunity = nodeToCommunity.get(node)
      const neighbors = graph.get(node) || new Set()
      
      // Count edges to each neighboring community
      const communityEdges = new Map()
      for (const neighbor of neighbors) {
        const neighborCommunity = nodeToCommunity.get(neighbor)
        communityEdges.set(neighborCommunity, (communityEdges.get(neighborCommunity) || 0) + 1)
      }
      
      // Find best community to move to (including staying in current)
      let bestCommunity = currentCommunity
      let bestGain = 0
      
      for (const [community, edgeCount] of communityEdges) {
        // Simple heuristic: prefer communities with more connections
        const gain = edgeCount
        if (gain > bestGain) {
          bestGain = gain
          bestCommunity = community
        }
      }
      
      // Move node if beneficial
      if (bestCommunity !== currentCommunity) {
        nodeToCommunity.set(node, bestCommunity)
        improved = true
      }
    }
  }
  
  // Group nodes by community
  const communities = new Map()
  for (const [node, community] of nodeToCommunity) {
    if (!communities.has(community)) {
      communities.set(community, [])
    }
    communities.get(community).push(node)
  }
  
  let clusters = Array.from(communities.values())
  
  // If we have too many clusters and want fewer, merge smallest ones
  if (clusters.length > targetClusters * 1.5) {
    clusters = mergeSmallerClusters(clusters, graph, targetClusters)
  }
  
  return clusters
}

/**
 * Merge smaller clusters to reach target count
 * Uses degree-based heuristic for efficiency
 * 
 * @param {Array<Array<string>>} clusters - Current clusters
 * @param {Map<string, Set<string>>} graph - Dependency graph
 * @param {number} targetCount - Target number of clusters
 * @returns {Array<Array<string>>} Merged clusters
 */
function mergeSmallerClusters(clusters, graph, targetCount) {
  // Sort by size (smallest first)
  clusters.sort((a, b) => a.length - b.length)
  
  while (clusters.length > targetCount && clusters.length > 1) {
    const smallest = clusters.shift()
    
    // Find cluster with most connections to the smallest cluster
    let bestTarget = 0
    let maxConnections = 0
    
    for (let i = 0; i < clusters.length; i++) {
      let connections = 0
      for (const node of smallest) {
        const neighbors = graph.get(node) || new Set()
        for (const neighbor of neighbors) {
          if (clusters[i].includes(neighbor)) {
            connections++
          }
        }
      }
      
      if (connections > maxConnections) {
        maxConnections = connections
        bestTarget = i
      }
    }
    
    // Merge into best target
    clusters[bestTarget] = [...clusters[bestTarget], ...smallest]
  }
  
  return clusters
}

/**
 * Perform hierarchical agglomerative clustering on a connected component
 * Only efficient for small components (<100 variables)
 * Complexity: O(n³) - use louvainCommunityDetection for large components
 * 
 * @param {Array<string>} variables - Variables in the component
 * @param {Map<string, Set<string>>} graph - Dependency graph
 * @param {number} targetClusters - Desired number of clusters
 * @returns {Array<Array<string>>} Array of clusters
 */
function hierarchicalClusterComponent(variables, graph, targetClusters) {
  if (variables.length <= targetClusters) {
    // Each variable becomes its own cluster
    return variables.map(v => [v])
  }
  
  // For large components, use more efficient algorithm
  if (variables.length > 100) {
    return louvainCommunityDetection(variables, graph, targetClusters)
  }
  
  // Calculate distance matrix (only for small components)
  const distances = calculateDistanceMatrix(graph, variables)
  
  // Initialize: each variable is its own cluster
  const clusters = variables.map(v => [v])
  
  // Agglomerative clustering: merge closest clusters until we reach target
  while (clusters.length > targetClusters) {
    let minDist = Infinity
    let mergeI = -1
    let mergeJ = -1
    
    // Find closest pair of clusters
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Calculate average distance between clusters (average linkage)
        let totalDist = 0
        let count = 0
        
        for (const varI of clusters[i]) {
          for (const varJ of clusters[j]) {
            const dist = distances.get(varI)?.get(varJ) ?? Infinity
            totalDist += dist
            count++
          }
        }
        
        const avgDist = count > 0 ? totalDist / count : Infinity
        
        if (avgDist < minDist) {
          minDist = avgDist
          mergeI = i
          mergeJ = j
        }
      }
    }
    
    // Merge the closest clusters
    if (mergeI !== -1 && mergeJ !== -1) {
      clusters[mergeI] = [...clusters[mergeI], ...clusters[mergeJ]]
      clusters.splice(mergeJ, 1)
    } else {
      // Can't merge anymore (disconnected components shouldn't reach here)
      break
    }
  }
  
  return clusters
}

/**
 * Generate a descriptive name for a module based on its variables
 * 
 * @param {Array<string>} variables - Variables in the module
 * @returns {string} Generated module name
 */
function generateModuleName(variables) {
  if (variables.length === 0) {
    return "Empty Module"
  }
  
  if (variables.length === 1) {
    return variables[0]
  }
  
  // Extract common word patterns from variable names
  const words = new Map() // word -> count
  
  for (const varName of variables) {
    // Split by underscore or camelCase
    const parts = varName
      .replace(/([A-Z])/g, '_$1')
      .split('_')
      .filter(p => p.length > 0)
      .map(p => p.toLowerCase())
    
    for (const part of parts) {
      // Skip very common/generic words and very short words
      if (part.length <= 2 || ['and', 'or', 'the', 'of', 'in', 'at', 'to', 'for'].includes(part)) {
        continue
      }
      words.set(part, (words.get(part) || 0) + 1)
    }
  }
  
  // Find most common words
  const sortedWords = Array.from(words.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word)
  
  if (sortedWords.length === 0) {
    return `Group of ${variables.length}`
  }
  
  // Capitalize first letter of each word
  const name = sortedWords
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' & ')
  
  return `${name} (${variables.length})`
}

/**
 * Find connected components in an undirected graph using DFS
 * 
 * @param {Map<string, Set<string>>} graph - Adjacency list representation
 * @returns {Array<Array<string>>} Array of connected components, each being an array of variable names
 */
function findConnectedComponents(graph) {
  const visited = new Set()
  const components = []
  
  function dfs(node, component) {
    visited.add(node)
    component.push(node)
    
    const neighbors = graph.get(node) || new Set()
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, component)
      }
    }
  }
  
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const component = []
      dfs(node, component)
      components.push(component)
    }
  }
  
  return components
}

/**
 * Cluster variables into semantic modules
 * 
 * Uses structure-based clustering: variables that depend on each other are grouped together.
 * This creates modules based on the dependency graph structure, not on variable names.
 * 
 * @param {Object} modelFeatures - Model features containing incoming/outgoing dependencies
 * @param {Object} semanticConfig - Parsed semantic configuration (kept for compatibility)
 * @param {Object} options - Clustering options
 * @param {string} options.granularity - 'low', 'medium', or 'high' (default: 'medium')
 * @returns {Object} Clustering results with modules, stats, and metadata
 */
export function clusterVariables(modelFeatures, semanticConfig, options = {}) {
  const allVariables = Array.from(modelFeatures.incoming.keys())
  const granularity = options.granularity || 'medium'
  
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
  
  // Build undirected dependency graph for non-constants (excluding index-only dependencies)
  const dependencyGraph = buildDependencyGraph(nonConstants, modelFeatures)
  
  // Find connected components in the dependency graph
  const connectedComponents = findConnectedComponents(dependencyGraph)
  
  // For large models (> 20 variables), apply hierarchical clustering within each component
  // Uses efficient Louvain algorithm for components > 100 variables (O(n log n))
  // and traditional hierarchical clustering for smaller components (O(n³))
  const shouldUseHierarchical = nonConstants.length > 20
  
  let finalClusters = []
  
  if (shouldUseHierarchical) {
    // Determine target number of clusters per component based on granularity
    const granularityMap = {
      'low': 0.15,    // ~15% of variables become separate modules
      'medium': 0.25, // ~25% of variables become separate modules
      'high': 0.40    // ~40% of variables become separate modules
    }
    
    const ratio = granularityMap[granularity] || granularityMap['medium']
    
    for (const component of connectedComponents) {
      if (component.length > 5) {
        // Apply clustering to larger components
        // Automatically uses Louvain (O(n log n)) for components > 100 variables
        const targetClusters = Math.max(2, Math.ceil(component.length * ratio))
        const subClusters = hierarchicalClusterComponent(component, dependencyGraph, targetClusters)
        finalClusters.push(...subClusters)
      } else {
        // Keep small components as single clusters
        finalClusters.push(component)
      }
    }
  } else {
    // For small models, use connected components as-is
    finalClusters = connectedComponents
  }
  
  // Create module assignments with generated names
  const assignments = new Map()
  let moduleIndex = 1
  
  for (const cluster of finalClusters) {
    const moduleName = generateModuleName(cluster)
    const moduleId = `Module ${moduleIndex}`
    
    for (const varName of cluster) {
      assignments.set(varName, { id: moduleId, name: moduleName })
    }
    moduleIndex++
  }
  
  // Assign constants to modules based on where they're used
  assignConstantsToClusters(constants, assignments, modelFeatures)
  
  // Build cluster objects
  const clusters = new Map()
  for (const [varName, moduleInfo] of assignments.entries()) {
    const clusterKey = typeof moduleInfo === 'string' ? moduleInfo : moduleInfo.id
    const clusterName = typeof moduleInfo === 'string' ? moduleInfo : moduleInfo.name
    
    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, {
        id: clusterKey,
        displayName: clusterName,
        variables: []
      })
    }
    clusters.get(clusterKey).variables.push(varName)
  }
  
  // Sort variables within each cluster
  const modules = Array.from(clusters.values())
    .map(cluster => ({
      ...cluster,
      variables: cluster.variables.sort()
    }))
    .sort((a, b) => b.variables.length - a.variables.length) // Sort by size
  
  // Calculate inter-cluster dependencies
  const interClusterEdges = calculateInterClusterEdges(
    modules,
    assignments,
    modelFeatures
  )
  
  // Generate statistics
  const stats = generateStats(modules, allVariables.length, interClusterEdges)
  
  return {
    modules,
    stats,
    interClusterEdges,
    granularity: granularity
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
      assignments.set(constName, { id: 'Other', name: 'Other' })
      continue
    }
    
    // Count which clusters use this constant
    const clusterCounts = new Map()
    for (const dep of outgoing) {
      const depCluster = assignments.get(dep.name)
      if (depCluster) {
        const clusterId = typeof depCluster === 'string' ? depCluster : depCluster.id
        clusterCounts.set(clusterId, (clusterCounts.get(clusterId) || 0) + 1)
      }
    }
    
    // Assign constant to the cluster that uses it most
    let maxCount = 0
    let bestClusterId = 'Other'
    for (const [clusterId, count] of clusterCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        bestClusterId = clusterId
      }
    }
    
    // Find the module info for this cluster
    let moduleInfo = { id: bestClusterId, name: bestClusterId }
    for (const [, info] of assignments.entries()) {
      const id = typeof info === 'string' ? info : info.id
      if (id === bestClusterId) {
        moduleInfo = info
        break
      }
    }
    
    assignments.set(constName, moduleInfo)
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
        const targetInfo = assignments.get(dep.name)
        if (targetInfo) {
          const targetClusterId = typeof targetInfo === 'string' ? targetInfo : targetInfo.id
          if (targetClusterId !== cluster.id) {
            const edgeKey = `${cluster.id}->${targetClusterId}`
            if (!edgeSet.has(edgeKey)) {
              edgeSet.add(edgeKey)
              edges.push({
                from: cluster.id,
                to: targetClusterId
              })
            }
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
