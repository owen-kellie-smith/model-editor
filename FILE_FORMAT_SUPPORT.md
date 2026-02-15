# File Format Support - model-editor

## Question: "What kind of spreadsheet file CAN you read?"

## Answer: The model-editor CANNOT read spreadsheet files

---

## Supported File Formats

### INPUT (What the application CAN READ)
```
✅ XML files (.xml)
   - language.xml: Function definitions with arities
   - model.xml: Variable definitions, relationships, formulas
   
❌ Spreadsheet files
   - Excel (.xlsx, .xls)
   - CSV (.csv)
   - OpenDocument (.ods)
   - NOT SUPPORTED FOR INPUT
```

### OUTPUT (What the application CAN WRITE)
```
✅ XML files (.xml)
   - Export language definitions
   - Export model definitions
   
✅ Excel files (.xlsx)
   - Multi-sheet workbooks
   - Working formulas with cell references
   - Sample data for calculations
   - Generated via "Render model as spreadsheet" button
   
✅ Image files
   - SVG: Dependency graphs (vector)
   - PNG: Dependency graphs (raster)
```

---

## Data Flow

```
┌─────────────────┐
│   User Input    │
│   (XML files)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  model-editor   │
│  Validate       │
│  Analyze        │
│  Visualize      │
└────────┬────────┘
         │
         ├──────────────┐
         │              │
         ▼              ▼
┌─────────────┐  ┌──────────────┐
│ XML Export  │  │ Excel Export │
│ (2-way)     │  │ (1-way only) │
└─────────────┘  └──────────────┘
```

---

## Why can't it read spreadsheets?

The model-editor is designed for **declarative modeling**, not spreadsheet analysis:

1. **Purpose**: Edit and validate structured XML models
2. **Architecture**: XML-first, with spreadsheet as output format
3. **Philosophy**: Models define structure; spreadsheets visualize calculations

### Spreadsheet generation is ONE-WAY:
- XML Model → Excel Spreadsheet ✅
- Excel Spreadsheet → XML Model ❌

---

## If you have a spreadsheet and want to use the model-editor:

1. **Manually create XML model**: Define your variables and relationships in XML
2. **Load into editor**: Validate structure and dependencies
3. **Export to Excel**: Generate calculation-ready spreadsheet

The model-editor does not attempt to reverse-engineer model structure from spreadsheet formulas.

---

## Technical Details

### Reading XML Files
- File input: `<input type="file" accept=".xml">`
- Also supports: Paste XML text directly into textarea
- Parser: `@xmldom/xmldom` with `xpath`

### Writing Excel Files
- Library: ExcelJS v4.4.0 (loaded via CDN)
- Format: .xlsx (Office Open XML)
- Features: Multiple sheets, formulas, cell references
- Implementation: `docs/src/domain/spreadsheetRenderer.js`

---

## Version: 1.7.2
Last updated: 2026-02-15
