# Copilot Instructions for model-editor

## Project Overview

**model-editor** is a single-page web application for parsing, validating, and exploring large declarative models stored in XML.

- **Live demo:** https://owen-kellie-smith.github.io/model-editor/
- **Purpose:** Constrained editor for modifying XML models while preserving their validity
- **Architecture:** No-build, client-side only, ES modules
- **Languages:** Vanilla JavaScript (ES6+), HTML, CSS

## Technology Stack

- **JavaScript:** ES6+ modules (no transpilation)
- **DOM Manipulation:** Vanilla JS (no framework)
- **XML Parsing:** `@xmldom/xmldom`, `xpath`
- **Testing:** Vitest with jsdom
- **Rendering:** Viz.js for graph visualization (DOT format)
- **Deployment:** GitHub Pages (static files in `docs/`)

## Project Structure

```
docs/               # Application source (served statically)
  index.html        # Main UI entry point
  src/              # Application modules
    app.js          # Main application entry
    ui.js           # DOM element references
    applications/   # Feature modules (language, model, graph)
    domain/         # Core business logic
    utils/          # Helper utilities
    format/         # Formatting and error handling
  styles/           # CSS files
  examples/         # Sample XML files
tests/              # Vitest test suite
  fixtures/         # Test data
  helpers/          # Test utilities
```

## Code Style & Conventions

### JavaScript

- Use ES6+ features: `import`/`export`, arrow functions, destructuring, template literals
- Prefer `const` over `let`; never use `var`
- Use descriptive variable names (e.g., `languageEnv`, `modelObj`, `incomingAll`)
- Functions are camelCase (e.g., `getModelFeatures`, `throwErrorForCircularExpressions`)
- No semicolons at line endings (existing code style)
- Export individual functions rather than default exports
- Keep functions focused and single-purpose

### DOM Manipulation

- All DOM element IDs are collected in `docs/src/ui.js`
- Access elements via `ui.elementName` rather than `document.getElementById()`
- Use helper functions from `docs/src/utils/helpers.js` (e.g., `enableElement`, `setElementContent`)

### Error Handling

- Parse errors should be caught and formatted for user display
- Use `formatError()` and `formatErrorNoStack()` from `docs/src/format/formatters.js`
- Validation errors should be descriptive and actionable
- Display errors in status divs (e.g., `ui.languageStatus`, `ui.modelStatus`)

### Module Organization

- **Domain logic** (`docs/src/domain/`): Pure functions for model/language operations
- **Application logic** (`docs/src/applications/`): UI event handlers and state management
- **Utilities** (`docs/src/utils/`): Reusable helper functions
- Keep business logic separate from UI concerns

## Testing

### Running Tests

```bash
npm install  # Install dependencies
npm test     # Run all tests with Vitest
```

### Test Structure

- Tests are in `tests/` directory
- Test files follow `*.test.js` naming convention
- Use descriptive test names with `describe` and `it` blocks
- Fixtures are in `tests/fixtures/` directory
- Test helpers are in `tests/helpers/` directory

### Testing Best Practices

- Test business logic in isolation (domain functions)
- Mock DOM elements when testing UI interactions
- Use fixture files for complex XML test data
- Validate both success and error cases
- Check for specific error messages in validation tests

### Requirements Coverage

All tests map to specific requirements (R1-R10) documented in README.md:
- **R1-R2:** Language validation and round-tripping (`language.test.js`)
- **R3-R8:** Model validation, cycles, duplicates, dependencies (`model.test.js`)
- **R9:** Graph visualization (`graphRelations.test.js`, `graphviz.test.js`)
- **R10:** CRUD operations (to be implemented)

## Development Workflow

### No Build Step

This project intentionally has **no build step**. All code runs directly in the browser:
- Don't add bundlers (webpack, vite, rollup, etc.) for the application
- Don't add transpilers (Babel, TypeScript, etc.)
- Don't add CSS preprocessors (SASS, LESS, etc.)
- Keep dependencies minimal

### Local Development

```bash
# Serve locally from the docs folder
cd docs
python3 -m http.server 8080
# Visit http://localhost:8080
```

### Adding Dependencies

- **Runtime dependencies:** Must work in browser via CDN or vendored file
- **Dev dependencies:** npm packages for testing only (vitest, jsdom, etc.)
- Keep the browser bundle dependency-free (no npm packages in runtime code)

## Model Validation Rules

When working with model validation, ensure:

1. **No undefined symbols:** All identifiers in formulae must exist in the language or model
2. **No circular dependencies:** Variable A cannot depend on variable B if B depends on A
3. **No duplicate identifiers:** Variable and index set names must be unique
4. **Arity checking:** Function calls must have the correct number of arguments
5. **Incoming/outgoing tracking:** Maintain accurate dependency graphs

## Key Domain Concepts

- **Language:** XML definition of available functions and their arities
- **Model:** XML definition of variables, their formulae, and relationships
- **Incoming variables:** Variables that a given variable depends on (appears in its formula)
- **Outgoing variables:** Variables that depend on a given variable (it appears in their formulae)
- **Dependency graph:** Directed graph showing variable relationships
- **Circular expressions:** Invalid cycles in variable dependencies

## Files to Avoid Modifying

- `docs/examples/*` - Sample data files (unless fixing bugs in examples)
- `.github/workflows/*` - CI configuration (unless specifically working on CI)
- `LICENSE` - Project license

## Common Tasks

### Adding a new validation rule
1. Add logic in `docs/src/domain/model.js` or `docs/src/domain/language.js`
2. Add tests in `tests/model.test.js` or `tests/language.test.js`
3. Update error formatting in `docs/src/format/formatters.js` if needed
4. Run tests: `npm test`

### Adding UI features
1. Add DOM elements to `docs/index.html`
2. Reference elements in `docs/src/ui.js`
3. Add event handlers in `docs/src/applications/*.js`
4. Keep UI code separate from business logic
5. Test manually in browser

### Working with XML
- Use `parseXmlOrThrow()` from `docs/src/utils/helpers.js`
- Use `getObjectFromXML()` to extract structured data
- Use `serializeLanguage()` or `serializeModel()` for export
- Handle malformed XML gracefully with user-friendly errors

## Debugging Tips

- Use `console.log()` for debugging (remove before committing)
- Check browser console for JavaScript errors
- Use `LOG_LEVEL` in `docs/config.js` to control logging verbosity
- Test with sample files in `docs/examples/`
- Validate XML structure with browser dev tools

## Remember

- This is a **client-side only** application - no server-side code
- Keep it simple - avoid over-engineering
- Maintain the no-build philosophy
- Prioritize correctness and validation over features
- Write tests for all new validation logic
- Keep user feedback clear and actionable
