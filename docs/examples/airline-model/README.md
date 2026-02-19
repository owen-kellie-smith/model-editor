# Airline Profitability Model

This directory contains a **declarative financial model** for projecting airline profitability over time.

## Purpose

The model exists to:
- Demonstrate the model editor's capabilities with a complex business domain
- Project monthly revenue, costs, and profitability for an airline operation
- Enable scenario analysis of different pricing, load factors, and cost structures
- Provide a realistic example with ~30 variables covering airline operations

## Model Description

This model projects the financial performance of a small airline operation. It calculates revenue based on fleet size, flight frequency, cabin class mix, load factors, and ticket pricing, while accounting for variable costs (fuel, crew, maintenance, landing fees) and fixed costs (aircraft leases, administration, marketing).

The model considers three cabin classes (economy, business, first) with different seat allocations, load factors, and pricing. This allows for realistic modeling of airline economics where premium cabins contribute disproportionately to profitability.

## Inputs

The model requires the following input parameters:

### Fleet & Operations
- **aircraft_count**: Number of aircraft in the fleet (default: 10)
- **seats_per_aircraft**: Total seats per aircraft (default: 180 seats)
- **flights_per_aircraft_per_month**: Monthly flights per aircraft (default: 120)
- **avg_flight_distance**: Average flight distance (default: 850 miles)
- **avg_flight_time**: Average flight duration (default: 2.5 hours)

### Cabin Configuration
- **economy_seats_percent**: Percentage of seats in economy (default: 80%)
- **business_seats_percent**: Percentage of seats in business (default: 15%)
- **first_seats_percent**: Percentage of seats in first class (default: 5%)

### Load Factors (Occupancy by Class)
- **economy_load_factor**: Economy class occupancy rate (default: 85%)
- **business_load_factor**: Business class occupancy rate (default: 70%)
- **first_load_factor**: First class occupancy rate (default: 60%)

### Ticket Pricing
- **economy_ticket_price**: Average economy ticket price (default: $250)
- **business_ticket_price**: Average business ticket price (default: $800)
- **first_ticket_price**: Average first class ticket price (default: $1,500)

### Variable Cost Structure
- **fuel_cost_per_mile**: Fuel cost per mile flown (default: $2.50)
- **crew_cost_per_flight**: Crew cost per flight (default: $1,200)
- **maintenance_cost_per_flight**: Maintenance cost per flight (default: $800)
- **landing_fees_per_flight**: Airport landing fees per flight (default: $500)

### Fixed Cost Structure
- **monthly_lease_cost**: Aircraft lease payments (default: $400,000)
- **monthly_admin_cost**: Administrative overhead (default: $150,000)
- **monthly_marketing_cost**: Marketing and sales expenses (default: $50,000)

### Debt & Interest
- **annual_interest_rate**: Annual cost of borrowing (default: 6%)
- **initial_debt**: Opening debt balance representing fleet financing (default: $5,000,000)

## Outputs

The model projects the following key metrics for each month:

### Operational Metrics
- **total_monthly_flights**: Total number of flights operated
- **economy_passengers_per_flight**: Economy passengers per flight
- **business_passengers_per_flight**: Business passengers per flight
- **first_passengers_per_flight**: First class passengers per flight
- **total_passengers_per_flight**: Total passengers per flight

### Revenue Metrics
- **monthly_economy_revenue**: Economy class ticket revenue
- **monthly_business_revenue**: Business class ticket revenue
- **monthly_first_revenue**: First class ticket revenue
- **monthly_total_revenue**: Total passenger revenue

### Cost Metrics
- **monthly_fuel_cost**: Total fuel expenses
- **monthly_crew_cost**: Total crew expenses
- **monthly_maintenance_cost**: Total maintenance costs
- **monthly_landing_fees**: Total airport fees
- **monthly_variable_costs**: Sum of all variable costs
- **monthly_fixed_costs**: Sum of all fixed costs
- **monthly_total_costs**: Total operating costs

### Profitability Metrics
- **monthly_net_profit**: Revenue minus all operating costs (before interest)
- **monthly_profit_margin**: Net profit as percentage of revenue (before interest)
- **monthly_interest_rate**: Monthly cost of borrowing (derived from annual rate)
- **outstanding_debt**: Remaining debt balance for each month (decreases as profits repay the loan)
- **monthly_interest_cost**: Interest charged on outstanding debt each month
- **monthly_net_profit_after_interest**: Net profit after deducting interest costs — **this varies over time** as debt is paid off
- **monthly_profit_margin_after_interest**: Profit margin after interest — **improves over time** as debt is repaid

## Model Logic

The model calculates profitability through the following logic flow:

1. **Capacity**: Calculate seats per cabin class based on aircraft configuration
2. **Passenger Volume**: Actual passengers = seats × load factor (by class)
3. **Flight Operations**: Total flights = aircraft count × flights per aircraft
4. **Revenue**: Passengers × ticket price (by class) × number of flights
5. **Variable Costs**: Per-flight costs × number of flights (fuel, crew, maintenance, fees)
6. **Fixed Costs**: Monthly recurring expenses (leases, admin, marketing)
7. **Operating Profit**: Revenue - Variable Costs - Fixed Costs
8. **Debt Repayment**: Each month's operating profit reduces the outstanding debt balance
9. **Interest Cost**: Monthly interest = outstanding debt × monthly interest rate
10. **Net Profit After Interest**: Operating profit minus interest charges — **varies over time** as the debt is paid down

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
With default parameters, the airline projects approximately:
- Monthly flights: 1,200
- Monthly passengers: ~166 per flight
- Monthly revenue: ~$5.1 million
- Monthly operating costs: ~$4.1 million
- Monthly operating profit: ~$1.0 million
- Month 0 interest cost: ~$25,000 (on $5M initial debt at 6%/year)
- Month 0 net profit after interest: ~$975,000
- Profit margin after interest improves each month as debt is repaid (~5 months to pay off initial debt)

### High Load Factor Scenario
Increase all load factors by 10 percentage points to model peak travel season with higher demand.

### Premium Strategy Scenario
Increase business_seats_percent to 0.20, reduce economy_seats_percent to 0.75, and raise business_ticket_price to $900 to model a business-focused airline.

### Fuel Cost Sensitivity
Increase fuel_cost_per_mile to $3.50 to model the impact of higher fuel prices on profitability. This is a critical risk factor for airlines.

### Fleet Expansion Scenario
Increase aircraft_count to 15 to model fleet growth. Note how fixed costs increase (lease payments) but economies of scale improve overall margins.

## Key Insights

The model demonstrates several important airline economics principles:

1. **Revenue Mix**: Premium cabins (business/first) contribute ~30% of seats but ~55% of revenue
2. **Operating Leverage**: High fixed costs mean small changes in load factors significantly impact profitability
3. **Fuel Sensitivity**: Fuel represents ~50% of variable costs, making fuel price a critical factor
4. **Scale Economics**: Larger fleets can spread fixed admin/marketing costs over more flights
5. **Time-Varying Profitability**: Interest costs on initial debt decrease as profits repay the loan, causing `monthly_profit_margin_after_interest` to improve over time until debt is cleared
