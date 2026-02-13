import { ui } from "../ui.js";
import { getModelEnv } from "./modelApp.js";
import { getGraphOfRelations } from "../domain/graphRelations.js";
import { generateDot } from "../domain/graphviz.js";

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
  
  // Clear existing options except the first one
  ui.graphVariable.innerHTML = '<option value="">Select a variable...</option>';
  
  // Get all variables from the model
  const variables = Array.from(modelEnv.features.incoming.keys());
  variables.sort();
  
  // Add each variable as an option
  for (const varName of variables) {
    const option = document.createElement('option');
    option.value = varName;
    option.textContent = varName;
    ui.graphVariable.appendChild(option);
  }
  
  // Enable the controls
  ui.graphVariable.disabled = false;
  ui.graphDepth.disabled = false;
}

/**
 * Populate the depth dropdown (1-20)
 */
function populateDepthDropdown() {
  ui.graphDepth.innerHTML = '';
  for (let i = 1; i <= 20; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i;
    ui.graphDepth.appendChild(option);
  }
  // Set default to 2
  ui.graphDepth.value = '2';
}

/**
 * Apply or remove fit-to-screen styling to the graph SVG container
 */
function applyFitToScreen() {
  const fitToScreen = ui.graphFitToScreen.checked;
  if (fitToScreen) {
    ui.graphSvg.classList.add('fit-to-screen');
  } else {
    ui.graphSvg.classList.remove('fit-to-screen');
  }
}

/**
 * Show download links
 */
function showDownloadLinks() {
  ui.downloadSvg.style.display = '';
  ui.downloadPng.style.display = '';
}

/**
 * Hide download links
 */
function hideDownloadLinks() {
  ui.downloadSvg.style.display = 'none';
  ui.downloadPng.style.display = 'none';
}

/**
 * Download the SVG graph
 */
function downloadSvg(event) {
  event.preventDefault();
  
  const svgElement = ui.graphSvg.querySelector('svg');
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
  link.download = `graph-${ui.graphVariable.value || 'export'}.svg`;
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
  
  const svgElement = ui.graphSvg.querySelector('svg');
  if (!svgElement) {
    return;
  }
  
  // Create a canvas to convert SVG to PNG
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Get SVG dimensions
  const svgRect = svgElement.getBoundingClientRect();
  const svgWidth = svgElement.viewBox.baseVal.width || svgRect.width;
  const svgHeight = svgElement.viewBox.baseVal.height || svgRect.height;
  
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
      link.download = `graph-${ui.graphVariable.value || 'export'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(pngUrl);
    });
  };
  
  img.src = url;
}

/**
 * Generate and display the graph
 */
async function generateGraph() {
  const modelEnv = getModelEnv();
  if (!modelEnv || !modelEnv.features) {
    ui.graphDot.textContent = 'No model loaded';
    ui.graphSvg.innerHTML = '';
    hideDownloadLinks();
    return;
  }
  
  const variable = ui.graphVariable.value;
  if (!variable) {
    ui.graphDot.textContent = 'Please select a variable';
    ui.graphSvg.innerHTML = '';
    hideDownloadLinks();
    return;
  }
  
  const depth = parseInt(ui.graphDepth.value, 10);
  
  try {
    // Generate the graph relations
    const graph = getGraphOfRelations(modelEnv.features, variable, depth);
    
    // Generate DOT format
    const dotSource = generateDot(graph, variable);
    ui.graphDot.textContent = dotSource;
    
    // Try to render SVG
    try {
      const svg = await renderDotToSvg(dotSource);
      ui.graphSvg.innerHTML = svg;
      // Apply fit-to-screen setting after rendering
      applyFitToScreen();
      // Show download links after successful render
      showDownloadLinks();
    } catch (svgError) {
      ui.graphSvg.innerHTML = `<p style="color: orange;">SVG rendering not available: ${svgError.message}</p><p>Install viz.js to enable SVG rendering, or copy the DOT source above to your own renderer.</p>`;
      hideDownloadLinks();
    }
  } catch (error) {
    ui.graphDot.textContent = `Error: ${error.message}`;
    ui.graphSvg.innerHTML = '';
    hideDownloadLinks();
  }
}

/**
 * Wire up the graph UI handlers
 */
export function wireGraphHandlers() {
  // Populate depth dropdown once on load
  populateDepthDropdown();
  
  // Wire change events to automatically generate graph
  ui.graphVariable.addEventListener('change', () => {
    if (ui.graphVariable.value) {
      generateGraph();
    }
  });
  
  ui.graphDepth.addEventListener('change', () => {
    if (ui.graphVariable.value) {
      generateGraph();
    }
  });
  
  // Add event listener for fit-to-screen checkbox
  ui.graphFitToScreen.addEventListener('change', applyFitToScreen);
  
  // Add event listeners for download links
  ui.downloadSvg.addEventListener('click', downloadSvg);
  ui.downloadPng.addEventListener('click', downloadPng);
  
  // Listen for model load events to populate variables
  // We'll use a custom event or call this directly from modelApp
  window.addEventListener('modelLoaded', () => {
    populateVariableDropdown();
    ui.graphDot.textContent = '';
    ui.graphSvg.innerHTML = '';
    hideDownloadLinks();
  });
}
