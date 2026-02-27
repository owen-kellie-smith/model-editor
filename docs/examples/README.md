# Examples

This folder contains example models and the language definition used by the editor.

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

### 1. Restaurant — base model  
`restaurant-model/model.xml`

Components present:

- Variables  
- A single index set  

Components absent:

- Tables  
- Time-step recurrence  
- Extensive conditional definitions  

---

### 2. Annuity  
`annuity-model/vendor-format-model.xml`

Additional components introduced:

- Tables  
- Conditional (piecewise) expressions  
- Time-step recurrence  
- Multiple index sets  

---

### 3. Airline — base model  
`airline-model/model.xml`

Increased scale and interaction:

- Larger variable set  
- Multiple index sets  
- Limited conditional expressions  

---

### 4. Airline — variant  
`airline-model/Dividends.xml`

Further structural density:

- More frequent conditional expressions  
- Alternative configuration of the airline base model  

---

### 5. Rocket  
`rocket-model/moon-rocket.xml`

Explicit state evolution:

- Time-step recurrence  
- Cross-time references between variable instances  

---

### 6. Restaurant — seasonal variant  
`restaurant-model/seasonal.xml`

Highest structural density in this folder:

- Large variable set  
- Extensive conditional expressions  
- Dense dependency structure  

---

## Language Definition

`language.xml` lists terms that are ignored when the editor searches for missing variable references.

