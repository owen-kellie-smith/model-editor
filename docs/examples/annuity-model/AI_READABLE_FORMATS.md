# AI Assistant Spreadsheet Reading Capabilities

## Question: What format spreadsheets can YOU (the AI assistant) directly extract and read?

This document answers the question about what spreadsheet formats the AI assistant can directly read when inspecting reference files.

---

## Summary

**✅ Text-based formats (directly readable):**
- CSV (Comma-Separated Values)
- TSV (Tab-Separated Values)
- Excel 2003 XML (.xml)
- Plain text with delimiters

**❌ Binary/compressed formats (NOT directly readable):**
- XLSX (Excel 2007+)
- XLS (Excel 97-2003)
- ODS (OpenDocument Spreadsheet)

**⚠️ Workaround for XLSX/ODS:**
- Can extract using bash `unzip` command
- Then read internal XML files
- Requires manual extraction step

---

## Detailed Explanation

### 1. CSV (Comma-Separated Values) ✅

**Format:** Plain text, comma-delimited
**Extension:** .csv
**Can read directly:** YES

Example:
```csv
Variable,Value,Type
step_length,0.08333,constant
annual_annuity_amount,12.34,table
```

**Advantages:**
- Simple, universal format
- Human-readable
- No compression
- Works with any text viewer

### 2. TSV (Tab-Separated Values) ✅

**Format:** Plain text, tab-delimited
**Extension:** .tsv
**Can read directly:** YES

Example:
```tsv
Variable	Value	Type
step_length	0.08333	constant
annual_annuity_amount	12.34	table
```

### 3. Excel 2003 XML ✅

**Format:** Text-based XML
**Extension:** .xml
**Can read directly:** YES

Example:
```xml
<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Sheet1">
    <Table>
      <Row>
        <Cell><Data ss:Type="String">Variable</Data></Cell>
        <Cell><Data ss:Type="Number">0.08333</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>
```

**Advantages:**
- Human-readable XML
- Preserves formulas and formatting
- No compression required

### 4. XLSX (Excel 2007+) ❌ → ⚠️

**Format:** ZIP archive containing XML files
**Extension:** .xlsx
**Can read directly:** NO (compressed)
**Can extract then read:** YES

**Structure:**
```
spreadsheet.xlsx (ZIP archive)
├── xl/
│   ├── workbook.xml        ← Sheet structure (readable after extraction)
│   ├── sharedStrings.xml   ← Text values (readable after extraction)
│   ├── worksheets/
│   │   ├── sheet1.xml      ← Data and formulas (readable after extraction)
│   │   ├── sheet2.xml
│   │   └── ...
│   └── styles.xml          ← Formatting
├── _rels/                  ← Relationships
└── [Content_Types].xml
```

**To make readable:**
```bash
unzip spreadsheet.xlsx
# Then read xl/worksheets/*.xml files
```

### 5. XLS (Excel 97-2003) ❌

**Format:** Binary (BIFF format)
**Extension:** .xls
**Can read directly:** NO
**Workaround:** Convert to CSV or XML first

### 6. ODS (OpenDocument Spreadsheet) ❌ → ⚠️

**Format:** ZIP archive containing XML files
**Extension:** .ods
**Can read directly:** NO (compressed)
**Can extract then read:** YES (similar to XLSX)

---

## The Reference Spreadsheet Case

### File: `docs/examples/annuity-model/spreadsheet_rendered.xlsx`

**Format:** XLSX (ZIP compressed)
**Direct reading:** NO ❌
**Solution:** Extract internal XML files

### Sheet Structure (extracted from workbook.xml):

1. **constant** - Single row with step_length = 1/12
2. **table_cohort_data** - Cohort demographics
3. **table_mortality_rate** - Age-based mortality rates
4. **table_spot_rate** - Discount rates by step
5. **calc_cohort** - Cohort-level calculations
6. **calc_cohort_step** - Step-by-step calculations

### Example: Constant Sheet (extracted)

```xml
<row r="1">
  <c r="A1" s="0" t="s">
    <v>0</v>  <!-- "step_length" from sharedStrings[0] -->
  </c>
  <c r="B1" s="0" t="n">
    <f aca="false">1/12</f>
    <v>0.0833333333333333</v>
  </c>
</row>
```

**Interpretation:**
- Cell A1: "step_length" (text)
- Cell B1: Formula `=1/12`, Value `0.0833...`

### Example: calc_cohort Sheet (extracted)

```xml
<row r="2">
  <c r="A2" s="3" t="n"><v>1</v></c>  <!-- Cohort ID = 1 -->
  <c r="B2" s="0" t="n">
    <f>INDEX(table_cohort_data!A:E,MATCH($A2,table_cohort_data!A:A,0),MATCH(B$1,table_cohort_data!1:1,0))</f>
    <v>12.34</v>
  </c>
</row>
```

**Interpretation:**
- Uses INDEX/MATCH to lookup cohort data
- References the table_cohort_data sheet
- Returns value 12.34 (annual_annuity_amount)

---

## Recommendations

### For Documentation/Reference Files:

**Best format:** CSV
- Simple, universal
- Directly readable by AI
- Easy to diff in version control
- No special tools needed

**Alternative:** Excel 2003 XML
- Preserves formulas
- Readable as text
- More verbose than CSV

### For this Project:

**Current state:**
- Reference file is XLSX (binary/compressed)
- Requires extraction to inspect

**Suggested addition:**
- Provide CSV exports of key sheets
- Or document sheet structure in markdown
- Makes reference easier to inspect

---

## Conclusion

**Direct answer:** I can directly read **CSV, TSV, and Excel 2003 XML** formats.

**For XLSX files:** I need to extract the internal XML files first using bash commands, then I can read them.

**For this reference spreadsheet:** I can extract and read the XML content, but it requires an extra extraction step. Providing CSV versions would make inspection easier.

---

## Appendix: Converting XLSX to Readable Formats

### Method 1: Extract XML (works in this environment)
```bash
unzip -p spreadsheet.xlsx xl/worksheets/sheet1.xml
```

### Method 2: Convert to CSV (requires tools)
```bash
# Using LibreOffice (if available)
libreoffice --headless --convert-to csv spreadsheet.xlsx

# Using Python + openpyxl
python -c "import openpyxl; wb = openpyxl.load_workbook('file.xlsx'); ..."

# Using xlsx2csv (if available)
xlsx2csv spreadsheet.xlsx output.csv
```

### Method 3: Create CSV from start
When creating reference files, export to CSV alongside XLSX for easy inspection.
