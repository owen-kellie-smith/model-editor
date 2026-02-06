# model-editor

An experimental single web page for parsing, validating, and exploring large declarative models stored in XML.

**Live demo:** https://owen-kellie-smith.github.io/model-editor/

---

The long-term goal of this project is a **constrained editor** for navigating and modifying models while preserving structural validity.  
The current focus is on **parsing, validation, and dependency analysis** as a foundation for that editor.

> ⚠️ Status: Early prototype / active development

---

## What’s here today

### XML parsing and validation
- Safe XML parsing with explicit error detection
- Conversion of XML models into normalized JavaScript objects
- Explicit separation between:
  - language definition
  - model structure
  - validation logic

### Language-driven validation
- A `language.xml` definition describing built-in functions
- Validation of function declarations (name, arity)
- A language environment (i.e. function list) used during model validation

### Model structure analysis
- Collection and validation of:
  - index sets
  - variables
  - tables and units
- Detection of:
  - duplicate identifiers
  - unknown references (missing variables which are not listed as functions)
  - invalid domains
  - dependency cycles between variables i.e. circular logic
- Explicit dependency graphs derived from declarative expressions

### UI prototype
- Single-page, no-build browser UI
- Load XML via file input or pasted text
- Immediate feedback with contextual error reporting
- UI state resets on invalid input to avoid partial state

---

## How to run

1. Clone the repository
2. Open `parser.html` in a modern browser
3. Load or paste a `language.xml`
4. Load or paste a `model.xml`
5. Inspect validation and dependency output in the log panel

No build step or server required.

---

## Why this exists

This project explores:
- working with large declarative models
- making structural relationships explicit
- enforcing correctness through constraints
