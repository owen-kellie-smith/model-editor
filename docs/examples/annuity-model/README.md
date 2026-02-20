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

## Files in this Directory

### Model Definition Files
- `vendor-format-model.xml` - Model in recommended format

## Usage

To use this example in the model editor:

1. **Load the language definition:**
   - Navigate to the [model editor](https://owen-kellie-smith.github.io/model-editor/)
   - Load `language.xml` from the parent `docs/examples/` directory
   - Verify the language loads without errors

2. **Load the model:**
   - Choose:
     - `vendor-format-model.xml` 
   - Load via file input or paste the XML content
   - Review validation output and dependency information

3. **Explore the model:**
   - View variable definitions and their dependencies
   - Generate dependency graphs to visualize relationships
   - Test CRUD operations by creating, updating, or deleting variables
   - Verify that circular references are prevented
   - Export the model to validate round-trip preservation

## Model Structure

The annuity model includes:
- **Time variables:** Projection period management
- **Demographic variables:** Age, mortality, survival rates
- **Financial variables:** Premiums, benefits, reserves
- **Discounting variables:** Spot rates, discount factors
- **Cashflow variables:** Income, outgo, net cashflows

All variables are defined using expressions that reference other variables or index sets, demonstrating the dependency validation capabilities of the model editor.

