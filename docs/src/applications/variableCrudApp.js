import { ui } from "../ui.js";
import { getModelEnv } from "./modelApp.js";
import { setElementContent, escapeHtml } from "../utils/helpers.js";
import { listVariables } from "../domain/variableCrud.js";

/**
 * Renders the list of variables from the current model
 */
export function renderVariableList() {
  const modelEnv = getModelEnv();
  
  if (!modelEnv) {
    setElementContent(ui.variableList, "<p>Load a model to see variables...</p>");
    return;
  }

  try {
    const variables = listVariables(modelEnv.obj);
    
    if (variables.length === 0) {
      setElementContent(ui.variableList, "<p>No variables in model</p>");
      return;
    }

    const html = variables.map(variable => {
      const definitionPreview = getDefinitionPreview(variable.definition);
      const metadata = [];
      
      // Handle dataType which might be an object with #text or a string
      if (variable.dataType) {
        const dataType = typeof variable.dataType === 'object' ? variable.dataType['#text'] : variable.dataType;
        metadata.push(`Type: ${escapeHtml(dataType)}`);
      }
      
      // Handle unit which might be an object with #text or a string
      if (variable.unit) {
        const unit = typeof variable.unit === 'object' ? variable.unit['#text'] : variable.unit;
        metadata.push(`Unit: ${escapeHtml(unit)}`);
      }
      
      if (variable.arguments?.arg) {
        const argCount = Array.isArray(variable.arguments.arg) 
          ? variable.arguments.arg.length 
          : 1;
        metadata.push(`Args: ${argCount}`);
      }
      
      return `
        <div class="variable-item">
          <strong>${escapeHtml(variable.id)}</strong>
          ${metadata.length > 0 ? `<div style="font-size: 0.85em; color: #666;">${metadata.join(' | ')}</div>` : ''}
          <small>${escapeHtml(definitionPreview)}</small>
        </div>
      `;
    }).join('');

    setElementContent(ui.variableList, html);
  } catch (error) {
    setElementContent(ui.variableList, `<p style="color: red;">Error loading variables: ${escapeHtml(error.message)}</p>`);
  }
}

/**
 * Gets a preview string for a variable definition
 */
function getDefinitionPreview(definition) {
  const MAX_PREVIEW_LENGTH = 60;
  
  if (!definition) return "No definition";
  
  if (definition['#text']) {
    const text = definition['#text'].trim();
    return text.length > MAX_PREVIEW_LENGTH ? text.substring(0, MAX_PREVIEW_LENGTH - 3) + '...' : text;
  }
  
  if (definition.type) {
    return `[${definition.type}]`;
  }
  
  return "Complex definition";
}

/**
 * Wire up event handlers for variable CRUD operations
 */
export function wireVariableCrudHandlers() {
  // Listen for model loaded events to refresh the variable list
  window.addEventListener('modelLoaded', () => {
    renderVariableList();
  });

  // Initial render (will show "Load a model..." message)
  renderVariableList();
}
