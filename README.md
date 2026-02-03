# model-editor

A constrained editor for navigating and modifying large models encoded as declarative formulae and stored in XML.

The editor makes structural relationships explicit, including variable dependencies, precedents, dependants, and differences between model versions.

---

## What’s here

- **The editor**  
  A single-page web tool for exploring and editing models subject to structural constraints.

  The editor operates on models composed only of the following construct types:
  - index sets with intrinsic meaning,
  - variables with declared arguments, units, data types, and value definitions, and
  - output requirements, defined as declarative requests for aggregations of variables, optionally grouped by other variables.
 
  No procedural constructs, execution semantics, or numerical methods form part of the model representation.

- **A restaurant cashflow model**  
  A deterministic model used to demonstrate the editor on a large but simple structure.

- **An aircraft cashflow model**  
  A deterministic model used to demonstrate the editor on a large structure with different dependencies and dimensions.

The models exist to demonstrate the editor rather than to act as standalone simulations.

---

## What the editor demonstrates


- working with large declarative models
- dependency analysis and visualisation
- constrained editing with structural validity guarantees
