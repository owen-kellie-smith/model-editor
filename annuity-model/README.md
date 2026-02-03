# Annuity model

This directory contains a **small, fully declarative annuity cashflow model**.

The model exists to:
- exercise the model editor and its structural constraints,
- provide a realistic but numerically unambitious example, and
- remain engine-agnostic and disposable.

The model is deterministic, cohort-based, and closed to new entrants.  
Benefits are level and payable while alive. Mortality depends on integer attained age via externally supplied tables. Discounting is derived from spot rates.

## Structure

- `model/` — the complete declarative specification (`model.xml`)
- `data/` — minimal CSV fixtures required to instantiate the model
- `examples/` — example run and output requests
- `docs/` — explanatory notes and boundaries
- `tests/` — structural and semantic validation artefacts

## Boundary

The annuity model is a specification, not an implementation.

It contains no:
- code,
- numerical algorithms,
- solvers,
- optimisation logic, or
- performance considerations.

Such concerns belong to execution engines, not to the model definition.
