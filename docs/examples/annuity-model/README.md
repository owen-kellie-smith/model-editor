# Annuity Model Example

This directory contains a declarative annuity cashflow model.

## Purpose

The model exists to:
- Exercise the model editor and its structural constraints
- Provide a realistic but brief example
- Demonstrate proper model structure and variable relationships


## Model Description

The model is deterministic, cohort-based, and closed to new entrants.  
Benefits are level and payable while alive. There are no reversionary or lump sum benefits.
Mortality depends on integer attained age via externally supplied tables. 
Discounting is derived from spot rates.

## Model Structure

The annuity model includes:
- **Time variables:** Projection period management
- **Demographic variables:** Age, mortality, survival rates
- **Financial variables:** Premiums, benefits, reserves
- **Discounting variables:** Spot rates, discount factors
- **Cashflow variables:** Income, outgo, net cashflows


## Usage

See [How to run](../../../README.md#how-to-run)



