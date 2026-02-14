# model-editor

![Tests](https://github.com/owen-kellie-smith/model-editor/actions/workflows/tests.yml/badge.svg)

A single web page for parsing, validating, and editing large declarative models stored in XML with built-in constraints to preserve model validity.

**Live demo:** https://owen-kellie-smith.github.io/model-editor/

---

## How to run

1. Clone or download the repository
2. In the docs folder, serve locally:

```bash
python3 -m http.server 8080
```
then visit http://localhost:8080

3. Load or paste a `language.xml` (e.g. from docs/examples/) which lists functions in the modelling language that your model may use.
4. Load or paste a `model.xml` (e.g. from docs/examples/annuity-model)
5. Inspect validation and dependency output in the log panel

No build step or server required.

---

## Requirements and Test Coverage

| ID | Requirement | Tested by | Which shows 
|----|-------------|-------------|-----------------|
| R1 | Reject invalid language definitions in import | `language.test.js::when XML has a function with no name, when XML has a function with non-numeric arity` | Errors are thrown when language functions are malformed
| R2 | Preserves semantic meaning across language import and export  | `language.test.js::when vendor format language is loaded and exported` | Inferred functions are identical after a round-trip
| R3 | Prevent use of undefined symbols in models | `model.test.js::rejects_unknown_symbol` | A "missing reference" error is thrown when a formula contains an unknown identifier 
| R4 | Prevent circular logic in the model | `model.test.js::when model contains a cycle` | An error is thrown when a formula requires its own value
| R5 | Reject duplicate model definitions  | `model.test.js::when model contains duplicate variable identifiers, when model contains duplicate index set identifiers` | An error is thrown when a model contains duplicate identifiers 
| R6 | Preserves semantic meaning across model import and export  | `model.test.js::round trip through serializer` | Model features are identical after a round-trip
| R7 | Calculate incoming variables from formulae | `model.test.js::when model contains incoming variables` | Variables that flow into a variable are exactly the non-functions in its formula
| R8 | Calculate outgoing variables from formulae | `model.test.js::when model contains outgoing variables` | Variables that each variable flows into are exactly those in whose formulae it appears |
| R9 | Visualize dependency relationships as graphs | `graphRelations.test.js::getRelations, getGraphOfRelations` | Graphs contain variables and edges within specified depth from a root variable |
| R10 | Implement CRUD operations for a single variable | `variableCrud.test.js::createVariable, readVariable, updateVariable, deleteVariable, validateVariableId, listVariables, Integration: Create, Read, Update, Delete workflow` | Variables can be created, read, updated, and deleted with proper validation (duplicates, undefined references, circular dependencies, dependencies blocking deletion); full CRUD workflow maintains model validity 


### UI prototype
- Single-page, no-build browser UI
- Load XML via file input or pasted text
- Immediate feedback with contextual error reporting
- UI state resets on invalid input to avoid partial state

