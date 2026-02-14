/**
 * Cluster Graph Application
 * 
 * Provides UI integration for variable clustering and module analysis.
 * Implements a 3-step workflow: Load Model → Load Config → Generate Graph
 */

import { ui } from "../ui.js"
import { getModelEnv } from "./modelApp.js"
import { parseSemanticConfig } from "../analysis/semantic_config_parser.js"
import { getDefaultAnnuityFinanceConfig } from "../analysis/default-semantic-configs.js"
import { clusterVariables, generateClusterDot } from "../analysis/variable_clustering.js"

let semanticConfig = null
let clusteringResult = null

/**
 * Wire up event handlers for cluster graph UI
 */
export function wireClusterGraphHandlers() {
  // Load semantic configuration from file
  ui.loadSemanticConfigFile?.addEventListener('change', handleLoadSemanticConfigFile)
  
  // Load default semantic configuration
  ui.loadDefaultSemanticConfig?.addEventListener('click', handleLoadDefaultSemanticConfig)
  
  // Generate cluster graph button
  ui.generateClusterGraph?.addEventListener('click', handleGenerateClusterGraph)
  
  // Add event listener for fit-to-screen checkbox
  ui.clusterGraphFitToScreen?.addEventListener('change', applyClusterFitToScreen)
  
  // Export buttons
  ui.exportClusterDot?.addEventListener('click', () => exportClusterResult('dot'))
  ui.exportClusterJson?.addEventListener('click', () => exportClusterResult('json'))
  ui.exportClusterSvg?.addEventListener('click', () => exportClusterResult('svg'))
  
  // Listen for model loaded event
  window.addEventListener('modelLoaded', onModelUpdated)
}

/**
 * Handle loading semantic configuration from file
 */
async function handleLoadSemanticConfigFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  
  try {
    const text = await file.text()
    semanticConfig = parseSemanticConfig(text)
    
    displaySemanticConfigStatus(
      `✓ Semantic configuration loaded: ${semanticConfig.domains.length} domains defined`,
      'success'
    )
    
    // Enable generate button if model is loaded
    updateGenerateButtonState()
  } catch (error) {
    displaySemanticConfigStatus(
      `✗ Error loading semantic configuration: ${error.message}`,
      'error'
    )
    semanticConfig = null
  }
}

/**
 * Handle loading default semantic configuration
 */
async function handleLoadDefaultSemanticConfig() {
  try {
    displaySemanticConfigStatus('Loading default configuration...', 'info')
    
    const configText = await getDefaultAnnuityFinanceConfig()
    semanticConfig = parseSemanticConfig(configText)
    
    displaySemanticConfigStatus(
      `✓ Default configuration loaded: ${semanticConfig.domains.length} domains defined`,
      'success'
    )
    
    // Enable generate button if model is loaded
    updateGenerateButtonState()
  } catch (error) {
    displaySemanticConfigStatus(
      `✗ Error loading default configuration: ${error.message}`,
      'error'
    )
    semanticConfig = null
  }
}

/**
 * Handle generating cluster graph
 */
async function handleGenerateClusterGraph() {
  const modelEnv = getModelEnv()
  
  if (!modelEnv || !modelEnv.features) {
    displayClusterStatus('Please load a model first', 'error')
    return
  }
  
  if (!semanticConfig) {
    displayClusterStatus('Please load a semantic configuration first', 'error')
    return
  }
  
  try {
    displayClusterStatus('Generating cluster graph...', 'info')
    
    // Get granularity setting
    const granularity = ui.clusterGranularity?.value || 'medium'
    
    // Perform clustering with granularity option
    clusteringResult = clusterVariables(modelEnv.features, semanticConfig, { granularity })
    
    // Display results
    displayClusteringResults(clusteringResult)
    
    // Render graph visualization
    await renderClusterGraph(clusteringResult)
    
    displayClusterStatus(
      `✓ Clustering complete: ${clusteringResult.modules.length} modules identified (${granularity} granularity)`,
      'success'
    )
  } catch (error) {
    displayClusterStatus(
      `✗ Error generating cluster graph: ${error.message}`,
      'error'
    )
    console.error('Clustering error:', error)
  }
}

/**
 * Display clustering results in the UI
 */
function displayClusteringResults(result) {
  // Display statistics
  if (ui.clusterStats) {
    ui.clusterStats.innerHTML = `
      <dl>
        <dt>Total Variables:</dt>
        <dd>${result.stats.totalVariables}</dd>
        <dt>Total Modules:</dt>
        <dd>${result.stats.totalClusters}</dd>
        <dt>Average Module Size:</dt>
        <dd>${result.stats.avgClusterSize}</dd>
        <dt>Min/Max Module Size:</dt>
        <dd>${result.stats.minClusterSize} / ${result.stats.maxClusterSize}</dd>
        <dt>Inter-Module Edges:</dt>
        <dd>${result.stats.interClusterEdges}</dd>
      </dl>
    `
  }
  
  // Display modules
  if (ui.clusterModules) {
    const modulesHtml = result.modules
      .map(module => `
        <div class="cluster-module">
          <div class="cluster-module-header">
            ${module.displayName} (${module.variables.length} variables)
          </div>
          <div class="cluster-module-vars">
            ${module.variables.join(', ')}
          </div>
        </div>
      `)
      .join('')
    
    ui.clusterModules.innerHTML = modulesHtml
  }
  
  // Display DOT source
  if (ui.clusterGraphDot) {
    const dotSource = generateClusterDot(result)
    ui.clusterGraphDot.textContent = dotSource
  }
  
  // Enable export buttons
  ui.exportClusterDot?.removeAttribute('disabled')
  ui.exportClusterJson?.removeAttribute('disabled')
  ui.exportClusterSvg?.removeAttribute('disabled')
}

/**
 * Apply or remove fit-to-screen styling to the cluster graph SVG container
 */
function applyClusterFitToScreen() {
  const fitToScreen = ui.clusterGraphFitToScreen?.checked
  if (fitToScreen) {
    ui.clusterGraphSvg?.classList.add('fit-to-screen')
  } else {
    ui.clusterGraphSvg?.classList.remove('fit-to-screen')
  }
}

/**
 * Render cluster graph as SVG
 */
async function renderClusterGraph(result) {
  if (!ui.clusterGraphSvg) return
  
  try {
    const dotSource = generateClusterDot(result)
    
    // Check if Viz is available
    if (typeof Viz === 'undefined') {
      ui.clusterGraphSvg.innerHTML = '<p>Viz.js not available for rendering. See DOT source below.</p>'
      return
    }
    
    const viz = new Viz()
    const svg = await viz.renderString(dotSource)
    ui.clusterGraphSvg.innerHTML = svg
    // Apply fit-to-screen setting after rendering
    applyClusterFitToScreen()
  } catch (error) {
    console.error('Error rendering cluster graph:', error)
    ui.clusterGraphSvg.innerHTML = `<p>Error rendering graph: ${error.message}</p>`
  }
}

/**
 * Export clustering results in different formats
 */
function exportClusterResult(format) {
  if (!clusteringResult) {
    displayClusterStatus('No clustering result to export', 'error')
    return
  }
  
  let content, filename, mimeType
  
  switch (format) {
    case 'dot':
      content = generateClusterDot(clusteringResult)
      filename = 'cluster-graph.dot'
      mimeType = 'text/vnd.graphviz'
      break
      
    case 'json':
      content = JSON.stringify(clusteringResult, null, 2)
      filename = 'cluster-graph.json'
      mimeType = 'application/json'
      break
      
    case 'svg':
      const svgElement = ui.clusterGraphSvg?.querySelector('svg')
      if (!svgElement) {
        displayClusterStatus('No SVG to export. Please generate the graph first.', 'error')
        return
      }
      content = svgElement.outerHTML
      filename = 'cluster-graph.svg'
      mimeType = 'image/svg+xml'
      break
      
    default:
      displayClusterStatus('Unknown export format', 'error')
      return
  }
  
  // Create download link
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Display semantic config status message
 */
function displaySemanticConfigStatus(message, type = 'info') {
  if (!ui.semanticConfigStatus) return
  
  ui.semanticConfigStatus.textContent = message
  ui.semanticConfigStatus.className = `cluster-status ${type}`
  ui.semanticConfigStatus.style.display = 'block'
}

/**
 * Display cluster status message
 */
function displayClusterStatus(message, type = 'info') {
  if (!ui.clusterStatus) return
  
  ui.clusterStatus.textContent = message
  ui.clusterStatus.className = `cluster-status ${type}`
  ui.clusterStatus.style.display = 'block'
}

/**
 * Update the state of the generate button based on prerequisites
 */
function updateGenerateButtonState() {
  const modelEnv = getModelEnv()
  const hasModel = modelEnv && modelEnv.features
  const hasConfig = semanticConfig !== null
  
  if (ui.generateClusterGraph) {
    ui.generateClusterGraph.disabled = !(hasModel && hasConfig)
  }
}

/**
 * Called when model is loaded/updated to update UI state
 */
export function onModelUpdated() {
  updateGenerateButtonState()
  
  // Clear previous results
  clusteringResult = null
  if (ui.clusterStats) ui.clusterStats.innerHTML = ''
  if (ui.clusterModules) ui.clusterModules.innerHTML = ''
  if (ui.clusterGraphDot) ui.clusterGraphDot.textContent = ''
  if (ui.clusterGraphSvg) ui.clusterGraphSvg.innerHTML = ''
  
  // Disable export buttons
  ui.exportClusterDot?.setAttribute('disabled', 'disabled')
  ui.exportClusterJson?.setAttribute('disabled', 'disabled')
  ui.exportClusterSvg?.setAttribute('disabled', 'disabled')
}
