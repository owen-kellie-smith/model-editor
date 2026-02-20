# Airline Profitability Model

This directory contains a **declarative financial model** for projecting airline profitability over time.

## Purpose

The model exists to:
- Demonstrate the model editor's capabilities with a complex business domain
- Project monthly revenue, costs, and profitability for an airline operation
- Enable scenario analysis of different pricing, load factors, and cost structures

## Model Description

This model projects the financial performance of a small airline. It calculates revenue based on fleet size, flight frequency, cabin class mix, load factors, and ticket pricing, while accounting for variable costs (fuel, crew, maintenance, landing fees) and fixed costs (aircraft leases, administration, marketing).

## Usage

To use this model in the model editor:

1. **Load the language definition:**
   - Navigate to the [model editor](https://owen-kellie-smith.github.io/model-editor/)
   - Load `language.xml` from the parent `docs/examples/` directory
   - The existing language definition supports all functions needed by this model

2. **Load the model:**
   - Load `model.xml` from this directory
   - Review validation output to ensure the model is valid
   - View dependency graphs to understand variable relationships
   - Export the model as a spreadsheet to perform calculations

4. **Export to spreadsheet:**
   - Use the "Render model as spreadsheet" feature
   - Generate an Excel file with formulas and sample data
   - Analyze results in your preferred spreadsheet tool
