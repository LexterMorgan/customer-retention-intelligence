# Excel Dashboard Final Build Plan

**Project:** Customer Retention Intelligence  
**Deliverable:** `excel/customer_retention_dashboard.xlsx`  
**Build method:** Python-generated scaffold followed by a native Microsoft Excel Desktop interactivity pass  
**Authoritative requirements:** `excel/EXCEL_DASHBOARD_PRD.md` plus this build plan  
**Status:** Final implementation blueprint; no workbook is created in this phase

---

## 1. Product Intent and Locked Decisions

The final workbook will present one polished, widescreen executive dashboard. It will not expose a collection of raw PivotTables to the portfolio viewer.

The dashboard story is fixed:

1. Churn severity through six filter-responsive KPI cards.
2. Churn concentration through a Contract × Tenure heatmap.
3. Associated characteristics and stated reasons through Internet Type and Top Reasons charts.
4. Retention attention through descriptive Risk Tier analysis.

### Locked simplifications

- Four final visuals only: one heatmap and three PivotCharts.
- Three slicers only: Contract, Tenure Band, and Internet Type.
- Six supporting PivotTables.
- Four workbook sheets.
- One Excel Table and one shared PivotCache.
- No VBA, macros, Power Query, Power Pivot/Data Model, external links, or additional dashboard pages.
- Helper fields are materialized by Python for PivotTable reliability; their exact logic remains documented and auditable.
- The dashboard heatmap is a polished formula display grid driven by a hidden support PivotTable. The raw PivotTable does not appear on the dashboard.

### Reference-level presentation target

The automated workbook must already look like a designed dashboard before any native Excel objects are added. Phase A is responsible for approximately 80–90% of the final visual presentation.

The visual reading order is:

**FILTERS → KPIs → BUSINESS DRIVERS → RETENTION OPPORTUNITIES**

Phase A must establish:

- one cohesive `A1:X46` canvas rather than visibly separate worksheet regions;
- a strong full-width executive header;
- a compact, visually integrated filter band;
- six prominent KPI cards with consistent gutters;
- white analytical panels over a light-neutral background;
- fixed panel titles, subtitles, caveats, and inner chart bounds;
- consistent outer margins, internal padding, aligned edges, and vertical rhythm;
- fully styled chart placeholders that show exactly where native charts will land;
- a complete heatmap, not a technical placeholder;
- minimal spreadsheet chrome.

Native PivotCharts must be placed inside prepared containers and have their own chart titles removed. The panel title, note, background, and border are created by Python so each chart reads as part of the composition rather than as a floating Excel object.

The design may use modern churn-dashboard references as a quality, density, hierarchy, and composition benchmark, but it must not copy a reference layout or visual identity.

### Benchmark lock

The unfiltered workbook must reproduce:

- Total Customers: 7,043
- Existing Customers: 6,589
- Churned Customers: 1,869
- Retained Customers: 4,720
- Joined Customers: 454
- Churn Rate: 28.37%
- Retention Rate: 71.63%
- Monthly Recurring Value Lost: $137,086.65

Joined customers remain in the source table but are excluded from churn and retention denominators.

---

## 2. Hybrid Build Architecture

### Phase A — Cursor/Python automation

Python will create the complete non-pivot workbook scaffold:

- Validate the source data and all locked benchmarks.
- Add the approved workbook-only helper fields in memory.
- Create all four worksheets.
- Embed the data as `tblCustomers`.
- Create the dashboard canvas, fixed layout, labels, KPI card shells, heatmap display grid, notes, and chart placeholders.
- Complete the executive header, filter band, panel containers, spacing system, and chart-title/note treatments so the pre-native workbook is presentation-ready.
- Create the calculation and QA layer.
- Add formulas, defined names, number formats, conditional formatting, dimensions, print settings, and sheet visibility defaults.
- Add exact native-build instructions to the support sheet.
- Save the workbook at the final target path.

The automated build should use `pandas` plus XlsxWriter. XlsxWriter is selected for reliable table creation, formatting, merged-cell layout, formulas, named ranges, and conditional formatting. It must not be used to synthesize PivotTable or slicer XML.

### Phase B — Microsoft Excel Desktop for Mac

Excel Desktop will perform only the native capabilities that Python libraries cannot reliably create:

- Create one PivotCache and six PivotTables.
- Create three PivotCharts.
- Create three slicers.
- Connect each slicer to all six PivotTables.
- Apply native PivotTable field settings, filters, and sorting.
- Move and format PivotCharts in prepared dashboard placeholders.
- Refresh, recalculate, test, save, close, and reopen.

### Native-object preservation rule

After the first PivotTable or slicer is created, the workbook must never be saved again by openpyxl or XlsxWriter. All later edits and saves occur in Microsoft Excel Desktop.

---

## 3. Final Workbook Architecture

### `01_Dashboard`

**Visibility:** Visible; active sheet on open.  
**Purpose:** Sole portfolio-facing experience.  
**Objects:**

- Title, subtitle, source/scope note.
- Three slicers.
- Six KPI cards linked to named calculation cells.
- Formula-driven Contract × Tenure heatmap with rate and volume.
- Three PivotCharts.
- Three concise interpretation notes.
- Footer methodology note.

**Viewer interaction:** Yes. The portfolio viewer interacts only with this sheet.

### `02_Pivots`

**Visibility:** Hidden after native build and QA; ordinary hidden, not very hidden.  
**Purpose:** Shared-cache PivotTable support.  
**Objects:**

- `PT_KPI_Context`
- `PT_InternetType`
- `PT_ChurnReasons`
- `PT_RiskTier`
- `PT_RiskTierVolume`
- `PT_ContractTenure`

**Viewer interaction:** No. It may be unhidden for audit.

### `03_Calculations`

**Visibility:** Hidden after native build and QA; ordinary hidden.  
**Purpose:** Formula, named-range, benchmark, QA, and build-instruction layer.  
**Objects:**

- Current filter-responsive KPI formulas.
- Baseline values and variance checks.
- Total/Joined denominator QA.
- High-risk intersection QA.
- Helper-field definitions.
- Compact native Excel build checklist.
- Risk-tier volume extraction formulas.

**Viewer interaction:** No. It may be unhidden for audit.

### `04_Data`

**Visibility:** Hidden after native build and QA; ordinary hidden.  
**Purpose:** Embedded customer-level source.  
**Objects:**

- Excel Table `tblCustomers`.
- 46 canonical source fields.
- Nine workbook-only helper fields.

**Viewer interaction:** No. It may be unhidden for audit.

### No README sheet

A fifth README sheet would add navigation and maintenance overhead without improving the one-dashboard experience. Usage notes appear on the dashboard; build and audit notes appear in `03_Calculations`.

---

## 4. Source Table and Helper Fields

### Source table

- **Name:** `tblCustomers`
- **Sheet:** `04_Data`
- **Top-left cell:** `A1`
- **Expected data rows:** 7,043
- **Header row:** 1
- **Expected final range:** `A1:BC7044`
- **Columns:** 46 source fields + 9 workbook helpers = 55 columns
- **Range strategy:** Determine the final table range dynamically from the validated dataframe, then assert that it resolves to 7,043 rows and 55 columns.
- **External connection:** None. The source data is embedded.
- **Table style:** A restrained medium-light table style; banded rows on; first/last-column emphasis off.
- **Structured references:** Used in QA formulas and documented helper formulas. KPI display formulas use named ranges and `GETPIVOTDATA`.

### Source loading rule

Load the CSV with literal `None` preserved as the valid Offer category:

```python
pd.read_csv(path, keep_default_na=False, na_values=[""])
```

### Materialized helper fields

Python calculates and writes helper values rather than unevaluated Excel formulas. This ensures the first native PivotCache reads stable values immediately.

| Helper field | Locked logic |
|---|---|
| `Existing_Flag` | 1 when Customer Status is Churned or Stayed; otherwise 0 |
| `Churn_Rate_Value` | `Is_Churned` for existing customers; blank for Joined |
| `Retention_Rate_Value` | `Is_Retained` for existing customers; blank for Joined |
| `MRVL_Row` | Monthly Charge when Churned; otherwise 0 |
| `Tenure_Band_Sort` | 1 through 6 in canonical lifecycle order |
| `Tenure_Band_Slicer` | Sort-safe display label such as `01 | 0-6 months` through `06 | 49-72 months` |
| `Risk_Points` | Approved five-factor rule |
| `Descriptive_Churn_Risk_Tier` | Very High / High / Medium / Low using approved thresholds |
| `Risk_Tier_Sort` | 1 through 4 in Very High → Low order |

`Tenure_Band_Slicer` is a display-only workbook helper. It does not change the canonical `Tenure_Band` field or its boundaries. Its numeric prefix guarantees correct slicer order on Excel for Mac without requiring the Data Model.

### Documented equivalent Excel formulas

Store these as text in `03_Calculations` for audit:

```excel
=--OR([@[Customer Status]]="Churned",[@[Customer Status]]="Stayed")
```

```excel
=IF([@Existing_Flag]=1,[@Is_Churned],"")
```

```excel
=IF([@Existing_Flag]=1,[@Is_Retained],"")
```

```excel
=IF([@Is_Churned]=1,[@[Monthly Charge]],0)
```

```excel
=SWITCH([@Tenure_Band],"0-6 months",1,"7-12 months",2,"13-24 months",3,"25-36 months",4,"37-48 months",5,"49-72 months",6)
```

```excel
=IF([@Contract]="Month-to-Month",3,0)
 +IF([@Tenure_Band]="0-6 months",3,0)
 +IF([@[Internet Type]]="Fiber Optic",2,0)
 +IF([@[Number of Dependents]]=0,1,0)
 +IF([@Married]="No",1,0)
```

```excel
=IF([@Risk_Points]>=6,"Very High",IF([@Risk_Points]>=4,"High",IF([@Risk_Points]>=2,"Medium","Low")))
```

### Refresh strategy

- The final workbook contains a static embedded snapshot, not a live connection.
- Native PivotTables use `tblCustomers` as their source.
- Enable **Refresh data when opening the file** on `PT_KPI_Context`; copied pivots share its cache.
- Use **Data > Refresh All** after any source-table replacement.
- If the repository CSV changes, rerun the Python build from the source and repeat the native pass. Do not paste new rows into the final workbook as the primary refresh workflow.

---

## 5. Six-Card KPI System

All six cards are sourced from one PivotTable, `PT_KPI_Context`, connected to all three slicers.

### Supporting PivotTable values

`PT_KPI_Context` contains:

- Sum of `Existing_Flag`, captioned `Existing Customers`
- Sum of `Is_Churned`, captioned `Churned Customers`
- Sum of `Is_Retained`, captioned `Retained Customers`
- Sum of `MRVL_Row`, captioned `Monthly Recurring Value Lost`

The two rate cards are calculated as external ratios of slicer-filtered PivotTable values. No Pivot calculated field is required.

### KPI calculation block

Use `03_Calculations!C5:C10`:

```excel
C5 =IFERROR(GETPIVOTDATA("Existing Customers",'02_Pivots'!$A$3),0)
C6 =IFERROR(GETPIVOTDATA("Churned Customers",'02_Pivots'!$A$3),0)
C7 =IFERROR(GETPIVOTDATA("Retained Customers",'02_Pivots'!$A$3),0)
C8 =IF(C5=0,NA(),C6/C5)
C9 =IF(C5=0,NA(),C7/C5)
C10=IFERROR(GETPIVOTDATA("Monthly Recurring Value Lost",'02_Pivots'!$A$3),0)
```

Define:

- `kpiExisting` → `03_Calculations!$C$5`
- `kpiChurned` → `03_Calculations!$C$6`
- `kpiRetained` → `03_Calculations!$C$7`
- `kpiChurnRate` → `03_Calculations!$C$8`
- `kpiRetentionRate` → `03_Calculations!$C$9`
- `kpiMRVL` → `03_Calculations!$C$10`

Dashboard value cells reference these names. Apply custom display formats that show an em dash for error/empty states where possible; do not convert the calculation cells to text.

### Card specifications

| Display name | Meaning | Source fields | Aggregation/formula | Denominator | Baseline | Format | Slicer response | Mechanism |
|---|---|---|---|---|---:|---|---|---|
| Existing Customers | Churned + Stayed in filter context | Existing_Flag | Sum | None | 6,589 | `#,##0` | Yes | GETPIVOTDATA from PT_KPI_Context |
| Churned Customers | Churned in filter context | Is_Churned | Sum | None | 1,869 | `#,##0` | Yes | GETPIVOTDATA |
| Retained Customers | Stayed in filter context | Is_Retained | Sum | None | 4,720 | `#,##0` | Yes | GETPIVOTDATA |
| Churn Rate | Share of existing customers who churned | Is_Churned, Existing_Flag | Churned / Existing | Existing only; Joined excluded | 28.37% | `0.0%` card; `0.00%` QA | Yes | External ratio of two GETPIVOTDATA results |
| Retention Rate | Share of existing customers who stayed | Is_Retained, Existing_Flag | Retained / Existing | Existing only; Joined excluded | 71.63% | `0.0%` card; `0.00%` QA | Yes | External ratio |
| Monthly Recurring Value Lost | Monthly charges associated with churned customers | MRVL_Row | Sum | Churned rows only | $137,086.65 | `$#,##0` card; `$#,##0.00` QA | Yes | GETPIVOTDATA |

### Secondary benchmark context

Display in the subtitle/footer, not as primary cards:

- Total customers: 7,043
- Joined this period: 454

These are baseline context labels and are not required to respond to slicers.

---

## 6. Final Visual Inventory

The final visual count is four:

1. Contract × Tenure Churn Concentration heatmap.
2. Churn Rate by Internet Type PivotChart.
3. Top 5 Stated Churn Reasons PivotChart.
4. Descriptive Churn Risk Tiers PivotChart with adjacent dynamic volume labels.

### Visual 1 — Contract × Tenure Churn Concentration

- **Dashboard title:** Contract × Tenure Churn Concentration
- **Display type:** Formula presentation grid with conditional formatting, driven by `PT_ContractTenure`
- **Business question:** Where is churn concentrated across commitment and lifecycle?
- **Source fields:** Contract, Tenure_Band, Churn_Rate_Value, Existing_Flag
- **Pivot Rows:** Tenure_Band
- **Pivot Columns:** Contract
- **Pivot Values:** Average Churn_Rate_Value; Sum Existing_Flag
- **Pivot Filters:** None
- **Aggregation:** Average for rate; Sum for volume
- **Sorting:** Tenure in canonical 0–6 through 49–72 order; Contract in Month-to-Month, One Year, Two Year order
- **Display number formats:** `0.0%` rate; custom `"n="#,##0` volume
- **Slicer behavior:** Fully connected. Fixed display grid cells return blank when their category is excluded by a slicer.
- **PivotTable source:** `PT_ContractTenure`
- **PivotChart:** None

### Visual 2 — Churn Rate by Internet Type

- **Dashboard title:** Churn Rate by Internet Type
- **Chart type:** 2-D Clustered Bar PivotChart
- **Business question:** Which internet technology is associated with elevated churn?
- **Source fields:** Internet Service, Internet Type, Churn_Rate_Value
- **Pivot Rows:** Internet Type
- **Pivot Columns:** None
- **Pivot Values:** Average Churn_Rate_Value, caption `Churn Rate`
- **Pivot Filters:** Internet Service = Yes
- **Aggregation:** Average
- **Sorting:** Descending by Churn Rate
- **Number format:** `0.0%`
- **Slicer behavior:** Fully connected. Internet Type = N/A produces a clean empty chart because the pivot also requires Internet Service = Yes.
- **PivotTable source:** `PT_InternetType`
- **PivotChart name:** `PC_InternetType`

### Visual 3 — Top 5 Stated Churn Reasons

- **Dashboard title:** Top 5 Stated Churn Reasons
- **Chart type:** 2-D Clustered Bar PivotChart
- **Business question:** What do churned customers most often say about why they left?
- **Source fields:** Customer Status, Churn Reason, Customer ID
- **Pivot Rows:** Churn Reason
- **Pivot Columns:** None
- **Pivot Values:** Count Customer ID, caption `Churned Customers`
- **Pivot Filters:** Customer Status = Churned
- **Aggregation:** Count
- **Sorting:** Descending; Top 5 items by Churned Customers
- **Number format:** `#,##0`
- **Slicer behavior:** Fully connected; always remains churned-only.
- **PivotTable source:** `PT_ChurnReasons`
- **PivotChart name:** `PC_ChurnReasons`

### Visual 4 — Descriptive Churn Risk Tiers

- **Dashboard title:** Descriptive Churn Risk Tiers
- **Chart type:** 2-D Clustered Bar PivotChart plus a formula-linked volume column
- **Business question:** Which rule-based segments combine elevated churn with meaningful customer volume?
- **Source fields:** Descriptive_Churn_Risk_Tier, Churn_Rate_Value, Existing_Flag
- **Rate Pivot Rows:** Descriptive_Churn_Risk_Tier
- **Rate Pivot Values:** Average Churn_Rate_Value, caption `Churn Rate`
- **Volume Pivot Rows:** Descriptive_Churn_Risk_Tier
- **Volume Pivot Values:** Sum Existing_Flag, caption `Existing Customers`
- **Filters:** None
- **Aggregation:** Average rate; Sum volume
- **Sorting:** Manual Very High, High, Medium, Low
- **Number formats:** `0.0%` and `#,##0`
- **Slicer behavior:** Both rate and volume pivots are fully connected.
- **PivotTable sources:** `PT_RiskTier`, `PT_RiskTierVolume`
- **PivotChart name:** `PC_RiskTier`

The adjacent volume block is fixed:

| Dashboard range | Tier label | Formula |
|---|---|---|
| `W34:X34` / `W35:X35` | Very High | `=IFERROR(GETPIVOTDATA("Existing Customers",'02_Pivots'!$F$38,"Descriptive_Churn_Risk_Tier","Very High"),0)` |
| `W36:X36` / `W37:X37` | High | `=IFERROR(GETPIVOTDATA("Existing Customers",'02_Pivots'!$F$38,"Descriptive_Churn_Risk_Tier","High"),0)` |
| `W38:X38` / `W39:X39` | Medium | `=IFERROR(GETPIVOTDATA("Existing Customers",'02_Pivots'!$F$38,"Descriptive_Churn_Risk_Tier","Medium"),0)` |
| `W40:X40` / `W41:X41` | Low | `=IFERROR(GETPIVOTDATA("Existing Customers",'02_Pivots'!$F$38,"Descriptive_Churn_Risk_Tier","Low"),0)` |

Merge each listed label/value range across columns W:X. Format values as `#,##0` and add the small heading **Existing** above the block.

---

## 7. Contract × Tenure Heatmap Design

### Selected mechanism

Use a hidden native PivotTable plus a dashboard formula display grid.

This is more reliable and more polished than placing a raw PivotTable on the dashboard:

- The hidden PivotTable supplies native slicer context.
- `GETPIVOTDATA` supplies stable rate and volume values to fixed dashboard locations.
- The dashboard remains visually stable when slicers hide categories.
- The presentation grid can use wide cells, controlled typography, and fixed analytical colors.
- Raw PivotTable headers, expand/collapse buttons, and field artifacts remain off the user-facing sheet.

### Support PivotTable

`PT_ContractTenure`:

- Source: `tblCustomers`
- Destination: `02_Pivots!A52`
- Rows: Tenure_Band
- Columns: Contract
- Values:
  - Average Churn_Rate_Value → `Churn Rate`
  - Sum Existing_Flag → `Existing Customers`
- Subtotals: Off
- Grand totals: Off

### Dashboard grid

- Overall range: `A16:P30`
- Title: `A16:P16`
- Contract headers: `E18:H18`, `I18:L18`, `M18:P18`
- Tenure labels: six two-row blocks in `A19:D30`
- Rate cells: top row of each block
- Volume cells: bottom row of each block

For each canonical Tenure × Contract combination, use:

```excel
=IFERROR(
 GETPIVOTDATA(
  "Churn Rate",
  '02_Pivots'!$A$52,
  "Tenure_Band",$A19,
  "Contract",E$18
 ),
 ""
)
```

and:

```excel
=IFERROR(
 GETPIVOTDATA(
  "Existing Customers",
  '02_Pivots'!$A$52,
  "Tenure_Band",$A19,
  "Contract",E$18
 ),
 ""
)
```

Python must generate each formula with the exact tenure and contract labels or stable label-cell references.

### Formatting

- Rate format: `0.0%`
- Volume format: `"n="#,##0`
- Rate cells: fixed two-color scale from 0 to 1
  - Minimum: `0`, warm white `#FFF9F4`
  - Maximum: `1`, muted red `#C94C4C`
- Volume cells: white/light-neutral fill and charcoal text
- Thin white gutters between cells
- Center alignment
- No icons, data bars, totals, or legends
- Empty cells: blank fill and blank value; no zero label

### Filter behavior

- All three slicers connect to `PT_ContractTenure`.
- If Contract or Tenure selection excludes a fixed grid category, that category cell becomes blank rather than shifting position.
- Internet Type filters all heatmap rates and volumes.
- Joined rows remain excluded from rate through blank `Churn_Rate_Value`; volume uses `Existing_Flag`.

---

## 8. Interactivity Architecture

### Slicer 1 — Contract

- **Field:** Contract
- **Display title:** Contract
- **Position:** `A4:H7`
- **Layout:** Three buttons in one column or three compact columns, whichever fits the generated placeholder
- **Selection:** Single-select by normal click; multi-select via slicer multi-select control or Command-click
- **Affected PivotTables:** All six
- **Affected PivotCharts:** All three
- **Affected KPIs:** All six

### Slicer 2 — Tenure Band

- **Field:** Tenure_Band_Slicer
- **Display title:** Tenure Band
- **Position:** `I4:P7`
- **Layout:** Six buttons in two columns
- **Selection:** Single- and multi-select
- **Order:** `01 | 0-6 months` through `06 | 49-72 months`
- **Affected PivotTables:** All six
- **Affected PivotCharts:** All three
- **Affected KPIs:** All six

### Slicer 3 — Internet Type

- **Field:** Internet Type
- **Display title:** Internet Type
- **Position:** `Q4:X7`
- **Layout:** Four buttons in two columns
- **Selection:** Single- and multi-select
- **Affected PivotTables:** All six
- **Affected PivotCharts:** All three
- **Affected KPIs:** All six
- **Special state:** Selecting N/A intentionally empties the internet-only chart while the rest of the dashboard shows no-internet customers.

### Complete slicer connection matrix

| Slicer | Existing KPI | Churned KPI | Retained KPI | Churn Rate KPI | Retention Rate KPI | MRVL KPI | Contract × Tenure | Internet Type | Top 5 Reasons | Risk Tiers |
|---|---|---|---|---|---|---|---|---|---|---|
| Contract | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED |
| Tenure Band | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED |
| Internet Type | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED | CONNECTED |

There are no intentionally disconnected dashboard objects. Internally, all six KPI cells depend on the one connected `PT_KPI_Context` PivotTable.

---

## 9. PivotTable and PivotChart Inventory

All six PivotTables must be created by copying the first PivotTable so they share one PivotCache.

### `PT_KPI_Context`

- **Source:** `tblCustomers`
- **Destination:** `02_Pivots!A3`
- **Rows:** None
- **Columns:** None
- **Values:**
  - Sum Existing_Flag → Existing Customers
  - Sum Is_Churned → Churned Customers
  - Sum Is_Retained → Retained Customers
  - Sum MRVL_Row → Monthly Recurring Value Lost
- **Filters:** None
- **Calculation:** Sum
- **Sort:** Not applicable
- **Formatting:** `#,##0`; MRVL `$#,##0.00`
- **Slicers:** Contract, Tenure Band, Internet Type
- **Dashboard object:** Six KPI cards

### `PT_InternetType`

- **Source:** Shared cache from `tblCustomers`
- **Destination:** `02_Pivots!A12`
- **Rows:** Internet Type
- **Columns:** None
- **Values:** Average Churn_Rate_Value → Churn Rate
- **Filters:** Internet Service = Yes
- **Calculation:** Average
- **Sort:** Descending by Churn Rate
- **Formatting:** `0.0%`
- **Slicers:** All three
- **Dashboard object:** `PC_InternetType`

### `PT_ChurnReasons`

- **Source:** Shared cache
- **Destination:** `02_Pivots!A24`
- **Rows:** Churn Reason
- **Columns:** None
- **Values:** Count Customer ID → Churned Customers
- **Filters:** Customer Status = Churned
- **Calculation:** Count
- **Sort:** Descending; Top 5 value filter
- **Formatting:** `#,##0`
- **Slicers:** All three
- **Dashboard object:** `PC_ChurnReasons`

### `PT_RiskTier`

- **Source:** Shared cache
- **Destination:** `02_Pivots!A38`
- **Rows:** Descriptive_Churn_Risk_Tier
- **Columns:** None
- **Values:** Average Churn_Rate_Value → Churn Rate
- **Filters:** None
- **Calculation:** Average
- **Sort:** Manual Very High, High, Medium, Low
- **Formatting:** `0.0%`
- **Slicers:** All three
- **Dashboard object:** `PC_RiskTier`

### `PT_RiskTierVolume`

- **Source:** Shared cache
- **Destination:** `02_Pivots!F38`
- **Rows:** Descriptive_Churn_Risk_Tier
- **Columns:** None
- **Values:** Sum Existing_Flag → Existing Customers
- **Filters:** None
- **Calculation:** Sum
- **Sort:** Manual Very High, High, Medium, Low
- **Formatting:** `#,##0`
- **Slicers:** All three
- **Dashboard object:** Dynamic volume labels beside `PC_RiskTier`

### `PT_ContractTenure`

- **Source:** Shared cache
- **Destination:** `02_Pivots!A52`
- **Rows:** Tenure_Band
- **Columns:** Contract
- **Values:**
  - Average Churn_Rate_Value → Churn Rate
  - Sum Existing_Flag → Existing Customers
- **Filters:** None
- **Calculation:** Average and Sum
- **Sort:** Canonical Tenure and Contract order
- **Formatting:** `0.0%`, `#,##0`
- **Slicers:** All three
- **Dashboard object:** Formula heatmap display grid

### PivotCharts

| PivotChart name | Source PivotTable | Type | Dashboard range | Legend | Labels |
|---|---|---|---|---|---|
| `PC_InternetType` | PT_InternetType | 2-D Clustered Bar | `Q16:X30` | Hidden | Outside End, `0.0%` |
| `PC_ChurnReasons` | PT_ChurnReasons | 2-D Clustered Bar | `A34:M42` | Hidden | Outside End, `#,##0` |
| `PC_RiskTier` | PT_RiskTier | 2-D Clustered Bar | `N34:V42` | Hidden | Outside End, `0.0%` |

Risk-tier volume labels occupy `W34:X41`.

`PC_InternetType` uses the inner plot area `Q18:X29`; `Q16:X17` is the Python-created panel title band and row 30 is the note band. The table above names the full Internet panel for composition purposes.

---

## 10. Dashboard UX and Layout

### Canvas

- **Visible dashboard area:** `A1:X46`
- **Target zoom:** 85–90%
- **Freeze panes:** None
- **Scroll area target:** Presentation fits without horizontal scrolling on a normal laptop display.
- **Active cell on open:** `A1`

### Component coordinates

| Component | Range / position |
|---|---|
| Title | `A1:P2` |
| Subtitle and scope note | `A3:X3` |
| Contract slicer | `A4:H7` |
| Tenure Band slicer | `I4:P7` |
| Internet Type slicer | `Q4:X7` |
| Existing card | `A9:C13` |
| Churned card | `E9:G13` |
| Retained card | `I9:K13` |
| Churn Rate card | `M9:O13` |
| Retention Rate card | `Q9:S13` |
| MRVL card | `U9:W13` |
| Heatmap panel | `A16:P30` |
| Internet Type chart | `Q16:X30` |
| Top Reasons chart | `A32:M43` |
| Risk Tier chart | `N32:V43` |
| Risk Tier volume labels | `W34:X41` |
| Footer/methodology | `A45:X46` |

### Card layout

Each card uses:

- Label in the upper third.
- Large linked KPI value in the center.
- Small baseline/scope hint only when useful.
- No mini sparkline or decorative icon.
- Columns D, H, L, P, T, and X act as consistent card gutters/outer breathing room.

### Analytical context

- Internet chart note: **Internet customers only; association, not causation.**
- Reasons chart note: **Self-reported exit reasons — not verified causes.**
- Risk chart note: **Rule-based descriptive tiers — not predictive probabilities.**
- Footer: **Rates exclude Joined customers. Q2 2022 snapshot. Source: data/processed/customers_clean.csv**

### Container composition

- `A1:X3` is a single deep-navy executive header band with white title text.
- `A4:X7` is a unified filter band with three aligned reserved slicer wells.
- Each KPI card has a white body, a subtle top accent rule, and identical label/value baselines.
- Each analytical panel has a white body, light border, fixed title band, and at least one blank-cell equivalent of internal padding.
- Panel titles and caveat notes are cell-based and created by Python; they are not part of native chart objects.
- Prepared chart wells use a very light neutral placeholder fill and centered temporary text such as **Native interactive chart added in Excel**. The temporary text is covered or removed when the chart is placed.
- No chart may extend to a panel border; preserve visible container padding on all sides.

---

## 11. Design System

### Font

Use **Aptos** throughout. It is the current standard Microsoft Office font and renders consistently in Excel Desktop for Mac.

- Dashboard title: Aptos Display, 21 pt, bold
- Subtitle: Aptos, 10 pt, regular
- KPI label: Aptos, 9 pt, semibold, uppercase or small caps style
- KPI value: Aptos Display, 21 pt, bold
- Chart title: Aptos, 12 pt, semibold
- Chart labels/axes: Aptos, 9 pt
- Footer/notes: Aptos, 8 pt

### Palette

| Role | Hex |
|---|---|
| Dashboard background | `#F4F6F8` |
| Card/panel fill | `#FFFFFF` |
| Primary navy | `#16324F` |
| Primary analytical blue | `#3E6B89` |
| Retained teal | `#2A9D8F` |
| Churn warning coral | `#C94C4C` |
| Main text | `#25313C` |
| Secondary text | `#66727D` |
| Light border | `#DCE2E7` |
| Heatmap minimum | `#FFF9F4` |
| Heatmap maximum | `#C94C4C` |

### Color meaning

- Navy/blue: structure, neutral analysis, titles.
- Teal: retention.
- Coral/red: churn, MRVL, elevated risk.
- Neutral gray: supporting context.

### Panels and cards

- White fill over the light dashboard background.
- One-pixel-equivalent light border.
- No heavy shadows or gradients.
- Consistent internal padding approximated with blank rows/columns.
- KPI cards aligned to the same top and bottom edges.
- Use narrow blank gutter columns between KPI cards; do not create a continuous six-cell strip.
- Use one consistent corner treatment. Because cell-based containers cannot reliably use rounded corners, prefer square cards with subtle borders rather than mixing square cells and rounded floating shapes.

### Charts

- White chart area and plot area.
- No outline around chart area.
- No 3D effects.
- No legend for single-series charts.
- No field buttons.
- Direct labels on all bars.
- Category axes visible; value axes hidden when direct labels provide sufficient scale context.
- No major gridlines unless needed to interpret percentage scale.
- Bars use one analytical color; no per-category rainbow.
- Chart title aligned left when Excel permits; otherwise centered consistently.
- Native chart titles are ultimately removed because Python-created panel titles provide the consistent dashboard hierarchy.

### Number formats

- Counts: `#,##0`
- Card percentages: `0.0%`
- QA percentages: `0.00%`
- Card MRVL: `$#,##0`
- QA MRVL: `$#,##0.00`
- Heatmap volume: `"n="#,##0`

---

## 12. Dashboard Cleanup

### Hide on `01_Dashboard`

- Gridlines.
- Row and column headings.
- Page-break indicators.
- Formula-bar dependency for normal use.
- PivotChart field buttons.
- Unnecessary chart legends.
- Value axes where direct labels are sufficient.
- Empty chart borders and default gray chart backgrounds.
- Temporary placeholder text after each native chart is placed.

### Hide support sheets after QA

- `02_Pivots`
- `03_Calculations`
- `04_Data`

Use ordinary hidden state so a reviewer can unhide them. Do not use very hidden state.

### Keep visible

- Slicer headers and clear-filter controls.
- Active slicer selections.
- Dashboard footnotes.
- Chart titles and direct labels.

### Workbook cleanup

- Delete no sheets after native objects are created.
- Ensure there is no `Sheet1`, `Sheet2`, or default chart sheet.
- Set `01_Dashboard` as the active sheet before final save.
- Set dashboard zoom to 88%.
- Select `A1` before final save.

---

## 13. Automated Build Plan

The future implementation agent must execute this sequence exactly.

### Step A1 — Preflight

1. Confirm these authoritative files exist:
   - `excel/EXCEL_DASHBOARD_PRD.md`
   - `excel/EXCEL_DASHBOARD_BUILD_PLAN.md`
   - `data/processed/customers_clean.csv`
2. Confirm the target workbook is not open in Excel.
3. Do not modify source CSV, SQL, analysis, or Tableau files.

### Step A2 — Load source

1. Read `customers_clean.csv` with literal Offer `None` preserved.
2. Assert 7,043 rows.
3. Assert 46 source columns.
4. Assert 7,043 unique Customer IDs and zero duplicates.
5. Assert Customer Status contains only Churned, Stayed, Joined.

### Step A3 — Validate locked benchmarks

Calculate from source data:

- Total, Existing, Churned, Retained, Joined.
- Churn Rate and Retention Rate.
- MRVL.
- Month-to-Month benchmark.
- 0–6 month benchmark.
- Fiber benchmark.
- top two churn reasons.
- risk-tier counts/rates.
- high-risk intersection.

Abort before writing the workbook if any locked check fails.

### Step A4 — Add helper fields in memory

1. Add the nine helpers in the exact order in Section 4.
2. Use null/blank values for Joined in Churn_Rate_Value and Retention_Rate_Value.
3. Validate helper identities:
   - Sum Existing_Flag = 6,589.
   - Sum Is_Churned = 1,869.
   - Sum Is_Retained = 4,720.
   - Sum MRVL_Row = 137,086.65.
4. Validate canonical Tenure and Risk sort mappings.

### Step A5 — Create workbook

1. Create `excel/customer_retention_dashboard.xlsx` with XlsxWriter.
2. Create sheets in this order:
   - `01_Dashboard`
   - `02_Pivots`
   - `03_Calculations`
   - `04_Data`
3. Do not create a default extra sheet.
4. Set workbook calculation mode to automatic and request full recalculation on open if supported.

### Step A6 — Write `04_Data`

1. Write all 55 columns beginning at A1.
2. Create Excel Table `tblCustomers` across the dynamic validated range.
3. Apply field-appropriate number formats.
4. Preserve ZIP Code as five-character text.
5. Set useful widths for audit use; cap very long text fields.
6. Freeze the header row.
7. Hide the sheet only after the workbook scaffold is complete.

### Step A7 — Build `03_Calculations`

1. Add KPI current/baseline/variance/status block in `B4:F10`.
2. Write the six GETPIVOTDATA formulas in `C5:C10`.
3. Write baseline values in `D5:D10`.
4. Write variance and PASS/FAIL formulas in `E:F`.
5. Define the six KPI names.
6. Add source QA:
   - Total Customers.
   - Joined Customers.
   - Existing denominator identity.
   - Retention + Churn Rate = 100%.
7. Add high-risk intersection QA.
8. Add Risk Tier volume extraction formulas for the four tiers.
9. Add documented helper formulas as text.
10. Add a concise native Excel checklist referencing the exact pivot destinations.

### Step A8 — Build dashboard canvas

1. Apply the light-neutral background fill to `A1:X46`.
2. Set the exact column widths and row heights needed for the locked grid and one-screen composition.
3. Hide gridlines and headings.
4. Create the full-width navy header band, title, subtitle, scope note, and footer.
5. Create one visually unified filter band with three aligned slicer wells and fixed captions.
6. Create six separated KPI card panels using the locked gutter columns and link their value cells to the defined KPI names.
7. Apply the top accent rules, locked colors, fonts, borders, number formats, and consistent internal padding.
8. Create four white analytical panel containers at the exact ranges.
9. Add fixed panel titles and note bands outside the native chart wells.
10. Add styled chart placeholders inside the panel wells; include temporary centered placeholder text.
11. Confirm the pre-native workbook already communicates the complete hierarchy without opening a support sheet.

### Step A9 — Build formula heatmap

1. Write the three Contract headers.
2. Write the six canonical Tenure labels.
3. Generate 18 rate formulas and 18 volume formulas using `GETPIVOTDATA` and the `PT_ContractTenure` anchor.
4. Merge only presentation cells within each heatmap block; do not merge any support-sheet cells.
5. Apply fixed 0–1 conditional formatting to rate cells.
6. Apply numeric volume format and empty-state formatting.

### Step A10 — Prepare chart placeholders and notes

1. Add chart titles as fixed cell-based panel headers.
2. Add the three required caveat notes.
3. Add dynamic Risk Tier volume cells linked to `PT_RiskTierVolume`.
4. Ensure all placeholder zones are free of merged cells that would obstruct chart placement.
5. Reserve the exact inner chart wells:
   - Internet Type: `Q18:X29`
   - Top Reasons: `A34:M42`
   - Risk Tier: `N34:V42`
6. Ensure panel headers and notes remain visible after native objects are inserted.

### Step A11 — Prepare `02_Pivots`

1. Add a title and a small inventory table with each PivotTable name, destination, fields, and associated chart.
2. Leave the destination ranges empty.
3. Add a warning: **Create all pivots by copying PT_KPI_Context to preserve one shared cache.**
4. Keep this sheet visible for the native pass.

### Step A12 — Automated QA

1. Close the generated workbook cleanly.
2. Reopen it read-only with an XLSX parser only before native objects exist.
3. Validate:
   - four sheets only;
   - exact sheet order;
   - table name and range;
   - expected formulas and named ranges;
   - no external links;
   - dashboard dimensions and hidden-grid settings;
   - full-width header, filter band, six separated cards, four panel containers, fixed panel titles, and chart wells;
   - no source-file modifications.
4. Capture or inspect a rendered preview if the implementation environment supports it and verify that the scaffold reads as a dashboard rather than a worksheet.
5. Print a concise PASS/FAIL report.
6. Do not reopen or resave with Python after Phase B starts.

---

## 14. Manual Microsoft Excel Desktop Runbook

The following runbook assumes Phase A has produced `excel/customer_retention_dashboard.xlsx`.

### Step B1 — Open and preflight

1. Open the workbook in Microsoft Excel Desktop for Mac.
2. Choose **Formulas > Calculation Options > Automatic**.
3. Choose **Formulas > Calculate Now**.
4. Open `04_Data`.
5. Click inside the table.
6. On the **Table** ribbon, confirm **Table Name** is `tblCustomers`.
7. Confirm the last table row is 7,044 including the header.
8. Confirm the final helper column is `Risk_Tier_Sort`.
9. Open `03_Calculations` and confirm source QA cells show the locked baseline values.

### Step B2 — Create the first PivotTable and shared cache

1. Open `04_Data`.
2. Click any cell inside `tblCustomers`.
3. Choose **Insert > PivotTable**.
   - If shown, choose **From Table or Range**.
4. Confirm Table/Range is `tblCustomers`.
5. Select **Existing Worksheet**.
6. Enter destination `'02_Pivots'!$A$3`.
7. Do not add the data to the Data Model.
8. Click **OK**.
9. Click inside the new pivot.
10. Open **PivotTable Analyze**.
11. Set PivotTable Name to `PT_KPI_Context`.
12. Control-click inside the pivot and choose **PivotTable Options**.
13. Under Layout & Format:
    - check **Preserve cell formatting on update**;
    - clear **Autofit column widths on update**.
14. Under Data, check **Refresh data when opening the file**.
15. Click **OK**.

### Step B3 — Copy the empty shared-cache pivot

Before adding fields:

1. Click inside `PT_KPI_Context`.
2. Choose **PivotTable Analyze > Select > Entire PivotTable**.
3. Press Command+C.
4. Paste copies at:
   - `02_Pivots!A12`
   - `02_Pivots!A24`
   - `02_Pivots!A38`
   - `02_Pivots!F38`
   - `02_Pivots!A52`
5. Rename the copies:
   - A12 → `PT_InternetType`
   - A24 → `PT_ChurnReasons`
   - A38 → `PT_RiskTier`
   - F38 → `PT_RiskTierVolume`
   - A52 → `PT_ContractTenure`

If Excel copied any field layout, use **PivotTable Analyze > Clear > Clear All** on each copy before configuration.

### Step B4 — Configure `PT_KPI_Context`

Drag these fields to **Values**:

| Field | Value Field Setting | Custom name | Number format |
|---|---|---|---|
| Existing_Flag | Sum | Existing Customers | `#,##0` |
| Is_Churned | Sum | Churned Customers | `#,##0` |
| Is_Retained | Sum | Retained Customers | `#,##0` |
| MRVL_Row | Sum | Monthly Recurring Value Lost | `$#,##0.00` |

For each value:

1. Open its drop-down in the Values well.
2. Choose **Value Field Settings**.
3. Select **Sum**.
4. Enter the exact custom name.
5. Choose **Number Format** and apply the specified format.
6. Click **OK** twice.

Leave Rows, Columns, and Filters empty.

Expected baseline:

- 6,589 Existing
- 1,869 Churned
- 4,720 Retained
- $137,086.65 MRVL

### Step B5 — Configure `PT_InternetType`

1. Click `PT_InternetType`.
2. Drag `Internet Service` to **Filters**.
3. Set its filter to **Yes**.
4. Drag `Internet Type` to **Rows**.
5. Drag `Churn_Rate_Value` to **Values**.
6. Open **Value Field Settings**.
7. Choose **Average**.
8. Set Custom Name to `Churn Rate`.
9. Set Number Format to Percentage with one decimal.
10. Open the Internet Type row-label menu.
11. Sort Descending by Churn Rate.
12. Choose **PivotTable Design > Subtotals > Do Not Show Subtotals**.
13. Choose **PivotTable Design > Grand Totals > Off for Rows and Columns**.

Expected baseline:

- Fiber Optic 42.13%
- Cable 27.52%
- DSL 19.97%

### Step B6 — Create `PC_InternetType`

1. Click inside `PT_InternetType`.
2. Choose **PivotTable Analyze > PivotChart**.
3. Choose **Bar > 2-D Clustered Bar**.
4. Delete the native chart title; the panel title already exists.
5. Choose **Chart Design > Add Chart Element > Data Labels > Outside End**.
6. Format labels as `0.0%`.
7. Delete the legend.
8. Format the category axis with **Categories in reverse order**.
9. Remove chart and plot borders.
10. Set the bar fill to `#3E6B89`.
11. Hide PivotChart field buttons:
    - **PivotChart Analyze > Field Buttons > Hide All**, if available.
12. Open **Home > Find & Select > Selection Pane** and rename the chart `PC_InternetType`.
13. Choose **Chart Design > Move Chart > Object in 01_Dashboard**.
14. Position and resize it inside `Q18:X29`, preserving the title and note bands.

### Step B7 — Configure `PT_ChurnReasons`

1. Click `PT_ChurnReasons`.
2. Drag `Customer Status` to **Filters**.
3. Set it to **Churned**.
4. Drag `Churn Reason` to **Rows**.
5. Drag `Customer ID` to **Values**.
6. Set Value Field Settings to **Count**.
7. Set Custom Name to `Churned Customers`.
8. Set Number Format to `#,##0`.
9. Open the Churn Reason row-label filter.
10. Clear `(blank)` if it appears.
11. Choose **Value Filters > Top 10**.
12. Configure **Top 5 Items by Churned Customers**.
13. Sort Descending by Churned Customers.
14. Turn off subtotals and grand totals.

Expected first two rows:

- Competitor had better devices: 313
- Competitor made better offer: 311

### Step B8 — Create `PC_ChurnReasons`

1. Insert a PivotChart from `PT_ChurnReasons`.
2. Choose **Bar > 2-D Clustered Bar**.
3. Delete the native chart title; the panel title already exists.
4. Add Outside End data labels.
5. Format labels as `#,##0`.
6. Delete the legend.
7. Reverse category order.
8. Remove chart and plot borders.
9. Set bar fill to `#C94C4C`.
10. Hide field buttons.
11. Rename the chart `PC_ChurnReasons` in the Selection Pane.
12. Move it to `01_Dashboard`.
13. Position and resize it inside `A34:M42`, preserving the title and note bands.

### Step B9 — Configure `PT_RiskTier`

1. Click `PT_RiskTier`.
2. Drag `Descriptive_Churn_Risk_Tier` to **Rows**.
3. Drag `Churn_Rate_Value` to **Values**.
4. Set Value Field Settings to **Average**.
5. Set Custom Name to `Churn Rate`.
6. Set Number Format to Percentage with one decimal.
7. Turn off subtotals and grand totals.
8. Manually order the row items:
   - Very High
   - High
   - Medium
   - Low
9. Use drag-and-drop or Control-click **Move > Move Up/Down**.

Expected baseline rates:

- Very High 66.51%
- High 20.65%
- Medium 7.29%
- Low 3.42%

### Step B10 — Create `PC_RiskTier`

1. Insert a PivotChart from `PT_RiskTier`.
2. Choose **Bar > 2-D Clustered Bar**.
3. Delete the native chart title; the panel title already exists.
4. Add Outside End data labels.
5. Format labels as `0.0%`.
6. Delete the legend.
7. Reverse category order only if needed to display Very High at the top.
8. Remove chart and plot borders.
9. Set bar fill to `#C94C4C`.
10. Hide field buttons.
11. Rename it `PC_RiskTier`.
12. Move it to `01_Dashboard`.
13. Position and resize it inside `N34:V42`, preserving the title and note bands.

### Step B11 — Configure `PT_RiskTierVolume`

1. Click `PT_RiskTierVolume`.
2. Drag `Descriptive_Churn_Risk_Tier` to **Rows**.
3. Drag `Existing_Flag` to **Values**.
4. Set Value Field Settings to **Sum**.
5. Set Custom Name to `Existing Customers`.
6. Set Number Format to `#,##0`.
7. Turn off subtotals and grand totals.
8. Apply the same Very High, High, Medium, Low manual order.

Expected baseline volumes:

- Very High 2,156
- High 1,259
- Medium 1,714
- Low 1,460

### Step B12 — Configure `PT_ContractTenure`

1. Click `PT_ContractTenure`.
2. Drag `Tenure_Band` to **Rows**.
3. Drag `Contract` to **Columns**.
4. Drag `Churn_Rate_Value` to **Values**.
5. Set it to **Average**.
6. Set Custom Name to `Churn Rate`.
7. Format as Percentage with one decimal.
8. Drag `Existing_Flag` to **Values**.
9. Set it to **Sum**.
10. Set Custom Name to `Existing Customers`.
11. Format as `#,##0`.
12. Turn off subtotals and grand totals.
13. Order Tenure rows:
    - 0-6 months
    - 7-12 months
    - 13-24 months
    - 25-36 months
    - 37-48 months
    - 49-72 months
14. Order Contract columns:
    - Month-to-Month
    - One Year
    - Two Year
15. Open `01_Dashboard` and confirm the formula heatmap now displays rates and volumes.

### Step B13 — Create slicers

1. Click `PT_KPI_Context`.
2. Choose **PivotTable Analyze > Insert Slicer**.
   - Some Mac versions show **Insert > Slicer**.
3. Select:
   - Contract
   - Tenure_Band_Slicer
   - Internet Type
4. Click **OK**.
5. Cut and paste each slicer to `01_Dashboard`.
6. Set slicer captions:
   - Contract
   - Tenure Band
   - Internet Type
7. Position:
   - Contract → `A4:H7`
   - Tenure Band → `I4:P7`
   - Internet Type → `Q4:X7`
8. Set the Tenure slicer to two columns.
9. Set the Internet Type slicer to two columns if needed.
10. Keep slicer headers and clear-filter buttons visible.
11. Apply one restrained slicer style aligned with the dashboard palette.

### Step B14 — Connect each slicer to every PivotTable

For each of the three slicers:

1. Select the slicer.
2. Open the **Slicer** tab.
3. Choose **Report Connections** or **PivotTable Connections**.
4. Check:
   - PT_KPI_Context
   - PT_InternetType
   - PT_ChurnReasons
   - PT_RiskTier
   - PT_RiskTierVolume
   - PT_ContractTenure
5. Click **OK**.

This creates 18 required slicer-to-PivotTable connections.

If any PivotTable is absent from the connections dialog, delete that PivotTable and recreate it by copying `PT_KPI_Context`. Do not accept a disconnected duplicate cache.

### Step B15 — Verify formula-driven dashboard elements

1. Confirm all six KPI cards show baseline values.
2. Confirm all 18 heatmap rate cells and 18 volume cells populate.
3. Confirm Risk Tier volume labels populate.
4. If GETPIVOTDATA returns `#REF!`, verify:
   - the exact PivotTable anchor cell;
   - the exact custom value caption;
   - the exact field names.
5. Do not replace formula cells with static values.

### Step B16 — Final native formatting

1. Select each PivotChart and confirm the font is Aptos.
2. Confirm native chart titles are absent and the fixed panel titles remain visible.
3. Confirm labels are 9 pt.
4. Confirm legends are absent.
5. Confirm field buttons are hidden.
6. Confirm chart backgrounds are white and borders removed.
7. Align charts to the prepared panel edges.
8. Confirm no chart overlaps a note, slicer, or card.
9. Confirm active slicer selections are visually obvious.
10. Confirm all three charts sit within their white panel containers with consistent padding and aligned edges.
11. Remove or cover all temporary placeholder text.

### Step B17 — Hide support sheets

1. Confirm all QA checks pass first.
2. Control-click the `02_Pivots` tab and choose **Hide**.
3. Hide `03_Calculations`.
4. Hide `04_Data`.
5. Leave only `01_Dashboard` visible.

### Step B18 — Refresh and final save

1. Choose **Data > Refresh All**.
2. Wait for completion.
3. Recheck Top 5 sorting and Risk Tier ordering.
4. Choose **Formulas > Calculate Now**.
5. Set dashboard zoom to 88%.
6. Select `A1`.
7. Save with Command+S.
8. Close Excel completely.
9. Reopen the workbook.
10. Confirm no repair, link, or macro prompt appears.
11. Run the final interaction test in Section 15.
12. Save once more with all slicers cleared and `01_Dashboard` active.

### Estimated manual effort

- Approximate actions: 210–260 menu, drag, format, connection, and QA actions.
- Planning estimate used for handoff: approximately 230 manual actions.
- Expected elapsed time for an experienced Excel user: 45–75 minutes.

---

## 15. Final Interactivity Test

Record PASS/FAIL for each test.

### Test 1 — No-filter baseline

1. Clear all three slicers.
2. Confirm all six KPI benchmarks.
3. Confirm all four visuals populate.
4. Confirm the heatmap includes all six Tenure bands and three Contracts.

### Test 2 — Contract selection

1. Select Month-to-Month.
2. Confirm Existing = 3,202.
3. Confirm Churned = 1,655.
4. Confirm Churn Rate = 51.69%.
5. Confirm the heatmap shows values only for Month-to-Month.
6. Confirm all three charts and risk volume update.
7. Clear Contract.

### Test 3 — Tenure Band selection

1. Select `01 | 0-6 months`.
2. Confirm Existing = 1,016.
3. Confirm Churned = 784.
4. Confirm Churn Rate = 77.17%.
5. Confirm charts and heatmap update.
6. Clear Tenure Band.

### Test 4 — Internet Type selection

1. Select Fiber Optic.
2. Confirm the Internet Type chart shows Fiber only.
3. Confirm the filtered existing count is 2,934 and churned count is 1,236 when no other slicer is active.
4. Confirm Churn Rate = 42.13%.
5. Clear Internet Type.

### Test 5 — Internet N/A empty-chart state

1. Select Internet Type = N/A.
2. Confirm the Internet Type chart is empty.
3. Confirm the other dashboard components still show the no-internet segment.
4. Confirm no zero bar, `#N/A`, `#REF!`, or `(blank)` label appears.
5. Clear Internet Type.

### Test 6 — Multi-slicer high-risk intersection

1. Select Month-to-Month.
2. Select `01 | 0-6 months`.
3. Select Fiber Optic.
4. Confirm Existing = 487.
5. Confirm Churned = 444.
6. Confirm Churn Rate = 91.17%.
7. Confirm all visuals share this context.
8. Clear all slicers.

### Test 7 — Multi-select within one slicer

1. Multi-select One Year and Two Year in Contract.
2. Confirm the dashboard excludes Month-to-Month.
3. Confirm Existing = 3,387 and values reconcile to the two contract segments.
4. Confirm no chart remains on the prior state.
5. Clear Contract.

### Test 8 — Empty-result combination

1. Select a combination expected to have no rows or very few rows.
2. Confirm KPI rates show an em dash/empty state instead of division errors.
3. Confirm charts display empty states without stale bars.
4. Clear all slicers.

### Test 9 — Refresh

1. Choose **Data > Refresh All**.
2. Confirm all connections persist.
3. Confirm Risk Tier order remains Very High → Low.
4. Confirm Top Reasons remains Top 5 descending.
5. Confirm heatmap formulas and formatting remain intact.

### Test 10 — Reopen

1. Save with all filters cleared.
2. Close Excel completely.
3. Reopen the workbook.
4. Confirm `01_Dashboard` is active at 88% zoom.
5. Confirm only the Dashboard sheet is visible.
6. Confirm slicers, charts, KPI cards, and heatmap remain functional.

---

## 16. Analytical Validation

### Core benchmark checks

| Check | Formula/logic | Expected |
|---|---|---:|
| Total | Rows in tblCustomers | 7,043 |
| Existing | Sum Existing_Flag | 6,589 |
| Churned | Sum Is_Churned | 1,869 |
| Retained | Sum Is_Retained | 4,720 |
| Joined | Count Customer Status = Joined | 454 |
| Churn Rate | 1,869 / 6,589 | 28.37% |
| Retention Rate | 4,720 / 6,589 | 71.63% |
| MRVL | Sum MRVL_Row | $137,086.65 |

### Denominator checks

- Existing = Churned + Retained.
- Total = Existing + Joined.
- Joined rows have blank Churn_Rate_Value and Retention_Rate_Value.
- Churn Rate + Retention Rate = 100% when Existing > 0.
- No rate uses Total Customers as its denominator.

### Category and chart checks

- Contract existing totals sum to 6,589 unfiltered.
- Tenure existing totals sum to 6,589 unfiltered.
- Internet chart includes only Internet Service = Yes.
- Churn Reason chart includes only Customer Status = Churned.
- Top five reason counts match source counts.
- Risk Tier volumes sum to 6,589.
- Risk Tier rate uses existing customers only.
- Heatmap rate and volume refer to the same filtered segment.
- No segment is double-counted within a single PivotTable aggregation.

### Filtered checks

For every slicer test:

- Filtered Existing = filtered Churned + filtered Retained.
- Filtered Churn Rate = filtered Churned / filtered Existing.
- Filtered Retention Rate = filtered Retained / filtered Existing.
- Filtered MRVL equals the sum of Monthly Charge for filtered churned rows.
- Every chart reflects the same three slicer states plus its documented internal filter.

---

## 17. Portfolio QA

The workbook cannot be declared complete until all conditions pass:

- No `#REF!`.
- No `#DIV/0!`.
- No visible `#N/A`.
- No broken or empty chart under the unfiltered baseline.
- No clipped titles or labels.
- No overlapping objects.
- No unnecessary chart scrollbars.
- No PivotTable field buttons.
- No accidental raw PivotTable on the dashboard.
- No default Sheet1 or chart sheet.
- No external-link prompt.
- No macro/security prompt.
- No workbook repair warning.
- Consistent Aptos font.
- Consistent number formats.
- Consistent card and panel alignment.
- Slicer selections are visually obvious.
- Slicer clear-filter controls are visible.
- The dashboard is understandable without unhiding support sheets.
- The complete dashboard fits at 88% zoom without horizontal scrolling.
- All support sheets are hidden only after QA.
- The workbook opens on `01_Dashboard` with all slicers cleared.

---

## 18. Definition of Done

### Data

- `tblCustomers` contains exactly 7,043 customer rows and 55 columns.
- All 46 source fields match the processed CSV.
- Nine helper fields match approved logic.
- No source CSV is modified.
- No external path dependency exists.

### Analytics

- All core benchmarks and visual spot checks pass.
- Joined is excluded from every churn/retention denominator.
- MRVL matches established logic.
- Risk tiers remain descriptive and rule-based.
- Reason and association caveats are visible.

### Interactivity

- Three slicers exist and connect to all six PivotTables.
- Six KPI cards and four visuals respond consistently.
- Single-select, multi-select, clear-filter, and empty-state tests pass.
- Refresh and reopen tests pass.

### Visual design

- One widescreen dashboard is the only visible sheet.
- Layout matches the locked ranges.
- Typography, colors, spacing, cards, charts, and labels follow the design system.
- No default Excel presentation clutter remains.
- The pre-native scaffold supplied 80–90% of the final composition; the native pass did not require dashboard redesign.
- Charts read as integrated panel content rather than disconnected floating objects.

### Technical stability

- Workbook opens without repair, macro, or external-link prompts.
- No formula errors, broken charts, disconnected pivots, or stale caches.
- Native objects survive save, close, and reopen.
- The final workbook is not round-tripped through Python after native setup.

### Portfolio presentation

- A viewer can understand churn severity, concentration, associations, stated reasons, and retention-priority tiers from the dashboard alone.
- The workbook demonstrates Excel Tables, PivotTables, PivotCharts, slicers, shared filter context, GETPIVOTDATA, conditional formatting, and polished dashboard design.
- It complements rather than duplicates Tableau.

---

## 19. Implementation Handoff

### Recommended implementation model

Use **GPT-5.6 Sol, medium reasoning tier** for the automated build.

The work is deterministic and code-heavy: dataframe validation, XlsxWriter layout, formulas, named ranges, and workbook QA. The implementation model should execute this blueprint without reopening product or analytical decisions.

### Files the implementation model must read

Read these before implementation:

1. `excel/EXCEL_DASHBOARD_PRD.md`
2. `excel/EXCEL_DASHBOARD_BUILD_PLAN.md`
3. `data/processed/customers_clean.csv`
4. `docs/churn_definition.md`
5. `analysis/data_cleaning.py`
6. `tableau/calculated_fields.md`
7. `tableau/validate_tableau_metrics.py`

The first two files are jointly authoritative. The remaining files are validation references, not invitations to redesign logic.

### Future implementation instruction

The implementation prompt must state:

> Implement Phase A exactly as specified in `excel/EXCEL_DASHBOARD_PRD.md` and `excel/EXCEL_DASHBOARD_BUILD_PLAN.md`. Do not redo repository research, change dashboard scope, alter metrics, create native PivotTable XML, or modify source data, SQL, analysis, or Tableau. Stop after producing and validating the pre-native Excel workbook and provide the Phase B runbook checkpoint.

---

## 20. Anti-Overengineering Guardrail

If a simpler implementation produces the same reliable portfolio outcome, use it.

Specifically:

- Do not add VBA or macros.
- Do not add Power Query.
- Do not add the Data Model.
- Do not create extra sheets.
- Do not create extra visuals.
- Do not create separate PivotTables for each KPI.
- Do not generate PivotTable or slicer XML in Python.
- Do not automate Excel Desktop through fragile Mac UI scripting.
- Do not add custom icons, image assets, or decorative charts.
- Do not add live external connections for a fixed snapshot.
- Do not reintroduce the hypothetical scenario.
- Do not expand the dashboard beyond `A1:X46`.

The target is a polished presentation over a deliberately boring, robust support architecture.
