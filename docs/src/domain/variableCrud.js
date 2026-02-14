import { validateModelCore } from "./model.js";
import { throwModelError, asArray } from "../utils/helpers.js";
import { serializeModel } from "./serialize.js";

/**
 * Creates a new variable in the model.
 * 
 * @param {Object} modelObj - The model object (from validateModelCore result)
 * @param {Object} variableData - The variable data to create
 * @param {string} variableData.id - The variable identifier (required)
 * @param {Object} variableData.definition - The variable definition (required)
 * @param {string} variableData.definition.type - Definition type (expression, constant, table, etc.)
 * @param {string} [variableData.definition['#text']] - The formula/expression text
 * @param {string} [variableData.dataType] - Optional data type (real, integer, boolean, string)
 * @param {string} [variableData.unit] - Optional unit
 * @param {Object} [variableData.arguments] - Optional arguments for parameterized variables
 * @param {Object} lang - The language environment for validation
 * @returns {Object} Updated model validation result
 * @throws {Error} If variable ID already exists or if model becomes invalid
 */
export function createVariable(modelObj, variableData, lang) {
  // Validate required fields
  if (!variableData || !variableData.id) {
    throw new Error("Variable ID is required");
  }

  if (!variableData.definition) {
    throw new Error("Variable definition is required");
  }

  // Validate the variable ID format
  validateVariableId(variableData.id);

  // Check if variable with this ID already exists (case-insensitive)
  const existingVariable = readVariable(modelObj, variableData.id);
  if (existingVariable) {
    throw new Error(`Variable with ID '${variableData.id}' already exists`);
  }

  // Create a deep copy of the model object to avoid mutating the original
  const updatedModel = JSON.parse(JSON.stringify(modelObj));

  // Ensure variables structure exists
  if (!updatedModel.model.variables) {
    updatedModel.model.variables = {};
  }

  // Build the new variable object
  const newVariable = {
    id: variableData.id,
    definition: variableData.definition
  };

  // Add optional properties if provided
  if (variableData.dataType) {
    newVariable.dataType = variableData.dataType;
  }
  if (variableData.unit) {
    newVariable.unit = variableData.unit;
  }
  if (variableData.arguments) {
    newVariable.arguments = variableData.arguments;
  }

  // Add the variable to the model's variables
  if (!updatedModel.model.variables.variable) {
    // No variables exist yet, create as single object
    updatedModel.model.variables.variable = newVariable;
  } else if (Array.isArray(updatedModel.model.variables.variable)) {
    // Multiple variables exist, add to array
    updatedModel.model.variables.variable.push(newVariable);
  } else {
    // Single variable exists, convert to array
    updatedModel.model.variables.variable = [
      updatedModel.model.variables.variable,
      newVariable
    ];
  }

  // Serialize the updated model and validate it
  const serializedModel = serializeModel(updatedModel);
  const validatedResult = validateModelCore(serializedModel, "updated-model.xml", lang);

  return validatedResult;
}

/**
 * Reads a variable from the model by its ID.
 * 
 * @param {Object} modelObj - The model object (from validateModelCore result)
 * @param {string} variableId - The variable identifier
 * @returns {Object|null} The variable object if found, null otherwise
 */
export function readVariable(modelObj, variableId) {
  // Return null for empty or invalid variable ID
  if (!variableId || variableId.trim() === "") {
    return null;
  }

  // Check if model has variables
  if (!modelObj || !modelObj.model || !modelObj.model.variables) {
    return null;
  }

  const variables = modelObj.model.variables.variable;
  
  if (!variables) {
    return null;
  }

  // Normalize the search ID to uppercase for case-insensitive comparison
  const searchId = variableId.toUpperCase();

  // Handle both single variable (object) and multiple variables (array)
  if (Array.isArray(variables)) {
    return variables.find(v => v.id.toUpperCase() === searchId) || null;
  }
  
  // Single variable case
  return variables.id.toUpperCase() === searchId ? variables : null;
}

/**
 * Updates an existing variable in the model.
 * 
 * @param {Object} modelObj - The model object (from validateModelCore result)
 * @param {string} variableId - The identifier of the variable to update
 * @param {Object} variableData - The new variable data (partial update supported)
 * @param {Object} [variableData.definition] - Updated definition
 * @param {string} [variableData.dataType] - Updated data type
 * @param {string} [variableData.unit] - Updated unit
 * @param {Object} [variableData.arguments] - Updated arguments
 * @param {Object} lang - The language environment for validation
 * @returns {Object} Updated model validation result
 * @throws {Error} If variable not found or if model becomes invalid after update
 */
export function updateVariable(modelObj, variableId, variableData, lang) {
  // Find the variable by ID (case-insensitive)
  const existingVariable = readVariable(modelObj, variableId);
  
  if (!existingVariable) {
    throw new Error(`Variable with ID '${variableId}' not found`);
  }

  // Create a deep copy of the model object to avoid mutating the original
  const updatedModel = JSON.parse(JSON.stringify(modelObj));

  // Find the variable in the copied model
  const variables = updatedModel.model.variables.variable;
  const searchId = variableId.toUpperCase();
  
  let variableToUpdate;
  if (Array.isArray(variables)) {
    variableToUpdate = variables.find(v => v.id.toUpperCase() === searchId);
  } else {
    variableToUpdate = variables;
  }

  // Update the variable properties (partial update)
  if (variableData.definition !== undefined) {
    variableToUpdate.definition = variableData.definition;
  }
  if (variableData.dataType !== undefined) {
    variableToUpdate.dataType = variableData.dataType;
  }
  if (variableData.unit !== undefined) {
    variableToUpdate.unit = variableData.unit;
  }
  if (variableData.arguments !== undefined) {
    variableToUpdate.arguments = variableData.arguments;
  }

  // Serialize the updated model and validate it
  const serializedModel = serializeModel(updatedModel);
  const validatedResult = validateModelCore(serializedModel, "updated-model.xml", lang);

  return validatedResult;
}

/**
 * Deletes a variable from the model.
 * 
 * @param {Object} modelObj - The model object (from validateModelCore result)
 * @param {string} variableId - The identifier of the variable to delete
 * @param {Object} lang - The language environment for validation
 * @returns {Object} Updated model validation result
 * @throws {Error} If variable not found or if model becomes invalid after deletion
 */
export function deleteVariable(modelObj, variableId, lang) {
  // Find the variable by ID (case-insensitive)
  const existingVariable = readVariable(modelObj, variableId);
  
  if (!existingVariable) {
    throw new Error(`Variable with ID '${variableId}' not found`);
  }

  const searchId = variableId.toUpperCase();
  
  // First, validate the current model to get its features
  const serializedCurrentModel = serializeModel(modelObj);
  const currentModelValidation = validateModelCore(serializedCurrentModel, "current-model.xml", lang);
  
  // Check if this variable is referenced by other variables
  if (currentModelValidation.features && currentModelValidation.features.outgoing) {
    const outgoingDeps = currentModelValidation.features.outgoing.get(searchId);
    
    if (outgoingDeps && outgoingDeps.size > 0) {
      // Variable is referenced by other variables, build error message
      const dependentVariables = Array.from(outgoingDeps).map(dep => dep.name);
      const exampleVars = dependentVariables.slice(0, 3).join(", ");
      const moreCount = dependentVariables.length > 3 ? ` and ${dependentVariables.length - 3} more` : "";
      
      throw new Error(`Unable to delete variable '${variableId}' as it is referred to by another variable, e.g. ${exampleVars}${moreCount}`);
    }
  }

  // Create a deep copy of the model object to avoid mutating the original
  const updatedModel = JSON.parse(JSON.stringify(modelObj));

  // Find and remove the variable from the copied model
  const variables = updatedModel.model.variables.variable;
  
  if (Array.isArray(variables)) {
    // Multiple variables - filter out the one to delete
    const filteredVariables = variables.filter(v => v.id.toUpperCase() !== searchId);
    
    if (filteredVariables.length === 0) {
      // No variables left
      delete updatedModel.model.variables.variable;
    } else if (filteredVariables.length === 1) {
      // Only one variable left - convert back to single object
      updatedModel.model.variables.variable = filteredVariables[0];
    } else {
      // Multiple variables remain
      updatedModel.model.variables.variable = filteredVariables;
    }
  } else {
    // Single variable - delete the entire variable property
    delete updatedModel.model.variables.variable;
  }

  // Serialize the updated model and validate it
  const serializedModel = serializeModel(updatedModel);
  const validatedResult = validateModelCore(serializedModel, "updated-model.xml", lang);

  return validatedResult;
}

/**
 * Validates that a variable ID is valid (not empty, no special characters).
 * 
 * @param {string} id - The variable ID to validate
 * @returns {boolean} True if valid
 * @throws {Error} If ID is invalid
 */
export function validateVariableId(id) {
  // Check if ID is not empty
  if (!id || id.trim() === "") {
    throw new Error("Variable ID is required and cannot be empty");
  }

  // Check if ID contains only valid characters (alphanumeric and underscore) and starts with letter or underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    // Provide more specific error message
    if (!/^[a-zA-Z_]/.test(id)) {
      throw new Error("Variable ID is invalid: must start with letter or underscore");
    }
    throw new Error("Variable ID contains invalid characters. Only alphanumeric characters and underscores are allowed.");
  }

  return true;
}

/**
 * Lists all variables in the model.
 * 
 * @param {Object} modelObj - The model object (from validateModelCore result)
 * @returns {Array} Array of variable objects
 */
export function listVariables(modelObj) {
  if (!modelObj || !modelObj.model) {
    return [];
  }

  // Try standard format first
  if (modelObj.model.variables) {
    const variables = modelObj.model.variables.variable;
    
    if (variables) {
      // Handle both single variable (object) and multiple variables (array)
      if (Array.isArray(variables)) {
        return variables;
      }
      
      // Single variable case
      return [variables];
    }
  }

  // ------------------------------------------------------
  // FALLBACK: Legacy style
  // ------------------------------------------------------
  if (modelObj.model.ModelPointFields || modelObj.model.Formulas) {
    const variablesArray = [];
    
    // Add variables from ModelPointFields
    for (const v of asArray(modelObj.model.ModelPointFields?.VariableDefinition)) {
      if (v.Name) {
        variablesArray.push({
          id: v.Name.toUpperCase(),
          definition: { type: "expression", "#text": v.Formula || "" }
        });
      }
    }
    
    // Add variables from Formulas
    for (const v of asArray(modelObj.model.Formulas?.VariableDefinition)) {
      if (v.Name) {
        variablesArray.push({
          id: v.Name.toUpperCase(),
          definition: { type: "expression", "#text": v.Formula || "" }
        });
      }
    }
    
    return variablesArray;
  }

  return [];
}

/**
 * Copies a variable to a new variable with a different ID.
 * 
 * @param {Object} modelObj - The model object (from validateModelCore result)
 * @param {string} sourceVariableId - The identifier of the variable to copy
 * @param {string} newVariableId - The identifier for the new variable
 * @param {Object} lang - The language environment for validation
 * @returns {Object} Updated model validation result
 * @throws {Error} If source variable not found, new ID already exists, or if model becomes invalid
 */
export function copyVariable(modelObj, sourceVariableId, newVariableId, lang) {
  // Find the source variable
  const sourceVariable = readVariable(modelObj, sourceVariableId);
  
  if (!sourceVariable) {
    throw new Error(`Source variable with ID '${sourceVariableId}' not found`);
  }

  // Validate the new variable ID
  validateVariableId(newVariableId);

  // Check if the new variable ID already exists
  const existingVariable = readVariable(modelObj, newVariableId);
  if (existingVariable) {
    throw new Error(`Variable with ID '${newVariableId}' already exists`);
  }

  // Create a copy of the variable data
  const copiedVariableData = {
    id: newVariableId,
    definition: JSON.parse(JSON.stringify(sourceVariable.definition))
  };

  // Copy optional properties if they exist
  if (sourceVariable.dataType) {
    copiedVariableData.dataType = sourceVariable.dataType;
  }
  if (sourceVariable.unit) {
    copiedVariableData.unit = sourceVariable.unit;
  }
  if (sourceVariable.arguments) {
    copiedVariableData.arguments = JSON.parse(JSON.stringify(sourceVariable.arguments));
  }

  // Use createVariable to add the copied variable
  return createVariable(modelObj, copiedVariableData, lang);
}
