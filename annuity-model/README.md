# Annuity Model

A deliberately simplified, fully declarative pension / annuity cashflow model.

The model exists to exercise the model editor on a structurally realistic example.  
The contents do not represent a production actuarial model.

---

## Scope and simplifications

The annuity model is:

- deterministic and cohort-based
- closed to new entrants
- defined on monthly time steps
- immediate or deferred depending on attained age versus annuity start age
- for level nominal benefits
- with mortality dependent on sex and integer attained age only
- without mortality improvements or lapses
- discounted using input spot rates
- queried via declarative output requirements

The model is expressed entirely using construct types supported by the model editor.  
No numerical algorithms or execution semantics are specified.

---

## Contents

- **model/** — declarative model definition (XML, XSD)
- **data/** — minimal illustrative CSV inputs
- **examples/** — example run and output specifications
- **docs/** — explanatory notes and boundaries
- **tests/** — structural and semantic validation
- **NOTES.md** — design scratchpad

Each subdirectory contains a short README.

---

## Boundary

The annuity model defines structure and relationships only.

Code, numerical methods, optimisation logic, and performance concerns belong to an execution engine and do not appear here.

Code, numerical methods, optimisation logic, and performance concerns belong to an execution engine and do not appear here.
