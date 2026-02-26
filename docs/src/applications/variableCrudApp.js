import { ui } from "../ui.js";
import { getModelEnv, validateModel } from "./modelApp.js";
import { getLanguageEnv } from "./languageApp.js";
import { setElementContent, escapeHtml } from "../utils/helpers.js";
import { 
  listVariables, 
  createVariable, 
  updateVariable, 
  deleteVariable, 
  copyVariable, 
  readVariable 
} from "../domain/variableCrud.js";
import { serializeModel, serializeDefinition, parseDefinitionXml } from "../domain/serialize.js";

let currentSelectedVariableId = null;
let isCreatingNew = false;

/**
 * Templates for different definition types
 */
const DEFINITION_TEMPLATES = {
  expression: '<definition type="expression">your formula here</definition>',
  constant: '<definition type="constant">value</definition>',
  table: `<definition type="table">
  <table ref="table_name"/>
  <column ref="column_name"/>
</definition>`,
  tableLookup: `<definition type="tableLookup">
  <table ref="table_name"/>
  <row ref="row_variable"/>
  <columnSelector ref="selector_variable"/>
</definition>`,
  piecewise: `<definition type="piecewise">
  <case>
    <when>condition</when>
    <value>result</value>
  </case>
</definition>`
};

/**
 * Populates the definition textarea with a template based on the selected type
 */
function populateDefinitionTemplate(definitionType) {
  if (!definitionType || !DEFINITION_TEMPLATES[definitionType]) {
    return;
  }
  
  ui.editVarDefinition.value = DEFINITION_TEMPLATES[definitionType];
}

/**
 * Validates that both model and language environments are loaded.
 * Shows an alert if either is missing.
 * 
 * @returns {Object|null} Returns { modelEnv, lang } if both are loaded, null otherwise
 */
function validateEnvironments() {
  const modelEnv = getModelEnv();
  if (!modelEnv) {
    alert("Model not loaded. Please load a model first.");
    return null;
  }
  
  const lang = getLanguageEnv();
  if (!lang) {
    alert("Language environment not loaded. Please load a language file first.");
    return null;
  }
  
  return { modelEnv, lang };
}

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
    let variables = listVariables(modelEnv.obj);
    
    if (variables.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No variables in model";
      ui.variableDropdown.appendChild(option);
      ui.variableDropdown.disabled = true;
      return;
    }

    // Sort alphabetically if checkbox is checked
    if (ui.sortVariablesAlpha.checked) {
      variables = [...variables].sort((a, b) => a.id.localeCompare(b.id));
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
    
    isCreatingNew = false;
    
    // Update form title
    ui.variableFormTitle.textContent = "Edit Variable";
    
    // Populate the form
    ui.editVarId.value = variable.id;
    ui.editVarId.disabled = true; // Can't change ID when editing
    
    // Serialize the full definition as XML
    if (variable.definition) {
      const definitionXml = serializeDefinition(variable.definition);
      ui.editVarDefinition.value = definitionXml;
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
    
    // Reset definition type dropdown
    ui.definitionTypeSelect.value = '';
    
    // Show the form section
    ui.variableFormSection.style.display = "block";
    ui.variableFormSection.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error("Error showing edit form:", error);
    alert(`Error loading variable for editing: ${error.message}`);
  }
}

/**
 * Shows the form for creating a new variable
 */
function showNewVariableForm() {
  const modelEnv = getModelEnv();
  if (!modelEnv) {
    alert("Please load a model first.");
    return;
  }
  
  isCreatingNew = true;
  
  // Update form title
  ui.variableFormTitle.textContent = "New Variable";
  
  // Clear and enable the form fields
  ui.editVarId.value = '';
  ui.editVarId.disabled = false; // Can set ID for new variable
  ui.editVarDefinition.value = '';
  ui.editVarDataType.value = 'real';
  ui.editVarUnit.value = '';
  ui.definitionTypeSelect.value = '';
  
  // Show the form section
  ui.variableFormSection.style.display = "block";
  ui.variableFormSection.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Shows the form for copying a variable
 */
function showCopyVariableForm() {
  if (!currentSelectedVariableId) return;
  
  const modelEnv = getModelEnv();
  if (!modelEnv) return;
  
  try {
    const variables = listVariables(modelEnv.obj);
    const variable = variables.find(v => v.id === currentSelectedVariableId);
    
    if (!variable) return;
    
    isCreatingNew = true;
    
    // Update form title
    ui.variableFormTitle.textContent = "Copy Variable";
    
    // Populate the form with source variable data
    ui.editVarId.value = variable.id + "_copy";
    ui.editVarId.disabled = false; // Can change ID for copy
    // Serialize the full definition as XML
    if (variable.definition) {
      const definitionXml = serializeDefinition(variable.definition);
      ui.editVarDefinition.value = definitionXml;
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
    
    // Reset definition type dropdown
    ui.definitionTypeSelect.value = '';
    
    // Show the form section
    ui.variableFormSection.style.display = "block";
    ui.variableFormSection.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error("Error showing copy form:", error);
    alert(`Error loading variable for copying: ${error.message}`);
  }
}

/**
 * Hides the edit form
 */
function hideEditForm() {
  ui.variableFormSection.style.display = "none";
  isCreatingNew = false;
  
  // Clear form fields
  ui.editVarId.value = '';
  ui.editVarDefinition.value = '';
  ui.editVarDataType.value = '';
  ui.editVarUnit.value = '';
  ui.definitionTypeSelect.value = '';
}

/**
 * Handles the copy variable action
 */
function handleCopyVariable() {
  if (!currentSelectedVariableId) return;
  showCopyVariableForm();
}

/**
 * Handles the delete variable action
 */
function handleDeleteVariable() {
  if (!currentSelectedVariableId) return;
  
  const confirmed = confirm(`Are you sure you want to delete variable "${currentSelectedVariableId}"?`);
  
  if (!confirmed) return;
  
  const env = validateEnvironments();
  if (!env) return;
  
  const { modelEnv, lang } = env;
  
  // Store the variable ID before we set it to null
  const deletedVariableId = currentSelectedVariableId;
  
  try {
    const result = deleteVariable(modelEnv.obj, deletedVariableId, lang);
      
    // Update the copy model in textarea
    const xml = serializeModel(result.obj);
    ui.modelText.value = xml.trim();
    validateModel(ui.modelText.value, "After delete", lang);
    
    // Refresh the variable dropdown
    renderVariableDropdown();
    
    // Hide details and form
    ui.variableDetails.style.display = "none";
    ui.variableFormSection.style.display = "none";
    currentSelectedVariableId = null;
    
    alert(`Variable "${deletedVariableId}" deleted successfully.`);
  } catch (error) {
    console.error("Error deleting variable:", error);
    alert(`Error deleting variable: ${error.message}`);
  }
}

/**
 * Formats an error message to be more user-friendly by extracting key information
 */
function formatErrorMessage(error) {
  let message = error.message || "Unknown error occurred";
  
  // Check if there's context information
  if (error.context) {
    const contextStr = JSON.stringify(error.context, null, 2);
    message += "\n\nDetails:\n" + contextStr;
  }
  
  return message;
}

/**
 * Handles the save variable action
 */
function handleSaveVariable() {
  const env = validateEnvironments();
  if (!env) return;
  
  const { modelEnv, lang } = env;
  
  try {
    // Get form values
    const variableId = ui.editVarId.value.trim();
    const definitionXml = ui.editVarDefinition.value.trim();
    const dataType = ui.editVarDataType.value.trim();
    const unit = ui.editVarUnit.value.trim();
    
    // Validate required fields
    if (!variableId) {
      alert("Variable ID is required.");
      return;
    }
    
    if (!definitionXml) {
      alert("Variable definition is required.");
      return;
    }
    
    // Parse the definition XML
    let definition;
    try {
      definition = parseDefinitionXml(definitionXml);
    } catch (parseError) {
      alert(`Invalid definition XML:\n\n${parseError.message}\n\nPlease check your XML syntax and try again.`);
      console.error("Definition XML parse error:", parseError);
      return;
    }
    
    // Build variable data
    const variableData = {
      definition: definition
    };
    
    if (dataType) {
      variableData.dataType = dataType;
    }
    
    if (unit) {
      variableData.unit = unit;
    }
    
    let result;
    
    if (isCreatingNew) {
      // Create new variable
      variableData.id = variableId;
      try {
        result = createVariable(modelEnv.obj, variableData, lang);
        alert(`Variable "${variableId}" created successfully.`);
      } catch (createError) {
        // Format error message with context
        const errorMsg = formatErrorMessage(createError);
        alert(`Failed to create variable "${variableId}":\n\n${errorMsg}\n\nPlease fix the issue and try again.`);
        console.error("Create variable error:", createError);
        return;
      }
    } else {
      // Update existing variable
      try {
        result = updateVariable(modelEnv.obj, currentSelectedVariableId, variableData, lang);
        alert(`Variable "${currentSelectedVariableId}" updated successfully.`);
      } catch (updateError) {
        // Format error message with context
        const errorMsg = formatErrorMessage(updateError);
        alert(`Failed to update variable "${currentSelectedVariableId}":\n\n${errorMsg}\n\nPlease fix the issue and try again.`);
        console.error("Update variable error:", updateError);
        return;
      }
    }
        
    // Update the copy model in textarea
    const xml = serializeModel(result.obj);
    ui.modelText.value = xml.trim();
    validateModel(ui.modelText.value, "After updated variable",lang);
    
    // Refresh the variable dropdown
    renderVariableDropdown();
    
    // Hide the form
    hideEditForm();
    
    // Show details of the saved variable
    if (isCreatingNew) {
      currentSelectedVariableId = variableId;
      ui.variableDropdown.value = variableId;
      showVariableDetails(variableId);
    } else {
      showVariableDetails(currentSelectedVariableId);
    }
    
  } catch (error) {
    // Catch any unexpected errors
    console.error("Unexpected error saving variable:", error);
    const errorMsg = formatErrorMessage(error);
    alert(`An unexpected error occurred while saving:\n\n${errorMsg}\n\nThe form will remain open so you can fix the issue.`);
  }
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
  
  // New button handler
  ui.newVariableBtn.addEventListener('click', () => {
    showNewVariableForm();
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
  
  // Sort checkbox handler
  ui.sortVariablesAlpha.addEventListener('change', () => {
    renderVariableDropdown();
  });
  
  // Definition type dropdown handler
  ui.definitionTypeSelect.addEventListener('change', (event) => {
    const selectedType = event.target.value;
    populateDefinitionTemplate(selectedType);
  });
  
  // Listen for model loaded events to refresh the variable list
  window.addEventListener('modelLoaded', () => {
    renderVariableDropdown();
  });

  // Initial render (will show "Load a model..." message)
  renderVariableDropdown();
}
