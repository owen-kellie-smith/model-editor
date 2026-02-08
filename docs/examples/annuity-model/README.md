# Annuity model

This directory contains a **small, fully declarative annuity cashflow model**.

The model exists to:
- exercise the model editor and its structural constraints,
- provide a realistic but numerically unambitious example, and
- remain engine-agnostic and disposable.

The model is deterministic, cohort-based, and closed to new entrants.  
Benefits are level and payable while alive. There are no reversionary or lump sum benefits.
Mortality depends on integer attained age via externally supplied tables. 
Discounting is derived from spot rates.


## Boundary

The annuity model is a specification, not an implementation.

It contains no:
- code,
- numerical algorithms,
- solvers,
- optimisation logic, or
- performance considerations.
