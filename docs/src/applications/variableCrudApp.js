import { ui } from "../ui.js";
import { getModelEnv } from "./modelApp.js";
import { setElementContent } from "../utils/helpers.js";
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

    const html = variables.map(v => {
      const definitionPreview = getDefinitionPreview(v.definition);
      const metadata = [];
      
      // Handle dataType which might be an object with #text or a string
      if (v.dataType) {
        const dataType = typeof v.dataType === 'object' ? v.dataType['#text'] : v.dataType;
        metadata.push(`Type: ${dataType}`);
      }
      
      // Handle unit which might be an object with #text or a string
      if (v.unit) {
        const unit = typeof v.unit === 'object' ? v.unit['#text'] : v.unit;
        metadata.push(`Unit: ${unit}`);
      }
      
      if (v.arguments?.arg) {
        const argCount = Array.isArray(v.arguments.arg) 
          ? v.arguments.arg.length 
          : 1;
        metadata.push(`Args: ${argCount}`);
      }
      
      return `
        <div class="variable-item">
          <strong>${v.id}</strong>
          ${metadata.length > 0 ? `<div style="font-size: 0.85em; color: #666;">${metadata.join(' | ')}</div>` : ''}
          <small>${definitionPreview}</small>
        </div>
      `;
    }).join('');

    setElementContent(ui.variableList, html);
  } catch (error) {
    setElementContent(ui.variableList, `<p style="color: red;">Error loading variables: ${error.message}</p>`);
  }
}

/**
 * Gets a preview string for a variable definition
 */
function getDefinitionPreview(definition) {
  if (!definition) return "No definition";
  
  if (definition['#text']) {
    const text = definition['#text'].trim();
    return text.length > 60 ? text.substring(0, 57) + '...' : text;
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
