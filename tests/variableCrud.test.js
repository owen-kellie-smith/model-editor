import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import { loadXml } from "./helpers/xml.js";
import { getFixture } from "./helpers/fixtures.ts";
import { validateModelCore } from "@/domain/model.js";
import { getFunctionsFromLanguage } from "@/domain/language.js";
import { serializeModel } from "@/domain/serialize.js";
import {
  createVariable,
  readVariable,
  updateVariable,
  deleteVariable,
  validateVariableId,
  listVariables
} from "@/domain/variableCrud.js";

describe("Variable CRUD Operations", () => {
  let lang;
  let baseModel;

  beforeAll(() => {
    const fixture = getFixture("language.xml");
    const xml = loadXml(fixture);
    lang = getFunctionsFromLanguage(xml, "test");

    // Load a base model to work with
    const modelText = fs.readFileSync(getFixture("model.xml"), "utf-8");
    const result = validateModelCore(modelText, "model.xml", lang);
    baseModel = result.obj;
  });

  describe("createVariable", () => {
    it("should create a new variable with valid data", () => {
      const variableData = {
        id: "test_variable",
        definition: {
          type: "expression",
          "#text": "1 + 1"
        },
        dataType: "real"
      };

      const result = createVariable(baseModel, variableData, lang);
      
      expect(result).toBeDefined();
      expect(result.features.variables).toContain("TEST_VARIABLE");
    });

    it("should create a variable with constant definition", () => {
      const variableData = {
        id: "my_constant",
        definition: {
          type: "constant",
          "#text": "42"
        }
      };

      const result = createVariable(baseModel, variableData, lang);
      
      expect(result).toBeDefined();
      expect(result.features.variables).toContain("MY_CONSTANT");
    });

    it("should throw error when variable ID already exists", () => {
      const variableData = {
        id: "step_length", // This variable already exists in the base model
        definition: {
          type: "expression",
          "#text": "2"
        }
      };

      expect(() => {
        createVariable(baseModel, variableData, lang);
      }).toThrow(/already exists|duplicate/i);
    });

    it("should throw error when variable ID already exists (case-insensitive)", () => {
      const variableData = {
        id: "STEP_LENGTH", // Same as step_length but uppercase
        definition: {
          type: "expression",
          "#text": "2"
        }
      };

      expect(() => {
        createVariable(baseModel, variableData, lang);
      }).toThrow(/already exists|duplicate/i);
    });

    it("should throw error when variable references undefined variable", () => {
      const variableData = {
        id: "invalid_variable",
        definition: {
          type: "expression",
          "#text": "undefined_var + 1"
        }
      };

      expect(() => {
        createVariable(baseModel, variableData, lang);
      }).toThrow(/missing reference|undefined/i);
    });

    it("should throw error when variable definition is missing", () => {
      const variableData = {
        id: "no_definition_var"
      };

      expect(() => {
        createVariable(baseModel, variableData, lang);
      }).toThrow();
    });

    it("should create variable that references existing variables", () => {
      const variableData = {
        id: "derived_variable",
        definition: {
          type: "expression",
          "#text": "step_length * 2"
        }
      };

      const result = createVariable(baseModel, variableData, lang);
      
      expect(result).toBeDefined();
      expect(result.features.variables).toContain("DERIVED_VARIABLE");
      
      // Check that incoming relationships are tracked
      const incoming = result.features.incoming.get("DERIVED_VARIABLE");
      expect(incoming).toBeDefined();
      expect([...incoming].some(v => v.name === "STEP_LENGTH")).toBe(true);
    });
  });

  describe("readVariable", () => {
    it("should read an existing variable", () => {
      const variable = readVariable(baseModel, "step_length");
      
      expect(variable).toBeDefined();
      expect(variable.id.toUpperCase()).toBe("STEP_LENGTH");
      expect(variable.definition).toBeDefined();
    });

    it("should read variable case-insensitively", () => {
      const variable1 = readVariable(baseModel, "step_length");
      const variable2 = readVariable(baseModel, "STEP_LENGTH");
      const variable3 = readVariable(baseModel, "Step_Length");
      
      expect(variable1).toBeDefined();
      expect(variable2).toBeDefined();
      expect(variable3).toBeDefined();
      expect(variable1.id.toUpperCase()).toBe(variable2.id.toUpperCase());
      expect(variable2.id.toUpperCase()).toBe(variable3.id.toUpperCase());
    });

    it("should return null for non-existent variable", () => {
      const variable = readVariable(baseModel, "non_existent_variable");
      
      expect(variable).toBeNull();
    });

    it("should return null for empty variable ID", () => {
      const variable = readVariable(baseModel, "");
      
      expect(variable).toBeNull();
    });
  });

  describe("updateVariable", () => {
    it("should update variable definition", () => {
      const updatedData = {
        definition: {
          type: "constant",
          "#text": "1 / 6"
        }
      };

      const result = updateVariable(baseModel, "step_length", updatedData, lang);
      
      expect(result).toBeDefined();
      const updatedVar = readVariable(result.obj, "step_length");
      expect(updatedVar.definition["#text"]).toBe("1 / 6");
    });

    it("should update variable data type", () => {
      const updatedData = {
        dataType: "integer"
      };

      const result = updateVariable(baseModel, "step_length", updatedData, lang);
      
      expect(result).toBeDefined();
      const updatedVar = readVariable(result.obj, "step_length");
      expect(updatedVar.dataType).toBe("integer");
    });

    it("should update variable unit", () => {
      const updatedData = {
        unit: "months"
      };

      const result = updateVariable(baseModel, "step_length", updatedData, lang);
      
      expect(result).toBeDefined();
      const updatedVar = readVariable(result.obj, "step_length");
      expect(updatedVar.unit).toBe("months");
    });

    it("should throw error when variable not found", () => {
      const updatedData = {
        definition: {
          type: "constant",
          "#text": "99"
        }
      };

      expect(() => {
        updateVariable(baseModel, "non_existent", updatedData, lang);
      }).toThrow(/not found/i);
    });

    it("should throw error when update makes model invalid", () => {
      const updatedData = {
        definition: {
          type: "expression",
          "#text": "undefined_variable + 1"
        }
      };

      expect(() => {
        updateVariable(baseModel, "step_length", updatedData, lang);
      }).toThrow(/missing reference|undefined/i);
    });

    it("should throw error when update creates circular dependency", () => {
      // First, we need to update a variable to reference another that would create a cycle
      // For example, if A depends on B, and we update B to depend on A
      const updatedData = {
        definition: {
          type: "expression",
          "#text": "attained_age(cohort, step)"
        }
      };

      expect(() => {
        updateVariable(baseModel, "current_age", updatedData, lang);
      }).toThrow(/circular|cycle/i);
    });

    it("should allow partial updates", () => {
      const updatedData = {
        unit: "days"
      };

      const result = updateVariable(baseModel, "step_length", updatedData, lang);
      
      expect(result).toBeDefined();
      const updatedVar = readVariable(result.obj, "step_length");
      expect(updatedVar.unit).toBe("days");
      // Definition should remain unchanged
      expect(updatedVar.definition).toBeDefined();
      expect(updatedVar.definition.type).toBe("constant");
    });
  });

  describe("deleteVariable", () => {
    it("should delete a variable that is not referenced", () => {
      // discounted_cashflow is likely at the end of the dependency chain
      const result = deleteVariable(baseModel, "discounted_cashflow", lang);
      
      expect(result).toBeDefined();
      expect(result.features.variables).not.toContain("DISCOUNTED_CASHFLOW");
    });

    it("should throw error when deleting variable that others depend on", () => {
      // step_length is used by many other variables
      expect(() => {
        deleteVariable(baseModel, "step_length", lang);
      }).toThrow(/unable to delete|referred to by another variable/i);
    });

    it("should throw error when variable not found", () => {
      expect(() => {
        deleteVariable(baseModel, "non_existent", lang);
      }).toThrow(/not found/i);
    });

    it("should delete variable case-insensitively", () => {
      const result = deleteVariable(baseModel, "DISCOUNTED_CASHFLOW", lang);
      
      expect(result).toBeDefined();
      expect(result.features.variables).not.toContain("DISCOUNTED_CASHFLOW");
    });

    it("should update incoming/outgoing relationships after deletion", () => {
      // Delete a variable and verify relationships are updated
      const result = deleteVariable(baseModel, "discounted_cashflow", lang);
      
      // discounted_cashflow should not appear in any incoming/outgoing maps
      for (const [varName, incoming] of result.features.incoming) {
        const hasRef = [...incoming].some(v => v.name === "DISCOUNTED_CASHFLOW");
        expect(hasRef).toBe(false);
      }
      
      for (const [varName, outgoing] of result.features.outgoing) {
        const hasRef = [...outgoing].some(v => v.name === "DISCOUNTED_CASHFLOW");
        expect(hasRef).toBe(false);
      }
    });
  });

  describe("validateVariableId", () => {
    it("should accept valid variable IDs", () => {
      expect(() => validateVariableId("my_variable")).not.toThrow();
      expect(() => validateVariableId("MyVariable")).not.toThrow();
      expect(() => validateVariableId("my_variable_123")).not.toThrow();
      expect(() => validateVariableId("_private_var")).not.toThrow();
    });

    it("should reject empty variable ID", () => {
      expect(() => validateVariableId("")).toThrow(/empty|required/i);
    });

    it("should reject variable ID with spaces", () => {
      expect(() => validateVariableId("my variable")).toThrow(/invalid|special characters/i);
    });

    it("should reject variable ID with special characters", () => {
      expect(() => validateVariableId("my-variable")).toThrow(/invalid|special characters/i);
      expect(() => validateVariableId("my.variable")).toThrow(/invalid|special characters/i);
      expect(() => validateVariableId("my@variable")).toThrow(/invalid|special characters/i);
    });

    it("should reject variable ID starting with number", () => {
      expect(() => validateVariableId("123variable")).toThrow(/invalid|must start with letter/i);
    });
  });

  describe("listVariables", () => {
    it("should return all variables in the model", () => {
      const variables = listVariables(baseModel);
      
      expect(Array.isArray(variables)).toBe(true);
      expect(variables.length).toBeGreaterThan(0);
      
      // Check that known variables are present
      const variableIds = variables.map(v => v.id.toUpperCase());
      expect(variableIds).toContain("STEP_LENGTH");
      expect(variableIds).toContain("ANNUAL_ANNUITY_AMOUNT");
      expect(variableIds).toContain("CASHFLOW");
    });

    it("should return empty array when model has no variables", () => {
      const emptyModel = {
        model: {
          variables: {}
        }
      };
      
      const variables = listVariables(emptyModel);
      
      expect(Array.isArray(variables)).toBe(true);
      expect(variables.length).toBe(0);
    });

    it("should return variables with all their properties", () => {
      const variables = listVariables(baseModel);
      
      const stepLength = variables.find(v => v.id.toUpperCase() === "STEP_LENGTH");
      expect(stepLength).toBeDefined();
      expect(stepLength.definition).toBeDefined();
      expect(stepLength.definition.type).toBeDefined();
    });
  });

  describe("Integration: Create, Read, Update, Delete workflow", () => {
    it("should support full CRUD workflow", () => {
      // Create
      const newVar = {
        id: "workflow_test",
        definition: {
          type: "constant",
          "#text": "100"
        },
        dataType: "real"
      };
      
      let result = createVariable(baseModel, newVar, lang);
      expect(result.features.variables).toContain("WORKFLOW_TEST");
      
      // Read
      let variable = readVariable(result.obj, "workflow_test");
      expect(variable).toBeDefined();
      expect(variable.definition["#text"]).toBe("100");
      
      // Update
      const updateData = {
        definition: {
          type: "constant",
          "#text": "200"
        }
      };
      result = updateVariable(result.obj, "workflow_test", updateData, lang);
      variable = readVariable(result.obj, "workflow_test");
      expect(variable.definition["#text"]).toBe("200");
      
      // Delete
      result = deleteVariable(result.obj, "workflow_test", lang);
      expect(result.features.variables).not.toContain("WORKFLOW_TEST");
      variable = readVariable(result.obj, "workflow_test");
      expect(variable).toBeNull();
    });
  });

  describe("Model validation after CRUD operations", () => {
    it("should maintain valid model state after create", () => {
      const newVar = {
        id: "new_test_var",
        definition: {
          type: "expression",
          "#text": "step_length + 1"
        }
      };
      
      const result = createVariable(baseModel, newVar, lang);
      
      // Model should have all required features
      expect(result.features).toBeDefined();
      expect(result.features.variables).toBeDefined();
      expect(result.features.incoming).toBeDefined();
      expect(result.features.outgoing).toBeDefined();
      
      // No circular dependencies
      expect(() => {
        validateModelCore(serializeModel(result.obj), "test.xml", lang);
      }).not.toThrow(/circular/i);
    });

    it("should maintain valid model state after update", () => {
      const updateData = {
        definition: {
          type: "constant",
          "#text": "2 / 12"
        }
      };
      
      const result = updateVariable(baseModel, "step_length", updateData, lang);
      
      // Should be able to serialize and re-validate
      const serialized = serializeModel(result.obj);
      expect(() => {
        validateModelCore(serialized, "test.xml", lang);
      }).not.toThrow();
    });

    it("should maintain valid model state after delete", () => {
      const result = deleteVariable(baseModel, "discounted_cashflow", lang);
      
      // Should be able to serialize and re-validate
      const serialized = serializeModel(result.obj);
      expect(() => {
        validateModelCore(serialized, "test.xml", lang);
      }).not.toThrow();
    });
  });

  describe("Save button functionality - invalid definitions", () => {
    it("should fail to save variable with circular definition", () => {
      // Try to update a variable to create a circular dependency
      const updatedData = {
        definition: {
          type: "expression",
          "#text": "attained_age(cohort, step)"
        }
      };

      // current_age depends on attained_age, so making attained_age depend on current_age creates a cycle
      expect(() => {
        updateVariable(baseModel, "current_age", updatedData, lang);
      }).toThrow(/circular|cycle/i);
    });

    it("should fail to save variable with unknown function", () => {
      const updatedData = {
        definition: {
          type: "expression",
          "#text": "unknown_function(step_length)"
        }
      };

      expect(() => {
        updateVariable(baseModel, "step_length", updatedData, lang);
      }).toThrow(/unknown function|not defined|missing/i);
    });

    it("should fail to save variable with undefined variable reference", () => {
      const updatedData = {
        definition: {
          type: "expression",
          "#text": "undefined_variable + 1"
        }
      };

      expect(() => {
        updateVariable(baseModel, "step_length", updatedData, lang);
      }).toThrow(/missing reference|undefined/i);
    });

    it("should fail to save new variable with circular definition", () => {
      // Create a variable that references itself
      const variableData = {
        id: "circular_var",
        definition: {
          type: "expression",
          "#text": "circular_var + 1"
        }
      };

      expect(() => {
        createVariable(baseModel, variableData, lang);
      }).toThrow(/circular|cycle|missing reference/i);
    });
  });

  describe("Copy button functionality", () => {
    it("should copy a variable with a new ID", () => {
      const originalVariable = readVariable(baseModel, "step_length");
      expect(originalVariable).toBeDefined();

      // Copy the variable with a new ID
      const copiedVariableData = {
        id: "step_length_copy",
        definition: originalVariable.definition,
        dataType: originalVariable.dataType,
        unit: originalVariable.unit
      };

      const result = createVariable(baseModel, copiedVariableData, lang);
      
      expect(result).toBeDefined();
      expect(result.features.variables).toContain("STEP_LENGTH_COPY");
      
      // Verify both variables exist
      const original = readVariable(result.obj, "step_length");
      const copied = readVariable(result.obj, "step_length_copy");
      
      expect(original).toBeDefined();
      expect(copied).toBeDefined();
      
      // Verify the definition is the same
      expect(copied.definition).toEqual(original.definition);
    });

    it("should copy a variable and allow modifications", () => {
      const originalVariable = readVariable(baseModel, "step_length");

      // Copy with modifications
      const copiedVariableData = {
        id: "modified_copy",
        definition: {
          type: "expression",
          "#text": "step_length * 2"
        },
        dataType: originalVariable.dataType
      };

      const result = createVariable(baseModel, copiedVariableData, lang);
      
      expect(result).toBeDefined();
      expect(result.features.variables).toContain("MODIFIED_COPY");
      
      const copied = readVariable(result.obj, "modified_copy");
      expect(copied.definition["#text"]).toBe("step_length * 2");
    });

    it("should fail to copy with existing ID", () => {
      const originalVariable = readVariable(baseModel, "step_length");

      // Try to copy with an existing ID
      const copiedVariableData = {
        id: "step_length", // Same ID as original
        definition: originalVariable.definition
      };

      expect(() => {
        createVariable(baseModel, copiedVariableData, lang);
      }).toThrow(/already exists/i);
    });
  });

  describe("Delete button confirmation functionality", () => {
    it("should successfully delete a variable when confirmed", () => {
      // Verify variable exists before deletion
      const variableBefore = readVariable(baseModel, "discounted_cashflow");
      expect(variableBefore).toBeDefined();

      // Delete the variable (simulating OK button click)
      const result = deleteVariable(baseModel, "discounted_cashflow", lang);
      
      expect(result).toBeDefined();
      expect(result.features.variables).not.toContain("DISCOUNTED_CASHFLOW");
      
      // Verify variable no longer exists
      const variableAfter = readVariable(result.obj, "discounted_cashflow");
      expect(variableAfter).toBeNull();
    });

    it("should validate model after deletion", () => {
      // Delete a variable and ensure model is still valid
      const result = deleteVariable(baseModel, "discounted_cashflow", lang);
      
      // Model should be valid after deletion
      const serialized = serializeModel(result.obj);
      expect(() => {
        validateModelCore(serialized, "test.xml", lang);
      }).not.toThrow();
    });

    it("should fail to delete variable that other variables depend on", () => {
      // step_length is used by many other variables
      expect(() => {
        deleteVariable(baseModel, "step_length", lang);
      }).toThrow(/unable to delete|referred to by another variable/i);
    });

    it("should handle deletion of non-existent variable", () => {
      expect(() => {
        deleteVariable(baseModel, "non_existent_variable", lang);
      }).toThrow(/not found/i);
    });
  });

  describe("listVariables with ModelMaker format", () => {
    it("should list variables when loading ModelMaker format (toyMM_L1.xml)", () => {
      // Load the ModelMaker format model
      const modelText = fs.readFileSync(getFixture("toyMM_L1.xml"), "utf-8");
      const result = validateModelCore(modelText, "toyMM_L1.xml", lang);
      
      // This should list variables even though the XML structure is different
      const variables = listVariables(result.obj);
      
      expect(Array.isArray(variables)).toBe(true);
      expect(variables.length).toBeGreaterThan(0);
      
      // Check that known variables from toyMM_L1.xml are present
      const variableIds = variables.map(v => v.id.toUpperCase());
      expect(variableIds).toContain("ANNUAL_ANNUITY_AMOUNT");
      expect(variableIds).toContain("CASHFLOW");
      expect(variableIds).toContain("DISCOUNT_FACTOR");
    });
    
    it("should match variables available in model features", () => {
      // Load the ModelMaker format model
      const modelText = fs.readFileSync(getFixture("toyMM_L1.xml"), "utf-8");
      const result = validateModelCore(modelText, "toyMM_L1.xml", lang);
      
      // Get variables from listVariables
      const listedVariables = listVariables(result.obj);
      const listedVarNames = new Set(
        listedVariables.map(v => v.id.toUpperCase())
      );
      
      // Get variables from model features (used by graph dropdown)
      const featuredVarNames = new Set(result.features.variables);
      
      // These should match - both should have the same variables
      expect(listedVarNames.size).toBe(featuredVarNames.size);
      
      // Every variable in features should be in the list
      for (const varName of featuredVarNames) {
        expect(listedVarNames.has(varName)).toBe(true);
      }
    });
  });
});
