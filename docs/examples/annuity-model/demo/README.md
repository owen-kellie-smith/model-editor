# Annuity Model – Running With and Without External Data

The model-editor defines **model structure only** (formulas and rules).
It does not manage input data directly.

To ensure the exported model runs immediately, exports contain embedded sample input tables, which allow the exports to produce results without requiring any external files.

However, you can replace the sample inputs with real inputs in two ways:

---

## Using Your Own Data

### 1. Spreadsheet Export

After exporting to Excel, overwrite the generated input tables with your own data.
The model logic remains unchanged — only the input tables are replaced.

### 2. Python Export

Place CSV files named:

```
input_<table_name>.csv
```

in the same folder as the exported `.py` script.

If present, these `input_<table_name>.csv` files automatically override the embedded sample tables at runtime.

For example, for the model in `../vendor-format-model.xml`

```
input_cohort_data.csv
input_mortality_rate.csv
input_spot_rate.csv
```

Each CSV file must:

* Include a header row in row 1
* Match the expected column names exactly
* Contain only data rows from row 2 onwards (no metadata rows in between the header and the data rows)

If no CSV files are found, the model will use the embedded sample tables.

---


## Usage

See [How to run](../../../../README.md#how-to-run)

Example:

```
python3 annuity-model.py --steps 24
```

