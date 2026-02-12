# model-editor

![Tests](https://github.com/owen-kellie-smith/model-editor/actions/workflows/tests.yml/badge.svg)

An experimental single web page for parsing, validating, and exploring large declarative models stored in XML.

**Live demo:** https://owen-kellie-smith.github.io/model-editor/

---

The long-term goal of this project is a **constrained editor** for modifying models while preserving their validity.

> ⚠️ Status: Early prototype / active development

---

## How to run

1. Clone or download the repository
2. In the docs folder, serve locally:

```bash
python3 -m http.server 8080
```
then visit http://localhost:8080

3. Load or paste a `language.xml` (e.g. from docs/examples/) which lists functions in the modelling language that your model may use.
4. Load or paste a `model.xml`(e.g. from docs/examples/annuity-model)
5. Inspect validation and dependency output in the log panel

No build step or server required.

---

## Road map - requirements and associated tests

| ID | Requirement | Tested by | Which shows that
|----|-------------|-------------|-----------------|
| R1 | Language XML is only loaded if it is valid | `language.tests.js::when XML has a funciton with no name, when XML has a function with non-numeric arity"` | An invalid language.xml (with a function without a name or with non-numeric arities) throws an error
| R2 | Language XML round-trip from import to export preserves its meaning | `language.tests.js::when vendor format language is loaded and exported` | The functions inferred by a valid language file are identical to the functions inferred by the standardised export of that file
| R3 | Missing model references are rejected | `model.tests.js::rejects_unknown_symbol` | Loading a model formula that contains a string which is neither a function defined in the loaded language nor a variable defined in the model throws a "missing reference" error
| R4 | Circular logic in the model is rejected | `model.tests.js::when model contains a cycle` | Loading a model that contains circular logic (a formula that requires its own value) throws an error
| R5 | Duplicate model definitions are rejected | to show | Loading a model that contains duplicate identifiers throws an error
| R6 | Model XML round-trip from import to export preserves its meaning | `model.tests.js::round trip through serializer` | The model features inferred by a valid model file are identical to the features inferred by the standardised export of that file
| R7 | Precedents of a variable can be calculated from model formulae| to show |
| R8 | Dependents of a variable can be calculated from model formulae| to do |
| R9 | Precedents and dependents can be rendered in graphs | to do |


### UI prototype
- Single-page, no-build browser UI
- Load XML via file input or pasted text
- Immediate feedback with contextual error reporting
- UI state resets on invalid input to avoid partial state

