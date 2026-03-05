// variableCrudApp.js (cleaned: single textarea containing full <variable> XML)

import { ui } from "../ui.js";
import { getModelEnv, validateModel } from "./modelApp.js";
import { getLanguageEnv } from "./languageApp.js";
import { setElementContent, escapeHtml } from "../utils/helpers.js";
import {
  listVariables,
  createVariable,
  updateVariable,
  deleteVariable
} from "../domain/variableCrud.js";
import { serializeModel, serializeVariable, parseVariableXml } from "../domain/serialize.js";

let currentSelectedVariableId = null;
let isCreatingNew = false;

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
    variables.forEach((variable) => {
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
    const variable = variables.find((v) => v.id === variableId);

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
      const dataType =
        typeof variable.dataType === "object" ? variable.dataType["#text"] : variable.dataType;
      features.push(`<strong>Type:</strong> ${escapeHtml(dataType)}`);
    }

    // Handle unit which might be an object with #text or a string
    if (variable.unit) {
      const unit = typeof variable.unit === "object" ? variable.unit["#text"] : variable.unit;
      features.push(`<strong>Unit:</strong> ${escapeHtml(unit)}`);
    }

    // Display definition preview (if present)
    const definitionPreview = getDefinitionPreview(variable.definition);
    features.push(`<strong>Definition:</strong> <code>${escapeHtml(definitionPreview)}</code>`);

    // Display arguments if present
    if (variable.arguments?.arg) {
      const argCount = Array.isArray(variable.arguments.arg) ? variable.arguments.arg.length : 1;
      features.push(`<strong>Arguments:</strong> ${argCount}`);
    }

    setElementContent(ui.selectedVariableFeatures, features.join("<br>"));

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

  if (definition["#text"]) {
    const text = definition["#text"].trim();
    return text.length > MAX_PREVIEW_LENGTH
      ? text.substring(0, MAX_PREVIEW_LENGTH - 3) + "..."
      : text;
  }

  if (definition.type) {
    return `[${definition.type}]`;
  }

  return "Complex definition";
}

/**
 * Shows the edit form for the selected variable
 * (Single textarea contains full <variable> XML)
 */
function showEditForm() {
  if (!currentSelectedVariableId) return;

  const modelEnv = getModelEnv();
  if (!modelEnv) return;

  try {
    const variables = listVariables(modelEnv.obj);
    const variable = variables.find((v) => v.id === currentSelectedVariableId);
    if (!variable) return;

    isCreatingNew = false;

    ui.variableFormTitle.textContent = "Edit Variable";
    ui.editVarDefinition.value = serializeVariable(variable);

    ui.variableFormSection.style.display = "block";
    ui.variableFormSection.scrollIntoView({ behavior: "smooth" });
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

  ui.variableFormTitle.textContent = "New Variable";

  // Starter template (edit as you like)
  ui.editVarDefinition.value = `<variable id="new_variable">
  <definition type="expression">0</definition>
</variable>`;

  ui.variableFormSection.style.display = "block";
  ui.variableFormSection.scrollIntoView({ behavior: "smooth" });
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
    const variable = variables.find((v) => v.id === currentSelectedVariableId);
    if (!variable) return;

    isCreatingNew = true;

    ui.variableFormTitle.textContent = "Copy Variable";

    // Serialize full variable then change id attribute in XML
    let xml = serializeVariable(variable);
    xml = xml.replace(
      /(<variable\b[^>]*\bid=")([^"]+)(")/,
      (m, p1, id, p3) => `${p1}${id}_copy${p3}`
    );

    ui.editVarDefinition.value = xml;

    ui.variableFormSection.style.display = "block";
    ui.variableFormSection.scrollIntoView({ behavior: "smooth" });
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
  ui.editVarDefinition.value = "";
}

/**
 * Handles the delete variable action
 */
function handleDeleteVariable() {
  if (!currentSelectedVariableId) return;

  const confirmed = confirm(
    `Are you sure you want to delete variable "${currentSelectedVariableId}"?`
  );
  if (!confirmed) return;

  const env = validateEnvironments();
  if (!env) return;

  const { modelEnv, lang } = env;
  const deletedVariableId = currentSelectedVariableId;

  try {
    const result = deleteVariable(modelEnv.obj, deletedVariableId, lang);

    // Update the copy model in textarea
    const xml = serializeModel(result.obj);
    validateModel(xml.trim(), "After delete", lang);
    ui.modelText.value = xml.trim();

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

  if (error.context) {
    const contextStr = JSON.stringify(error.context, null, 2);
    message += "\n\nDetails:\n" + contextStr;
  }

  return message;
}

/**
 * Handles the save variable action
 * (Parses full <variable> XML from textarea)
 */
function handleSaveVariable() {
  const env = validateEnvironments();
  if (!env) return;

  const { modelEnv, lang } = env;

  try {
    const variableXml = ui.editVarDefinition.value.trim();
    if (!variableXml) {
      alert("Variable XML is required.");
      return;
    }

    let variableData;
    try {
      variableData = parseVariableXml(variableXml);
    } catch (parseError) {
      alert(
        `Invalid variable XML:\n\n${parseError.message}\n\nPlease check your XML syntax and try again.`
      );
      console.error("Variable XML parse error:", parseError);
      return;
    }

    if (!variableData?.id) {
      alert('Variable XML must include an id attribute, e.g. <variable id="my_var">...');
      return;
    }

    const wasCreating = isCreatingNew;
    const savedId = variableData.id;

    let result;

    if (wasCreating) {
      try {
        result = createVariable(modelEnv.obj, variableData, lang);
        alert(`Variable "${savedId}" created successfully.`);
      } catch (createError) {
        const errorMsg = formatErrorMessage(createError);
        alert(
          `Failed to create variable "${savedId}":\n\n${errorMsg}\n\nPlease fix the issue and try again.`
        );
        console.error("Create variable error:", createError);
        return;
      }
    } else {
      try {
        result = updateVariable(modelEnv.obj, currentSelectedVariableId, variableData, lang);
        alert(`Variable "${currentSelectedVariableId}" updated successfully.`);
      } catch (updateError) {
        const errorMsg = formatErrorMessage(updateError);
        alert(
          `Failed to update variable "${currentSelectedVariableId}":\n\n${errorMsg}\n\nPlease fix the issue and try again.`
        );
        console.error("Update variable error:", updateError);
        return;
      }
    }

    // Update the copy model in textarea
    const xml = serializeModel(result.obj);
    validateModel(xml.trim(), "After updated variable", lang);
    ui.modelText.value = xml.trim();

    // Refresh the variable dropdown
    renderVariableDropdown();

    // Hide the form (this resets isCreatingNew)
    hideEditForm();

    // Select and show details
    currentSelectedVariableId = savedId;
    ui.variableDropdown.value = savedId;
    showVariableDetails(savedId);
  } catch (error) {
    console.error("Unexpected error saving variable:", error);
    const errorMsg = formatErrorMessage(error);
    alert(
      `An unexpected error occurred while saving:\n\n${errorMsg}\n\nThe form will remain open so you can fix the issue.`
    );
  }
}

/**
 * Wire up event handlers for variable CRUD operations
 */
export function wireVariableCrudHandlers() {
  ui.variableDropdown.addEventListener("change", (event) => {
    const selectedId = event.target.value;

    if (selectedId) {
      showVariableDetails(selectedId);
    } else {
      ui.variableDetails.style.display = "none";
      ui.variableFormSection.style.display = "none";
      currentSelectedVariableId = null;
    }
  });

  ui.newVariableBtn.addEventListener("click", () => showNewVariableForm());
  ui.editVariableBtn.addEventListener("click", () => showEditForm());
  ui.copyVariableBtn.addEventListener("click", () => showCopyVariableForm());
  ui.deleteVariableBtn.addEventListener("click", () => handleDeleteVariable());
  ui.saveVariableBtn.addEventListener("click", () => handleSaveVariable());
  ui.cancelEditBtn.addEventListener("click", () => hideEditForm());

  ui.sortVariablesAlpha.addEventListener("change", () => renderVariableDropdown());

  window.addEventListener("modelLoaded", () => renderVariableDropdown());

  renderVariableDropdown();
}
