import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'

describe('modelApp', () => {
  describe('updateModelTextareaAndDate', () => {
    it('should be exported and callable when CRUD operations are implemented', async () => {
      // Setup DOM with ALL elements required by ui.js
      // This must happen BEFORE importing the module so ui.js can find the elements
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <!-- Language elements -->
            <input type="file" id="loadLanguageFile">
            <button id="loadLanguageText">Load Language</button>
            <span id="languageLoaded"></span>
            <span id="languageDirty"></span>
            <textarea id="languageText"></textarea>
            <div id="languageStatus"></div>
            <button id="downloadLanguage">Download Language</button>
            
            <!-- Model elements -->
            <input type="file" id="loadModelFile">
            <button id="loadModelText">Load Model</button>
            <span id="modelLoaded"></span>
            <span id="modelDirty"></span>
            <textarea id="modelText"></textarea>
            <div id="modelStatus"></div>
            <button id="downloadModel">Download Model</button>
            <div id="log"></div>
            
            <!-- Graph elements -->
            <select id="graphVariable"></select>
            <input type="checkbox" id="graphSortAlphabetically">
            <input type="number" id="graphDepth">
            <input type="checkbox" id="graphFitToScreen">
            <button id="downloadSvg">Download SVG</button>
            <button id="downloadPng">Download PNG</button>
            <div id="graphSvg"></div>
            <textarea id="graphDot"></textarea>
            
            <!-- Variable CRUD elements -->
            <select id="variableDropdown"></select>
            <div id="variableDetails"></div>
            <span id="selectedVariableName"></span>
            <div id="selectedVariableFeatures"></div>
            <button id="editVariableBtn">Edit</button>
            <button id="copyVariableBtn">Copy</button>
            <button id="deleteVariableBtn">Delete</button>
            <button id="newVariableBtn">New</button>
            <div id="variableFormSection"></div>
            <h3 id="variableFormTitle"></h3>
            <input type="text" id="editVarId">
            <textarea id="editVarDefinition"></textarea>
            <input type="text" id="editVarDataType">
            <input type="text" id="editVarUnit">
            <button id="saveVariableBtn">Save</button>
            <button id="cancelEditBtn">Cancel</button>
            <input type="checkbox" id="sortVariablesAlpha">
            <input type="checkbox" id="sortGraphVariablesAlpha">
          </body>
        </html>
      `)
      
      global.document = dom.window.document
      global.window = dom.window
      
      // Import the module - this will execute ui.js which needs the DOM
      const { updateModelTextareaAndDate } = await import('../docs/src/applications/modelApp.js')
      
      // Verify the function exists and is callable
      expect(updateModelTextareaAndDate).toBeDefined()
      expect(typeof updateModelTextareaAndDate).toBe('function')
      
      // Call it (will warn since no model is loaded, but shouldn't throw)
      expect(() => updateModelTextareaAndDate()).not.toThrow()
    })
  })
})
