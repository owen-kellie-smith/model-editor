import { ui } from "../ui.js";
import { getModelEnv } from "./modelApp.js";
import { getGraphOfRelations, getGraphOfRelationsMulti } from "../../core/graphRelations.js";
import { generateDot } from "../../core/graphviz.js";
import { saveSession } from "../../utils/persistence.js";

/**
 * Set of currently focused variable names for multi-variable graph display.
 * When empty, falls back to the dropdown selection.
 * @type {Set<string>}
 */
const focusedVariables = new Set();

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
  const currentSelection = ui.graphVariable.value;
  
  // Clear existing options except the first one
  ui.graphVariable.innerHTML = '<option value="">Select a variable...</option>';
  
  // Get all variables from the model (Map preserves insertion order = model order)
  const variables = Array.from(modelEnv.features.incoming.keys());
  
  // Sort alphabetically if checkbox is checked
  if (ui.graphSortAlphabetically.checked) {
    variables.sort();
  }
  // Otherwise keep model order (already in insertion order from Map)
  
  // Add each variable as an option
  for (const varName of variables) {
    const option = document.createElement('option');
    option.value = varName;
    option.textContent = varName;
    ui.graphVariable.appendChild(option);
  }
  
  // Restore previous selection if it still exists in the variables list
  if (currentSelection && variables.includes(currentSelection)) {
    ui.graphVariable.value = currentSelection;
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
  ui.downloadSvg.style.display = 'inline-block';
  ui.downloadPng.style.display = 'inline-block';
}

/**
 * Hide download links
 */
function hideDownloadLinks() {
  ui.downloadSvg.style.display = 'none';
  ui.downloadPng.style.display = 'none';
}

/**
 * Show the DOT source copy link
 */
function showDotCopyLink() {
  ui.graphDotCopy.style.visibility = 'visible';
}

/**
 * Hide the DOT source copy link
 */
function hideDotCopyLink() {
  ui.graphDotCopy.style.visibility = 'hidden';
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
  const filename = sanitizeFilename(ui.graphVariable.value);
  link.download = `graph-${filename}.svg`;
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
      const filename = sanitizeFilename(ui.graphVariable.value);
      link.download = `graph-${filename}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(pngUrl);
    });
  };
  
  img.src = url;
}

/**
 * Update the focused variables display panel to reflect the current selection.
 * Shows a list of all focused variables when more than one is selected.
 */
function updateFocusedVariablesDisplay() {
  if (!ui.graphFocusedList) return;
  if (focusedVariables.size <= 1) {
    ui.graphFocusedList.textContent = '';
  } else {
    const vars = Array.from(focusedVariables).join(', ');
    ui.graphFocusedList.textContent = `Focused: ${vars}`;
  }
  saveSession({ focusedVariables: Array.from(focusedVariables) });
}

/**
 * Attach Shift+click handlers to SVG graph nodes to support multi-variable focus.
 * Regular click on a node sets it as the sole focus.
 * Shift+click toggles the node in/out of the focused set.
 */
function attachNodeClickHandlers() {
  const svgElement = ui.graphSvg.querySelector('svg');
  if (!svgElement) return;

  svgElement.addEventListener('click', (event) => {
    const nodeEl = event.target.closest('.node');
    if (!nodeEl) return;

    const titleEl = nodeEl.querySelector('title');
    if (!titleEl) return;

    const varName = titleEl.textContent.trim();
    if (!varName) return;

    if (event.shiftKey) {
      // Toggle variable in the focused set; never allow an empty set
      if (focusedVariables.has(varName) && focusedVariables.size > 1) {
        focusedVariables.delete(varName);
      } else {
        focusedVariables.add(varName);
      }
    } else {
      // Single focus: clear set and focus only the clicked variable
      focusedVariables.clear();
      focusedVariables.add(varName);
      // Sync the dropdown to the clicked variable when possible
      if (ui.graphVariable.querySelector(`option[value="${varName}"]`)) {
        ui.graphVariable.value = varName;
      }
    }

    updateFocusedVariablesDisplay();
    generateGraph();
  });
}


/**
 * Generate and display the dependency graph for the currently focused variable(s).
 *
 * Uses `focusedVariables` to determine which variables to render. When multiple
 * variables are focused, builds the union graph via `getGraphOfRelationsMulti`.
 * Updates the DOT source, attempts SVG rendering, and attaches node click handlers.
 * Updates UI elements including download links, fit-to-screen, and error messages.
 *
 * @returns {Promise<void>}
 */
async function generateGraph() {
  const modelEnv = getModelEnv();
  if (!modelEnv || !modelEnv.features) {
    ui.graphDot.textContent = 'No model loaded';
    ui.graphSvg.innerHTML = '';
    hideDownloadLinks();
    hideDotCopyLink();
    return;
  }
  
  const variable = ui.graphVariable.value;
  if (!variable && focusedVariables.size === 0) {
    ui.graphDot.textContent = 'Please select a variable';
    ui.graphSvg.innerHTML = '';
    hideDownloadLinks();
    hideDotCopyLink();
    return;
  }

  // Determine variables to render: use focusedVariables if populated, else dropdown selection
  const varsToRender = focusedVariables.size > 0
    ? Array.from(focusedVariables)
    : [variable];

  // Primary variable for DOT root highlight and filename
  const primaryVariable = varsToRender[0];
  
  const depth = parseInt(ui.graphDepth.value, 10);
  
  try {
    // Generate the graph relations for all focused variables
    const graph = varsToRender.length > 1
      ? getGraphOfRelationsMulti(modelEnv.features, varsToRender, depth)
      : getGraphOfRelations(modelEnv.features, primaryVariable, depth);
    
    // Generate DOT format, highlighting all focused variables
    const focusedSet = focusedVariables.size > 0 ? new Set(focusedVariables) : null;
    const dotSource = generateDot(graph, primaryVariable, focusedSet);
    ui.graphDot.textContent = dotSource;
    showDotCopyLink();
    
    // Try to render SVG
    try {
      const svg = await renderDotToSvg(dotSource);
      ui.graphSvg.innerHTML = svg;
      // Apply fit-to-screen setting after rendering
      applyFitToScreen();
      // Attach node click handlers for Shift+click multi-focus
      attachNodeClickHandlers();
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
    hideDotCopyLink();
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
      // Selecting from the dropdown resets to single-variable focus
      focusedVariables.clear();
      focusedVariables.add(ui.graphVariable.value);
      updateFocusedVariablesDisplay();
      saveSession({ graphVariable: ui.graphVariable.value });
      generateGraph();
    }
  });
  
  ui.graphDepth.addEventListener('change', () => {
    saveSession({ graphDepth: ui.graphDepth.value });
    if (ui.graphVariable.value || focusedVariables.size > 0) {
      generateGraph();
    }
  });
  
  // Add event listener for fit-to-screen checkbox
  ui.graphFitToScreen.addEventListener('change', () => {
    saveSession({ graphFitToScreen: ui.graphFitToScreen.checked });
    applyFitToScreen();
  });
  
  // Add event listener for sort alphabetically checkbox
  ui.graphSortAlphabetically.addEventListener('change', () => {
    saveSession({ graphSortAlphabetically: ui.graphSortAlphabetically.checked });
    populateVariableDropdown();
  });
  
  // Add event listeners for download links
  ui.downloadSvg.addEventListener('click', downloadSvg);
  ui.downloadPng.addEventListener('click', downloadPng);
  
  // Add event listener for DOT source copy link
  ui.graphDotCopy.addEventListener('click', () => {
    if (!navigator.clipboard) {
      console.error('Clipboard API not available');
      return;
    }
    navigator.clipboard.writeText(ui.graphDot.textContent).catch(err => {
      console.error('Failed to copy DOT source:', err);
    });
  });
  
  // Listen for model load events to populate variables
  // We'll use a custom event or call this directly from modelApp
  window.addEventListener('modelLoaded', () => {
    focusedVariables.clear();
    updateFocusedVariablesDisplay();
    populateVariableDropdown();
    ui.graphDot.textContent = '';
    ui.graphSvg.innerHTML = '';
    hideDownloadLinks();
    hideDotCopyLink();
  });
}

/**
 * Restore graph UI settings and focused variables from a persisted session.
 * Must be called AFTER the model has been loaded (so the variable dropdown
 * is already populated).
 *
 * @param {Object} session - Session object returned by loadSession()
 */
export function restoreGraphFromSession(session) {
  // Restore simple UI settings
  if (session.graphFitToScreen !== undefined) {
    ui.graphFitToScreen.checked = session.graphFitToScreen;
    applyFitToScreen();
  }
  if (session.graphSortAlphabetically !== undefined) {
    ui.graphSortAlphabetically.checked = session.graphSortAlphabetically;
    populateVariableDropdown();
  }
  if (session.graphDepth !== undefined) {
    ui.graphDepth.value = session.graphDepth;
  }

  // Restore focused variables set
  const storedVars = Array.isArray(session.focusedVariables) ? session.focusedVariables : [];
  const primaryVar = session.graphVariable || storedVars[0];

  if (!primaryVar) return;

  // Check that at least the primary variable exists in the dropdown
  const primaryVarOption = ui.graphVariable.querySelector(`option[value="${CSS.escape(primaryVar)}"]`);
  if (!primaryVarOption) return;

  // Restore focusedVariables set
  focusedVariables.clear();
  const validVars = storedVars.filter(v =>
    ui.graphVariable.querySelector(`option[value="${CSS.escape(v)}"]`)
  );
  if (validVars.length > 0) {
    validVars.forEach(v => focusedVariables.add(v));
  } else {
    focusedVariables.add(primaryVar);
  }

  // Sync dropdown to primary variable
  ui.graphVariable.value = primaryVar;
  updateFocusedVariablesDisplay();
  generateGraph();
}

