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
 * Generate and display the graph
 */
async function generateGraph() {
  const modelEnv = getModelEnv();
  if (!modelEnv || !modelEnv.features) {
    ui.graphDot.textContent = 'No model loaded';
    ui.graphSvg.innerHTML = '';
    return;
  }
  
  const variable = ui.graphVariable.value;
  if (!variable) {
    ui.graphDot.textContent = 'Please select a variable';
    ui.graphSvg.innerHTML = '';
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
    } catch (svgError) {
      ui.graphSvg.innerHTML = `<p style="color: orange;">SVG rendering not available: ${svgError.message}</p><p>Install viz.js to enable SVG rendering, or copy the DOT source above to your own renderer.</p>`;
    }
  } catch (error) {
    ui.graphDot.textContent = `Error: ${error.message}`;
    ui.graphSvg.innerHTML = '';
  }
}

/**
 * Wire up the graph UI handlers
 */
export function wireGraphHandlers() {
  // Populate depth dropdown once on load
  populateDepthDropdown();
  
  // Enable generate button when both selections are made
  function updateGenerateButton() {
    ui.generateGraph.disabled = !ui.graphVariable.value || !ui.graphDepth.value;
  }
  
  ui.graphVariable.addEventListener('change', updateGenerateButton);
  ui.graphDepth.addEventListener('change', updateGenerateButton);
  
  ui.generateGraph.addEventListener('click', generateGraph);
  
  // Add event listener for fit-to-screen checkbox
  ui.graphFitToScreen.addEventListener('change', applyFitToScreen);
  
  // Listen for model load events to populate variables
  // We'll use a custom event or call this directly from modelApp
  window.addEventListener('modelLoaded', () => {
    populateVariableDropdown();
    ui.graphDot.textContent = '';
    ui.graphSvg.innerHTML = '';
  });
}
