# Restaurant Profitability Model

This directory contains a **declarative financial model** for projecting restaurant profitability over time.

## Purpose

The model exists to:
- Demonstrate the model editor's capabilities with a real-world business domain
- Project monthly revenue, costs, and profitability for a restaurant
- Enable sensitivity analysis by varying input parameters
- Provide a realistic example with ~30 variables

## Model Description

This model projects the financial performance of a restaurant operation. It calculates revenue based on seating capacity, occupancy rates, and pricing, while accounting for variable costs (food, beverages) and fixed costs (labor, rent, utilities, marketing, insurance).

The model distinguishes between weekday and weekend operations, recognizing that restaurants typically have different occupancy patterns on different days.

## Inputs

The model requires the following input parameters:

### Capacity & Operations
- **seating_capacity**: Number of tables in the restaurant (default: 25 tables)
- **avg_party_size**: Average number of customers per table (default: 3.5 customers)
- **table_turnover_rate**: How many times each table is used per day (default: 2.5)
- **hours_open_per_day**: Operating hours per day (default: 12 hours)

### Pricing
- **avg_meal_price**: Average price per meal (default: $45)
- **avg_beverage_price**: Average price per beverage (default: $12)
- **beverage_attach_rate**: Percentage of customers ordering beverages (default: 75%)

### Occupancy
- **occupancy_rate_weekday**: Percentage of capacity filled on weekdays (default: 65%)
- **occupancy_rate_weekend**: Percentage of capacity filled on weekends (default: 90%)
- **weekdays_per_month**: Number of weekdays per month (default: 21)
- **weekend_days_per_month**: Number of weekend days per month (default: 9)

### Cost Structure
- **food_cost_percent**: Food cost as percentage of food revenue (default: 30%)
- **beverage_cost_percent**: Beverage cost as percentage of beverage revenue (default: 25%)
- **monthly_labor_cost**: Total monthly labor expenses (default: $35,000)
- **monthly_rent**: Monthly rent expense (default: $12,000)
- **monthly_utilities**: Monthly utilities expense (default: $3,500)
- **monthly_marketing**: Monthly marketing budget (default: $2,000)
- **monthly_insurance**: Monthly insurance cost (default: $1,500)

## Outputs

The model projects the following key metrics for each month:

### Revenue Metrics
- **monthly_food_revenue**: Food sales revenue per month
- **monthly_beverage_revenue**: Beverage sales revenue per month
- **monthly_total_revenue**: Total revenue per month

### Cost Metrics
- **monthly_food_cost**: Cost of food sold
- **monthly_beverage_cost**: Cost of beverages sold
- **monthly_fixed_costs**: Total fixed operating costs
- **monthly_total_costs**: Total operating costs

### Profitability Metrics
- **monthly_gross_profit**: Revenue minus variable costs (food & beverage)
- **monthly_net_profit**: Revenue minus all costs
- **monthly_profit_margin**: Net profit as percentage of revenue

## Model Logic

The model calculates profitability through the following logic flow:

1. **Capacity**: Maximum daily customers = tables × party size × turnover rate
2. **Customer Volume**: Actual customers = max capacity × occupancy rate (by day type)
3. **Revenue**: Customers × (meal price + beverage price × attach rate)
4. **Variable Costs**: Revenue × cost percentages
5. **Profitability**: Revenue - Variable Costs - Fixed Costs

## Usage

To use this model in the model editor:

1. **Load the language definition:**
   - Navigate to the [model editor](https://owen-kellie-smith.github.io/model-editor/)
   - Load `language.xml` from the parent `docs/examples/` directory
   - The existing language definition supports all functions needed by this model

2. **Load the model:**
   - Load `model.xml` from this directory
   - Review validation output to ensure the model is valid
   - Check dependency relationships between variables

3. **Explore scenarios:**
   - Modify input parameters to test different scenarios
   - View dependency graphs to understand variable relationships
   - Export the model as a spreadsheet to perform calculations

4. **Export to spreadsheet:**
   - Use the "Render model as spreadsheet" feature
   - Generate an Excel file with formulas and sample data
   - Analyze results in your preferred spreadsheet tool

## Example Scenarios

### Base Case
With default parameters, the restaurant projects approximately:
- Monthly revenue: ~$143,000
- Monthly costs: ~$93,000
- Monthly net profit: ~$50,000
- Profit margin: ~35%

### High Occupancy Scenario
Increase occupancy_rate_weekday to 0.80 and occupancy_rate_weekend to 0.95 to model peak season performance.

### Premium Pricing Scenario
Increase avg_meal_price to $60 and avg_beverage_price to $18 to model an upscale dining concept.

### Cost Control Scenario
Reduce food_cost_percent to 0.27 and beverage_cost_percent to 0.22 to model improved supplier relationships.
