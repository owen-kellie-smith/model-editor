import { ui } from "../ui.js";
import { getModelEnv } from "./modelApp.js";
import { getGraphOfRelations } from "../domain/graphRelations.js";
import { generateClusterDot } from "../domain/graphviz.js";

/**
 * Render DOT format to SVG using Viz.js (loaded from CDN)
 * 
 * @param {string} dotSource - DOT format string
 * @returns {Promise<string>} SVG string
 */
async function renderDotToSvg(dotSource) {
  // Check if Viz is available
  if (typeof Viz === 'undefined') {
    throw new Error('Viz.js library not loaded. Please ensure viz.js is included in the page.');
  }
  
  try {
    const viz = new Viz();
    const svg = await viz.renderString(dotSource);
    return svg;
  } catch (error) {
    console.error('Error rendering DOT to SVG:', error);
    throw error;
  }
}

/**
 * Populate the variable dropdown with variables from the model
 */
function populateVariableDropdown() {
  const modelEnv = getModelEnv();
  if (!modelEnv || !modelEnv.features) {
    return;
  }
  
  // Store the currently selected value
  const currentSelection = ui.clusterGraphVariable.value;
  
  // Clear existing options except the first one
  ui.clusterGraphVariable.innerHTML = '<option value="">Select a variable...</option>';
  
  // Get all variables from the model (Map preserves insertion order = model order)
  const variables = Array.from(modelEnv.features.incoming.keys());
  
  // Sort alphabetically if checkbox is checked
  if (ui.clusterGraphSortAlphabetically.checked) {
    variables.sort();
  }
  // Otherwise keep model order (already in insertion order from Map)
  
  // Add each variable as an option
  for (const varName of variables) {
    const option = document.createElement('option');
    option.value = varName;
    option.textContent = varName;
    ui.clusterGraphVariable.appendChild(option);
  }
  
  // Restore previous selection if it still exists in the variables list
  if (currentSelection && variables.includes(currentSelection)) {
    ui.clusterGraphVariable.value = currentSelection;
  }
  
  // Enable the controls
  ui.clusterGraphVariable.disabled = false;
  ui.clusterGraphDepth.disabled = false;
}

/**
 * Populate the depth dropdown (1-20)
 */
function populateDepthDropdown() {
  ui.clusterGraphDepth.innerHTML = '';
  for (let i = 1; i <= 20; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i;
    ui.clusterGraphDepth.appendChild(option);
  }
  // Set default to 2
  ui.clusterGraphDepth.value = '2';
}

/**
 * Apply or remove fit-to-screen styling to the graph SVG container
 */
function applyFitToScreen() {
  const fitToScreen = ui.clusterGraphFitToScreen.checked;
  if (fitToScreen) {
    ui.clusterGraphSvg.classList.add('fit-to-screen');
  } else {
    ui.clusterGraphSvg.classList.remove('fit-to-screen');
  }
}

/**
 * Show download links
 */
function showDownloadLinks() {
  ui.downloadClusterSvg.style.display = 'inline-block';
  ui.downloadClusterPng.style.display = 'inline-block';
}

/**
 * Hide download links
 */
function hideDownloadLinks() {
  ui.downloadClusterSvg.style.display = 'none';
  ui.downloadClusterPng.style.display = 'none';
}

/**
 * Sanitize a string to make it safe for use as a filename
 */
function sanitizeFilename(name) {
  if (!name) {
    return 'export';
  }
  // Replace spaces with hyphens, remove invalid filename characters, collapse multiple hyphens, and trim hyphens
  return name
    .replace(/[<>:"|?*\s/\\]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'export';
}

/**
 * Download the SVG graph
 */
function downloadSvg(event) {
  event.preventDefault();
  
  const svgElement = ui.clusterGraphSvg.querySelector('svg');
  if (!svgElement) {
    return;
  }
  
  // Get the SVG content
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  // Create a temporary link and trigger download
  const link = document.createElement('a');
  link.href = url;
  const filename = sanitizeFilename(ui.clusterGraphVariable.value);
  link.download = `cluster-graph-${filename}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download the graph as PNG
 */
function downloadPng(event) {
  event.preventDefault();
  
  const svgElement = ui.clusterGraphSvg.querySelector('svg');
  if (!svgElement) {
    return;
  }
  
  // Create a canvas to convert SVG to PNG
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Get SVG dimensions - prefer viewBox, then width/height attributes, finally getBoundingClientRect
  // We check for > 0 because we need valid dimensions for canvas rendering (0 would be invalid)
  let svgWidth, svgHeight;
  try {
    if (svgElement.viewBox && svgElement.viewBox.baseVal && 
        typeof svgElement.viewBox.baseVal.width === 'number' && 
        typeof svgElement.viewBox.baseVal.height === 'number' &&
        svgElement.viewBox.baseVal.width > 0 && svgElement.viewBox.baseVal.height > 0) {
      svgWidth = svgElement.viewBox.baseVal.width;
      svgHeight = svgElement.viewBox.baseVal.height;
    } else if (svgElement.width && svgElement.width.baseVal && 
               svgElement.height && svgElement.height.baseVal &&
               typeof svgElement.width.baseVal.value === 'number' && 
               typeof svgElement.height.baseVal.value === 'number' &&
               svgElement.width.baseVal.value > 0 && svgElement.height.baseVal.value > 0) {
      svgWidth = svgElement.width.baseVal.value;
      svgHeight = svgElement.height.baseVal.value;
    } else {
      // Fallback to bounding rect
      const svgRect = svgElement.getBoundingClientRect();
      svgWidth = svgRect.width || 800;  // Default to 800 if all else fails
      svgHeight = svgRect.height || 600; // Default to 600 if all else fails
    }
  } catch (e) {
    // If there's any error accessing properties, fall back to bounding rect
    const svgRect = svgElement.getBoundingClientRect();
    svgWidth = svgRect.width || 800;
    svgHeight = svgRect.height || 600;
  }
  
  // Set canvas size
  canvas.width = svgWidth;
  canvas.height = svgHeight;
  
  // Create an image from the SVG
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const img = new Image();
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  img.onload = function() {
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    
    // Convert canvas to PNG and download
    canvas.toBlob(function(pngBlob) {
      const pngUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement('a');
      link.href = pngUrl;
      const filename = sanitizeFilename(ui.clusterGraphVariable.value);
      link.download = `cluster-graph-${filename}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(pngUrl);
    });
  };
  
  img.src = url;
}

/**
 * Generate and display the cluster graph
 */
async function generateGraph() {
  const modelEnv = getModelEnv();
  if (!modelEnv || !modelEnv.features) {
    ui.clusterGraphDot.textContent = 'No model loaded';
    ui.clusterGraphSvg.innerHTML = '';
    hideDownloadLinks();
    return;
  }
  
  const variable = ui.clusterGraphVariable.value;
  if (!variable) {
    ui.clusterGraphDot.textContent = 'Please select a variable';
    ui.clusterGraphSvg.innerHTML = '';
    hideDownloadLinks();
    return;
  }
  
  const depth = parseInt(ui.clusterGraphDepth.value, 10);
  
  try {
    // Generate the graph relations
    const graph = getGraphOfRelations(modelEnv.features, variable, depth);
    
    // Generate DOT format with clustering
    const dotSource = generateClusterDot(graph, variable, depth);
    ui.clusterGraphDot.textContent = dotSource;
    
    // Try to render SVG
    try {
      const svg = await renderDotToSvg(dotSource);
      ui.clusterGraphSvg.innerHTML = svg;
      // Apply fit-to-screen setting after rendering
      applyFitToScreen();
      // Show download links after successful render
      showDownloadLinks();
    } catch (svgError) {
      ui.clusterGraphSvg.innerHTML = `<p style="color: orange;">SVG rendering not available: ${svgError.message}</p><p>Install viz.js to enable SVG rendering, or copy the DOT source above to your own renderer.</p>`;
      hideDownloadLinks();
    }
  } catch (error) {
    ui.clusterGraphDot.textContent = `Error: ${error.message}`;
    ui.clusterGraphSvg.innerHTML = '';
    hideDownloadLinks();
  }
}

/**
 * Wire up the cluster graph UI handlers
 */
export function wireClusterGraphHandlers() {
  // Populate depth dropdown once on load
  populateDepthDropdown();
  
  // Wire change events to automatically generate graph
  ui.clusterGraphVariable.addEventListener('change', () => {
    if (ui.clusterGraphVariable.value) {
      generateGraph();
    }
  });
  
  ui.clusterGraphDepth.addEventListener('change', () => {
    if (ui.clusterGraphVariable.value) {
      generateGraph();
    }
  });
  
  // Add event listener for fit-to-screen checkbox
  ui.clusterGraphFitToScreen.addEventListener('change', applyFitToScreen);
  
  // Add event listener for sort alphabetically checkbox
  ui.clusterGraphSortAlphabetically.addEventListener('change', () => {
    populateVariableDropdown();
  });
  
  // Add event listeners for download links
  ui.downloadClusterSvg.addEventListener('click', downloadSvg);
  ui.downloadClusterPng.addEventListener('click', downloadPng);
  
  // Listen for model load events to populate variables
  // We'll use a custom event or call this directly from modelApp
  window.addEventListener('modelLoaded', () => {
    populateVariableDropdown();
    ui.clusterGraphDot.textContent = '';
    ui.clusterGraphSvg.innerHTML = '';
    hideDownloadLinks();
  });
}
