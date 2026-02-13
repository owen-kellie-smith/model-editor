import { ui } from "../ui.js";
import { getModelEnv } from "./modelApp.js";
import { setElementContent, escapeHtml } from "../utils/helpers.js";
import { listVariables } from "../domain/variableCrud.js";

let currentSelectedVariableId = null;

/**
 * Renders the dropdown list of variables from the current model
 */
export function renderVariableDropdown() {
  const modelEnv = getModelEnv();
  
  // Clear the dropdown
  ui.variableDropdown.innerHTML = "";
  
  // Hide details and form sections
  ui.variableDetails.style.display = "none";
  ui.variableFormSection.style.display = "none";
  currentSelectedVariableId = null;
  
  if (!modelEnv) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Load a model to see variables...";
    ui.variableDropdown.appendChild(option);
    ui.variableDropdown.disabled = true;
    return;
  }

  try {
    const variables = listVariables(modelEnv.obj);
    
    if (variables.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No variables in model";
      ui.variableDropdown.appendChild(option);
      ui.variableDropdown.disabled = true;
      return;
    }

    // Add default option
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select a variable...";
    ui.variableDropdown.appendChild(defaultOption);
    
    // Add variable options
    variables.forEach(variable => {
      const option = document.createElement("option");
      option.value = variable.id;
      option.textContent = variable.id;
      ui.variableDropdown.appendChild(option);
    });
    
    ui.variableDropdown.disabled = false;
  } catch (error) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = `Error loading variables: ${error.message}`;
    ui.variableDropdown.appendChild(option);
    ui.variableDropdown.disabled = true;
  }
}

/**
 * Displays the details of the selected variable
 */
function showVariableDetails(variableId) {
  const modelEnv = getModelEnv();
  if (!modelEnv) return;
  
  try {
    const variables = listVariables(modelEnv.obj);
    const variable = variables.find(v => v.id === variableId);
    
    if (!variable) {
      ui.variableDetails.style.display = "none";
      return;
    }
    
    currentSelectedVariableId = variableId;
    
    // Set variable name
    setElementContent(ui.selectedVariableName, escapeHtml(variable.id));
    
    // Build features HTML
    const features = [];
    
    // Handle dataType which might be an object with #text or a string
    if (variable.dataType) {
      const dataType = typeof variable.dataType === 'object' ? variable.dataType['#text'] : variable.dataType;
      features.push(`<strong>Type:</strong> ${escapeHtml(dataType)}`);
    }
    
    // Handle unit which might be an object with #text or a string
    if (variable.unit) {
      const unit = typeof variable.unit === 'object' ? variable.unit['#text'] : variable.unit;
      features.push(`<strong>Unit:</strong> ${escapeHtml(unit)}`);
    }
    
    // Display definition
    const definitionPreview = getDefinitionPreview(variable.definition);
    features.push(`<strong>Definition:</strong> <code>${escapeHtml(definitionPreview)}</code>`);
    
    // Display arguments if present
    if (variable.arguments?.arg) {
      const argCount = Array.isArray(variable.arguments.arg) 
        ? variable.arguments.arg.length 
        : 1;
      features.push(`<strong>Arguments:</strong> ${argCount}`);
    }
    
    setElementContent(ui.selectedVariableFeatures, features.join('<br>'));
    
    // Show the details section
    ui.variableDetails.style.display = "block";
  } catch (error) {
    console.error("Error showing variable details:", error);
    ui.variableDetails.style.display = "none";
  }
}

/**
 * Gets a preview string for a variable definition
 */
function getDefinitionPreview(definition) {
  const MAX_PREVIEW_LENGTH = 80;
  
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
 * Shows the edit form for the selected variable
 */
function showEditForm() {
  if (!currentSelectedVariableId) return;
  
  const modelEnv = getModelEnv();
  if (!modelEnv) return;
  
  try {
    const variables = listVariables(modelEnv.obj);
    const variable = variables.find(v => v.id === currentSelectedVariableId);
    
    if (!variable) return;
    
    // Populate the form
    ui.editVarId.value = variable.id;
    
    // Handle definition - extract text if available
    if (variable.definition) {
      const definitionText = variable.definition['#text'] || '';
      ui.editVarDefinition.value = definitionText;
    } else {
      ui.editVarDefinition.value = '';
    }
    
    // Handle dataType
    const dataType = variable.dataType 
      ? (typeof variable.dataType === 'object' ? variable.dataType['#text'] : variable.dataType)
      : '';
    ui.editVarDataType.value = dataType;
    
    // Handle unit
    const unit = variable.unit 
      ? (typeof variable.unit === 'object' ? variable.unit['#text'] : variable.unit)
      : '';
    ui.editVarUnit.value = unit;
    
    // Show the form section
    ui.variableFormSection.style.display = "block";
    ui.variableFormSection.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error("Error showing edit form:", error);
    alert(`Error loading variable for editing: ${error.message}`);
  }
}

/**
 * Hides the edit form
 */
function hideEditForm() {
  ui.variableFormSection.style.display = "none";
  
  // Clear form fields
  ui.editVarId.value = '';
  ui.editVarDefinition.value = '';
  ui.editVarDataType.value = '';
  ui.editVarUnit.value = '';
}

/**
 * Handles the copy variable action
 */
function handleCopyVariable() {
  if (!currentSelectedVariableId) return;
  
  // For now, just show an alert
  // In a full implementation, this would create a new variable with copied data
  alert(`Copy functionality for variable "${currentSelectedVariableId}" is not yet implemented.`);
}

/**
 * Handles the delete variable action
 */
function handleDeleteVariable() {
  if (!currentSelectedVariableId) return;
  
  const confirmed = confirm(`Are you sure you want to delete variable "${currentSelectedVariableId}"?`);
  
  if (!confirmed) return;
  
  // For now, just show an alert
  // In a full implementation, this would call deleteVariable() from variableCrud.js
  alert(`Delete functionality for variable "${currentSelectedVariableId}" is not yet implemented.`);
}

/**
 * Handles the save variable action
 */
function handleSaveVariable() {
  if (!currentSelectedVariableId) return;
  
  // For now, just show an alert and hide the form
  // In a full implementation, this would call updateVariable() from variableCrud.js
  alert(`Save functionality for variable "${currentSelectedVariableId}" is not yet implemented.\n\nThe variable CRUD operations need to be implemented in variableCrud.js first.`);
  
  hideEditForm();
}

/**
 * Wire up event handlers for variable CRUD operations
 */
export function wireVariableCrudHandlers() {
  // Listen for dropdown selection changes
  ui.variableDropdown.addEventListener('change', (event) => {
    const selectedId = event.target.value;
    
    if (selectedId) {
      showVariableDetails(selectedId);
    } else {
      ui.variableDetails.style.display = "none";
      ui.variableFormSection.style.display = "none";
      currentSelectedVariableId = null;
    }
  });
  
  // Edit button handler
  ui.editVariableBtn.addEventListener('click', () => {
    showEditForm();
  });
  
  // Copy button handler
  ui.copyVariableBtn.addEventListener('click', () => {
    handleCopyVariable();
  });
  
  // Delete button handler
  ui.deleteVariableBtn.addEventListener('click', () => {
    handleDeleteVariable();
  });
  
  // Save button handler
  ui.saveVariableBtn.addEventListener('click', () => {
    handleSaveVariable();
  });
  
  // Cancel button handler
  ui.cancelEditBtn.addEventListener('click', () => {
    hideEditForm();
  });
  
  // Listen for model loaded events to refresh the variable list
  window.addEventListener('modelLoaded', () => {
    renderVariableDropdown();
  });

  // Initial render (will show "Load a model..." message)
  renderVariableDropdown();
}
