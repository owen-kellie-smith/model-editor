# Examples

This folder contains example models and the single language definition which satisfied all of them.

The models are arranged in order of increasing structural complexity.  
Structural complexity refers to the number and interaction of the model components described below.

---

## Model Components

Models in this folder are composed from the following structural elements:

- **Variables**  
  Named quantities defined as constants or as expressions that refer to tables or other variables.  
  Expressions may be conditional (piecewise) and may refer to different index values.

- **Tables**  
  Definitions that specify the structure of values that may be retrieved in expressions.

- **Index sets**  
  Sets whose members label instances of a variable.  
  At most one integer index set may serve as the time step.


---

## Structural Progression

### 1. Restaurant cashflow [restaurantNoIndices.xml](restaurant-model)  

Components present:

- Variables  

Components absent:

- Indices
- Tables  
- Time-step recurrence  

---

### 2. Airline cashflow [airline_no_seasons.xml](airline-model)

Additional components introduced:
- Time index
- Conditional (piecewise) expressions  

---

### 3. Annuity cashflow [vendor-format-model.xml](annuity-model)  `

Additional components introduced:

- Cohort index (enabling model point file where each row represents the constants for a cohort)  
- Time-step recurrence  

---

### 4. Airline cashflow with seasons [airline_with_seasons.xml](airline-model)

Further structural density:

- More frequent conditional expressions  

---

### 5. Non-linear dynamics [moon-rocket.xml and lorenz-difference.xml](rocket-model)  

Explicit state evolution:

- Time-step recurrence  
- Cross-time references between variable instances  

---

### 6. Restaurant with seasons [seasonal.xml](restaurant-model)  

- Large variable set  
- Extensive conditional expressions   

---

## Language Definition

`language.xml` lists terms that are ignored when the editor searches for missing variable references.

