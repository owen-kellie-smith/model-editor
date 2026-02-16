# Spreadsheet Structure Reference

This document describes the structure of `spreadsheet_rendered.xlsx` in a readable text format.

## Overview

The reference spreadsheet contains 6 sheets demonstrating the expected output format:

1. **constant** - Constants (variables with no arguments)
2. **table_cohort_data** - Input data for cohorts
3. **table_mortality_rate** - Mortality rates by age
4. **table_spot_rate** - Discount rates by step
5. **calc_cohort** - Cohort-level calculations
6. **calc_cohort_step** - Step-by-step calculations (12 months)

---

## Sheet 1: constant

Single row with constant values.

| A | B |
|---|---|
| step_length | =1/12 → 0.08333... |

**Description:** Variables with no arguments (constants)

---

## Sheet 2: table_cohort_data

Headers and sample cohort data.

| Row | A (id) | B (annual_annuity_amount) | C (annuity_start_age) | D (current_age) | E (mortality_table) |
|-----|--------|---------------------------|----------------------|-----------------|---------------------|
| 1 | id | annual_annuity_amount | annuity_start_age | current_age | mortality_table |
| 2 | dataType | real | real | real | string |
| 3 | unit | GBP per year | years | years | |
| 4 | cohort | | | | |
| 5 | 1 | 12.34 | 61 | 31.2 | AM92U |
| 6 | 2 | 23.45 | 62 | 32.3 | AM92U |
| 7 | 3 | 34.56 | 63 | 33.4 | AM92U |
| 8 | 4 | 45.67 | 64 | 34.5 | AF92U |

**Description:** Input table with 4 sample cohorts

---

## Sheet 3: table_mortality_rate

Mortality rates by age for different tables.

| A (age) | B (AM92U) | C (AF92U) |
|---------|-----------|-----------|
| age | AM92U | AF92U |
| 17 | 0.0006 | 0.000172 |
| 18 | 0.000594 | 0.000178 |
| 19 | 0.000587 | 0.000185 |
| ... | ... | ... |
| 104 | ~1.0 | ~1.0 |

**Description:** 88 rows of mortality data (ages 17-104) for male (AM92U) and female (AF92U) tables

---

## Sheet 4: table_spot_rate

Discount rates by projection step.

| A (step) | B (rate) |
|----------|----------|
| step | rate |
| 0 | 0.0565... |
| 1 | 0.0511... |
| 2 | 0.0503... |
| ... | ... |
| 120 | ~0.05-0.06 |

**Description:** 121 rows of spot rates (steps 0-120)

---

## Sheet 5: calc_cohort

Cohort-level variable calculations using INDEX/MATCH formulas.

Headers (Row 1):

| A | B | C | D | E |
|---|---|---|---|---|
| cohort | annual_annuity_amount | annuity_start_age | current_age | mortality_table |

Data (Row 2, Cohort 1):

| Column | Formula | Value |
|--------|---------|-------|
| A | 1 | 1 |
| B | `=INDEX(table_cohort_data!A:E,MATCH($A2,table_cohort_data!A:A,0),MATCH(B$1,table_cohort_data!1:1,0))` | 12.34 |
| C | `=INDEX(table_cohort_data!A:E,MATCH($A2,table_cohort_data!A:A,0),MATCH(C$1,table_cohort_data!1:1,0))` | 61 |
| D | `=INDEX(table_cohort_data!A:E,MATCH($A2,table_cohort_data!A:A,0),MATCH(D$1,table_cohort_data!1:1,0))` | 31.2 |
| E | `=INDEX(table_cohort_data!A:E,MATCH($A2,table_cohort_data!A:A,0),MATCH(E$1,table_cohort_data!1:1,0))` | AM92U |

**Description:** Single row for cohort 1, pulling data from table_cohort_data using INDEX/MATCH

---

## Sheet 6: calc_cohort_step

Step-by-step calculations for cohort 1 over 12 months.

Headers (Row 1):

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| step | attained_age | attained_age_years_floor | annual_mortality_rate | monthly_survival_rate | survival_to_start_of_step | payable_at_start_of_step | payment_indicator | cashflow | spot_rate | discount_factor | discounted_cashflow |

Sample formulas (Row 2, Step 0):

| Column | Variable | Formula | Value |
|--------|----------|---------|-------|
| A | step | 0 | 0 |
| B | attained_age | `=calc_cohort!D$2+constant!$B$1*A2` | 31.2 |
| C | attained_age_years_floor | `=INT(B2)` | 31 |
| D | annual_mortality_rate | `=INDEX(table_mortality_rate!A:C,MATCH(C2,table_mortality_rate!A:A,0),MATCH(calc_cohort!$E$2,table_mortality_rate!1:1,0))` | 0.000602 |
| E | monthly_survival_rate | `=(1-D2)^constant!$B$1` | 0.999950 |
| F | survival_to_start_of_step | `=1` (first row) or `=F1*E2` (subsequent) | 1 |
| G | payable_at_start_of_step | `=B2>=calc_cohort!C$2` | FALSE (0) |
| H | payment_indicator | `=IF(G2,1,0)` | 0 |
| I | cashflow | `=calc_cohort!$B$2*constant!$B$1*F2*H2` | 0 |
| J | spot_rate | `=INDEX(table_spot_rate!B$1:B$121,MATCH(A2,table_spot_rate!A$1:A$121,0))` | 0.0565 |
| K | discount_factor | `=(1+J2)^(-A2*constant!$B$1)` | 1 |
| L | discounted_cashflow | `=K2*I2` | 0 |

**Description:** 12 rows (steps 0-11) calculating monthly values with recursive formulas

---

## Key Formula Patterns

### INDEX/MATCH for table lookup:
```excel
=INDEX(table_name!A:E,MATCH($A2,table_name!A:A,0),MATCH(B$1,table_name!1:1,0))
```
- Looks up row by matching cohort ID in column A (entire column A:A)
- Looks up column by matching header in row 1 (header row only 1:1)
- Uses dynamic ranges (A:E) that automatically expand when tables grow
- Returns intersection value

### Cross-sheet references:
```excel
=calc_cohort!D$2+constant!$B$1*A2
```
- References other sheets using `sheet_name!cell`
- Uses mixed references ($A$2, $A2, A$2, A2)

### Recursive formulas:
```excel
=IF(A2=0,1,F1*E2)
```
- First row: returns 1
- Subsequent rows: multiply previous row value by current row factor

### INT for floor:
```excel
=INT(B2)
```
- Compatible with Excel and LibreOffice Calc
- Alternative to FLOOR.MATH

---

## Cell Reference Types

| Type | Example | Meaning |
|------|---------|---------|
| Absolute | $A$1 | Fixed row and column |
| Mixed (col) | $A1 | Fixed column, relative row |
| Mixed (row) | A$1 | Relative column, fixed row |
| Relative | A1 | Relative row and column |

Used strategically for formula copying:
- `$A2` - Fixed column for row lookups
- `B$1` - Fixed row for column headers
- `$A$1:$E$8` - Fixed range for table data

---

## Summary

The reference spreadsheet demonstrates:
1. **Multiple sheets** organized by purpose
2. **INDEX/MATCH** for flexible table lookups
3. **Cross-sheet references** for modular calculations
4. **Recursive formulas** for time-series calculations
5. **Mixed cell references** for efficient formula copying
6. **Compatible functions** that work in Excel and LibreOffice

This structure matches the output of the "Render model as spreadsheet" feature implemented in v1.7.2.
