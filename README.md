# model-editor

![Tests](https://github.com/owen-kellie-smith/model-editor/actions/workflows/tests.yml/badge.svg)

A single web page for parsing, validating, and editing declarative models stored in XML with built-in constraints to preserve model validity.

**Live demo:** https://owen-kellie-smith.github.io/model-editor/

---

## Demo (35s)

[![Demo](demo.gif)](overview_final.mp4)


---

## How to run

1. Clone or download the repository
2. In the docs folder, serve locally:

```bash
python3 -m http.server 8080
```
then visit http://localhost:8080

3. Load or paste a `language.xml` (e.g. from the Example link) which lists functions (reserved words) in your modelling language.
4. Load or paste a `model.xml` (e.g. from the [examples folder](docs/examples))
5. Inspect Sample Evaluation which is a rendering of the model with sample inputs made up by the editor. 
6. Inspect the Graph of variable dependencies.
7. Edit variables (individually or in the main Model textarea) and see how your edits change the Sample Evaluation etc.
8. Export as spreadsheet (which adds sample inputs that you can change in your spreadsheet editor).
9. Export as Python.  Run the Python script as 
```bash
python3 model.py
```
and inspect its model_output.csv.  See what command line arguments are available in the Python script 
```bash
python3 model.py --help
```
E.g. you can plot a graph of the Python output. See [e.g. the Lorenz equation example](docs/examples/rocket-model))



---

## File Format Support

### What files can you read with the model-editor?

The model-editor reads **XML files only**:
- **Language files** (`language.xml`) - Define available functions and their arities
- **Model files** (`model.xml`) - Define variables, their relationships, and calculations

### What files can you write with the model-editor?

You can export:
- **XML files** (`.xml`) - Export language and model definitions
- **Excel spreadsheets** (`.xlsx`) - Render models as calculation-ready spreadsheets with multiple sheets, formulas, and sample data
- **Python scripts** (`.py`) - Render models as calculation-ready scripts which output a `.csv` file
- **SVG/PNG files** - Download dependency graphs as images

### Can the model-editor read spreadsheet files or Python scripts?

**No.** The "Render model" features are **one-way** 

---

## Technology Stack

- **JavaScript:** ES6+ modules running directly in the browser 
- **DOM Manipulation:** Vanilla JavaScript (no framework)
- **XML Processing:** `@xmldom/xmldom`, `xpath`
- **Graph Visualization:** Viz.js (DOT format rendering to SVG)
- **Spreadsheet Generation:** ExcelJS for creating Excel workbooks with formulas
- **Testing:** Vitest with jsdom for browser environment simulation
- **Deployment:** GitHub Pages (static files served from `docs/` directory)

---

## Testing

Run the test suite:

```bash
npm install  # Install dev dependencies
npm test     # Run all tests with Vitest
```

All tests are located in the `tests/` directory and map to specific requirements (R1-R12 below).

---

## Requirements and Test Coverage

| ID | Requirement | Tested by | Which shows 
|----|-------------|-------------|-----------------|
| R1 | Reject invalid language definitions in import | `language.test.js::when XML has a function with no name, when XML has a function with non-numeric arity` | Errors are thrown when language functions are malformed
| R2 | Preserve semantic meaning across language import and export  | `language.test.js::when vendor format language is loaded and exported` | Inferred functions are identical after a round-trip
| R3 | Prevent use of undefined symbols in models | `model.test.js::rejects_unknown_symbol` | A "missing reference" error is thrown when a formula contains an unknown identifier 
| R4 | Prevent circular logic in the model | `model.test.js::when model contains a cycle` | An error is thrown when a formula requires its own value
| R5 | Reject duplicate model definitions  | `model.test.js::when model contains duplicate variable identifiers, when model contains duplicate index set identifiers` | An error is thrown when a model contains duplicate identifiers 
| R6 | Preserve semantic meaning across model import and export  | `model.test.js::round trip through serializer` | Model features are identical after a round-trip
| R7 | Calculate incoming variables from formulae | `model.test.js::when model contains incoming variables` | Variables that flow into a variable are exactly the non-functions in its formula
| R8 | Calculate outgoing variables from formulae | `model.test.js::when model contains outgoing variables` | Variables that each variable flows into are exactly those in whose formulae it appears |
| R9 | Visualize incoming and outgoing variables as graphs | `graphRelations.test.js::getRelations, getGraphOfRelations` | Graphs contain variables and edges within specified depth from a root variable |
| R10 | Implement CRUD operations for a single variable | `variableCrud.test.js::createVariable, readVariable, updateVariable, deleteVariable, validateVariableId, listVariables, Integration: Create, Read, Update, Delete workflow` | Variables can be created, read, updated, and deleted with proper validation (duplicates, undefined references, circular dependencies, dependencies blocking deletion); full CRUD workflow maintains model validity 
| R11 | Render model in Excel format with sample inputs to enable quick manual verification of model structure | `spreadsheetDiagnosticsIntegration.test.js::should include diagnostics in README sheet for legacy annuity model, should work with vendor format model without diagnostics issues`; `spreadsheetFormula.test.js::should handle models with cohort-only variables, should handle simple model with function calls, should handle step-only variables`; `tableLookupFormula.test.js::should generate correct INDEX/MATCH formula with dynamic ranges`; `recursiveFormula.test.js::should handle recursive functions with step - 1 offset correctly, should handle recursive functions with step - 2 offset correctly, should handle multiple recursive references`; `cohortStepCopyable.test.js::should generate copyable step column, should maintain correct step references`; `constraintAwareSampleData.test.js::should extract columnOf constraints, should generate sample data respecting constraints`; `dynamicTableGeneration.test.js::should extract table definitions, should dynamically generate columns`; `tableDimensionsConstants.test.js::should have correct maxRow calculations`; `legacyModel.test.js::should use uppercase cell references in Excel formulas`; `manualVerification.test.js::should display expected sample data structure` | Spreadsheets are successfully rendered with: (1) working Excel formulas converted from model expressions, (2) proper cell references in dependency order, (3) sample input data respecting table constraints, (4) INDEX/MATCH formulas for table lookups with dynamic ranges, (5) recursive formulas with correct row offsets for time-dependent calculations, (6) copyable step columns that auto-increment, (7) diagnostics sheet documenting custom functions and temporal parameters, (8) uppercase cell references compatible with LibreOffice Calc, (9) multiple sheets for different variable types (cohort-only, step-only, cohort-step), (10) dynamically generated table columns based on variable references   
| R12 | Render model as a Python script with sample inputs that may be overriden by attaching other inputs at runtime | `pythonExport.test.js::renders and runs for all example models` | Python export produces a non-empty .csv file for each of the example models


### UI prototype
- Single-page, no-build browser UI
- Load XML via file input or pasted text
- Immediate feedback with contextual error reporting

---

## Project Structure

```
docs/                   # Application source (served statically via GitHub Pages)
  index.html            # Main UI entry point
  src/                  # Application modules
    applications/       # Feature modules (language, model, graph, CRUD)
    domain/             # Core business logic
    utils/              # Helper utilities
    format/             # Formatting and error handling
  styles/               # CSS files
  examples/             # Sample XML files
tests/                  # Vitest test suite
  fixtures/             # Test data
  helpers/              # Test utilities
```

---

## Model Features

### Variable Definition Types

The model editor supports multiple definition types for variables:

- **expression** - Mathematical formula using other variables and functions
- **constant** - Simple constant
- **table** - Array of values indexed by position
- **tableLookup** - Value lookup from a table using an index
- **piecewise** - Conditional definitions with multiple branches

### Parameterized Variables

Variables can accept arguments (index sets) for multi-dimensional modeling:
```xml
<variable name="benefit" arguments="ageGroup,year">
  <definition type="expression">premium(ageGroup) * factor(year)</definition>
</variable>
```

### Time-shift References

Formulas can reference variables at different time steps:
```xml
<variable name="cashflow">
  <definition type="expression">balance(step-1) * rate</definition>
</variable>
```

---

## Rendering Models as Spreadsheets

The model editor includes functionality to export a loaded model as a working Excel spreadsheet (XLSX format) with actual formulas that is semantically equivalent to the original model. This allows models to be used in spreadsheet applications like Excel, Google Sheets, or LibreOffice Calc with automatic calculation.

### What is rendered

When a model is rendered as a spreadsheet, the output includes:

1. **Variable Definitions Sheet**: Each variable becomes a named cell/row containing:
   - Variable ID (name)
   - Working formula or value in Excel format
   - Definition type (expression, constant, table, etc.)
   - Unit (if specified)
   - Notes (INPUT marker for variables with no dependencies)

2. **Working Formulas**: Expression variables are converted to Excel formulas with cell references that automatically calculate:
   - `A + B` becomes `=B2+B3` (where B2 and B3 contain values for A and B)
   - `C * 2` becomes `=B4*2` (where B4 contains the calculated value for C)
   - Functions are preserved: `max(A, B)` becomes `=max(B2, B3)`

3. **Input Space**: Variables with no dependencies (constants or table lookups) are marked as inputs and can be modified by users. When you change input values, all dependent formulas recalculate automatically.

4. **Calculation Order**: Variables are arranged in dependency order, ensuring that each formula only references cells that have already been calculated.

### Implementation Approach

The spreadsheet renderer follows these steps:

1. **Parse Model**: Extract all variables, their definitions, and dependencies using the existing `getModelFeatures()` function.

2. **Topological Sort**: Order variables so dependencies are resolved before dependents (detecting cycles during validation).

3. **Formula Conversion**: Transform model expressions to Excel formulas:
   - Convert variable references to cell references (e.g., `A` → `B2`, `B` → `B3`)
   - Preserve functions that exist in both domains (`max`, `floor`, etc.)
   - Maintain operators: `+`, `-`, `*`, `/`, `^`

4. **Generate Excel XML**: Create an Office Open XML SpreadsheetML file with:
   - Variables listed in dependency order
   - Constants as numeric values
   - Expressions as Excel formulas with `ss:Formula` attribute
   - Proper cell references (e.g., `=B2+B3`)

5. **Download**: Use the browser's download mechanism to save the XLSX file.

### Limitations

- **Function compatibility**: Not all model functions may have direct Excel equivalents. Custom functions may require manual implementation or will appear as function names (Excel will show #NAME? error).
- **Parameterized variables**: Variables with index sets (multi-dimensional) need to be expanded into multiple cells.
- **Tables**: Table data must be embedded or referenced as separate sheets/ranges.
- **Time-shift references**: Time-dependent formulas (e.g., `balance(step-1)`) may fail to convert correctly.

### Usage

Once a model is loaded and validated, click the "Render model as spreadsheet" button to download the XLSX file. The file can then be opened in Excel, Google Sheets, or LibreOffice Calc, where formulas will automatically calculate based on input values.

---

## Development

### Local Development

```bash
# Serve locally from the docs folder
cd docs
python3 -m http.server 8080
# Visit http://localhost:8080
```

### Adding Dependencies

- **Runtime dependencies:** Must work in browser via CDN or vendored file (no npm packages in runtime code)
- **Dev dependencies:** npm packages for testing only (vitest, jsdom, etc.)
- Keep the browser bundle dependency-free

### No Build Philosophy

This project intentionally has **no build step**. All code runs directly in the browser:
- Don't add bundlers (webpack, vite, rollup, etc.)
- Don't add transpilers (Babel, TypeScript, etc.)
- Don't add CSS preprocessors (SASS, LESS, etc.)
- Keep dependencies minimal

---

## Troubleshooting

### Common Issues

**"Cannot load file" error:**
- Ensure you're serving files via HTTP (not file:// protocol)
- Check browser console for CORS or network errors

**"Invalid XML" error:**
- Validate XML syntax (all tags properly closed)
- Check for special characters that need escaping (&lt;, &gt;, &amp;)

**"Circular reference" error:**
- Review dependency graph to identify the cycle
- Variables are not allowed to depend on themselves directly or indirectly

**Tests fail:**
- Run `npm install` to ensure dev dependencies are installed
- Check that Node.js version is recent (ES6+ modules required)

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass with `npm test`
6. Submit a pull request

---

## License

MIT

---

## Authors

See GitHub contributors for the list of contributors to this project.

