# model-editor

A constrained editor for navigating and modifying large declarative models.

The editor is for models that are:
- declarative text (XML),
- highly interdependent,
- large, and difficult to change safely at scale.

The editor makes structural relationships explicit: variable dependencies, precedents, dependants, and diffs between model versions.

---

## What’s here

- **The editor**  
  A single-page web tool for exploring and editing models under structural constraints.

- **A small example model (restaurant)**  
  Human-scale, familiar, and intentionally simple — used to explain how the editor works.

- **A large synthetic model**  
  Domain-neutral, structurally realistic, and deliberately complex — included to show why such an editor becomes necessary.

The models exist to demonstrate the editor, not as standalone simulations.

---

## What this demonstrates

- Working with large declarative models
- Dependency analysis and visualisation
- Constrained editing and model validity 



'''
model-editor/
│
├─ README.md
├─ LICENSE
│
├─ editor/
│   ├─ index.html
│   ├─ js/
│   └─ css/
│
├─ models/
│   ├─ restaurant/
│   │   ├─ README.md
│   │   └─ restaurant.xml
│   │
│   └─ synthetic/
│       ├─ README.md
│       ├─ synthetic-model.xml
│       └─ generated/
│
└─ docs/
    └─ screenshots/
