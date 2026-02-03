# Annuity Model (Declarative)

## Purpose

This folder contains a **deliberately simplified, fully declarative annuity cashflow model**.

Its sole purpose is to:
- exercise a **declarative model editor / interpreter**
- provide a **structurally realistic** but **numerically unambitious** example
- remain **engine-agnostic** and ultimately **disposable**

This is **not** a production actuarial model.

---

## What this model is

- Closed (to new entrants) and deterministic  
- Cohort-based  
- Monthly time steps  
- Immediate and deferred annuities (inferred from age versus annuity start age)  
- Mortality depends on **sex and integer attained age only**  
- No mortality improvements  
- No lapses  
- Level nominal benefits  
- Discounting from input spot rates  
- Outputs defined declaratively via grouping requests  

All behaviour is expressed through:
- variable definitions
- index sets
- mappings between them
- output requirements

No numerical algorithms are specified here.

---

## What this model is **not**

This directory does **not** contain:

- executable code
- solvers or numerical engines
- performance benchmarks
- reference implementations
- “golden” numerical results
- tolerance-based tests

Any engine that evaluates this model exists **outside** this directory.

---

## Repository layout (conceptual)

This directory contains the following kinds of artefacts:

- **model/** — declarative model definition (XML, XSD)
- **data/** — minimal illustrative CSV inputs
- **examples/** — example run and output specifications (YAML)
- **docs/** — human-readable explanations and boundaries
- **tests/** — structural and semantic validation (non-numeric)
- **NOTES.md** — design scratchpad

Each subfolder includes a `README.md` describing its role a
