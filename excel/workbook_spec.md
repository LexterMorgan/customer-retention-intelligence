# Excel Workbook Specification

**Project:** Customer Churn & Retention Analytics  
**Data source:** `data/processed/customers_clean.csv` (linked or imported as Excel Table)  
**Worksheet count:** 6  
**Build phase:** Phase 7  
**Relationship to Tableau:** Complements — exposes formulas and editable scenarios Tableau does not

---

## Workbook Design Principles

- One worksheet = one analytical purpose
- Formulas visible and auditable (recruiter/interviewer friendly)
- PivotTables for segment exploration; formulas for KPIs
- No macros, VBA, or Power Query unless Phase 7 finds unavoidable need
- Same metric governance as Tableau (Joined excluded from churn denominators)

---

## Worksheet 01 — Executive_Summary

### Purpose
Management-facing one-page summary: core KPIs, top findings, retention priorities.

### Source Data
- `customers_clean` table (structured Excel Table named `tblCustomers`)
- Summary cells reference `02_KPI_Analysis` for KPI values

### Content

| Section | Type | Details |
|---|---|---|
| KPI block | Formula references | 7 KPIs from sheet 02 |
| Key findings | Static text + formula-backed counts | Top 3–5 validated findings |
| Priority actions | Static text | From Phase 3/4 recommendations |
| Mini chart 1 | PivotChart | Churn Rate by Contract (bar) |
| Mini chart 2 | PivotChart | Churn Rate by Tenure Band (bar) |

### Important Formulas
- Link to `02_KPI_Analysis` cells — do not duplicate logic

### Visuals
- 2 PivotCharts maximum — not a Tableau duplicate

### Business Questions
- What is our churn health?
- What are the top 3 priorities?

---

## Worksheet 02 — KPI_Analysis

### Purpose
Transparent, formula-driven KPI calculations management can inspect.

### Source Data
`tblCustomers` — full dataset

### KPI Table

| KPI | Formula Approach | Validated Value |
|---|---|---:|
| Total Customers | `=COUNTA(tblCustomers[Customer ID])` | 7,043 |
| Existing Customers | `=COUNTIFS(tblCustomers[Customer Status],"Churned")+COUNTIFS(tblCustomers[Customer Status],"Stayed")` | 6,589 |
| Churned Customers | `=COUNTIF(tblCustomers[Customer Status],"Churned")` | 1,869 |
| Retained Customers | `=COUNTIF(tblCustomers[Customer Status],"Stayed")` | 4,720 |
| Joined Customers | `=COUNTIF(tblCustomers[Customer Status],"Joined")` | 454 |
| Churn Rate | `=Churned / Existing` | 28.37% |
| Retention Rate | `=Retained / Existing` | 71.63% |
| Monthly Recurring Value Lost | `=SUMIF(tblCustomers[Customer Status],"Churned",tblCustomers[Monthly Charge])` | $137,086.65 |

### Layout
```
Row 1: Headers
Row 2–9: KPI name | Formula cell | Validated value | Notes
Row 11+: Churned vs Retained value comparison (AVG Monthly Charge, Total Revenue)
```

### Churned vs Retained Comparison (formula)

| Metric | Churned | Retained |
|---|---|---|
| Avg Monthly Charge | `=AVERAGEIF(...,"Churned",Monthly Charge)` | `=AVERAGEIF(...,"Stayed",...)` |
| Avg Total Revenue | Same pattern | Same pattern |
| Avg Tenure | Same pattern | Same pattern |

**Note cell:** Historical revenue differences associated with tenure — not causal.

### Calculation Method
- **Formulas** for all KPIs (not PivotTable)

### Business Questions
- How are KPIs calculated?
- Can I verify churn rate manually?

---

## Worksheet 03 — Segment_Analysis

### Purpose
Interactive segment exploration via PivotTables — rate AND volume.

### Source Data
`tblCustomers` + helper columns (see below)

### Helper Columns (add to tblCustomers or adjacent calc area)

| Column | Formula Logic |
|---|---|
| `Existing Flag` | `=IF(OR([@Customer Status]="Churned",[@Customer Status]="Stayed"),1,0)` |
| `Churned Flag` | `=IF([@Customer Status]="Churned",1,0)` |
| `High Risk Intersection` | M2M AND Tenure_Band="0-6 months" AND Internet Type="Fiber Optic" |
| `Risk Points` | Same rule as Tableau calculated_fields.md #13 |
| `Descriptive Churn Risk Tier` | Same rule as Tableau #14 |

### PivotTables

| PivotTable | Rows | Values | Filters |
|---|---|---|---|
| PT_Contract | Contract | Count Customer ID, Sum Churned Flag, Churn Rate* | Existing Flag = 1 |
| PT_Tenure | Tenure_Band | Same | Existing; sort by custom list |
| PT_Internet | Internet Type | Same | Exclude N/A |
| PT_RiskTier | Descriptive Churn Risk Tier | Same | Existing |
| PT_HighRisk | High Risk Intersection | Count, Churned, Rate | — |

*Churn Rate in Pivot: `=Churned / Count` calculated field or Show Values As % of row + manual check

### Validated Spot-Checks

| Segment | Customers | Churn Rate |
|---|---:|---:|
| Month-to-Month | 3,202 | 51.69% |
| 0–6 months | 1,016 | 77.17% |
| M2M + 0–6 + Fiber | 487 | 91.17% |
| Very High Risk Tier | 2,156 | 66.51% |

### Visuals
- PivotChart from PT_Contract (bar)
- PivotChart from PT_Tenure (bar)
- Conditional formatting on churn rate column (red > 30%)

### Slicers
- Contract
- Tenure_Band
- Descriptive Churn Risk Tier

### Calculation Method
- **PivotTables** for segment counts
- **Helper columns** for flags and risk tier

### Business Questions
- Which segments have highest churn rate AND volume?
- Does the high-risk intersection match SQL validation?

---

## Worksheet 04 — Churn_Drivers

### Purpose
Inspect stated exit reasons, Offer patterns, and billing associations.

### Source Data
`tblCustomers` — churned rows for reason analysis

### PivotTables

| PivotTable | Rows | Values | Filter |
|---|---|---|---|
| PT_ChurnCategory | Churn Category | Count, % of churned | Customer Status = Churned |
| PT_ChurnReason | Churn Reason | Count (top 10) | Churned |
| PT_Offer | Offer | Count, Sum Churned Flag, Churn Rate | Existing |
| PT_Payment | Payment Method | Same | Existing |
| PT_Paperless | Paperless Billing | Same | Existing |

### Validated Spot-Checks

| Driver | Value |
|---|---:|
| Competitor category | 841 (45.0%) |
| Offer E churn rate | 67.62% |
| Bank Withdrawal churn rate | 35.65% |

### Visuals
- PivotChart: Churn Category (horizontal bar)
- PivotChart: Top 5 Churn Reasons

### Annotations
- "Stated exit reasons — not verified causes"
- Offer E: "confounded by M2M + early tenure"
- Fiber share: use 66.1% (all churn) unless labeled internet-only

### Calculation Method
- **PivotTables** primary
- **Formulas** for % of churned: `=count / $ChurnedTotal`

### Business Questions
- Why do customers say they leave?
- Which Offers are associated with elevated churn?

---

## Worksheet 05 — Retention_Scenario

### Purpose
Editable hypothetical retention scenario — transparent and auditable.

### Source Data
- Inputs: manual / reference cells
- Validation: formula links to `tblCustomers`

### Input Cells (editable)

| Input | Default | Cell |
|---|---|---|
| Target Segment | M2M + 0–6 mo + Fiber Optic | Label |
| Observed Churned in Segment | `=COUNTIFS(...)` | Formula → 444 |
| Illustrative Retention % | 10% | **Editable** (e.g., 0.10) |
| Avg Monthly Charge (segment, churned) | `=AVERAGEIF(...)` | Formula → ~$79.38 |

### Output Cells (formulas)

| Output | Formula | Validated @ 10% |
|---|---|---:|
| Potential Customers Retained | `=ChurnedInSegment * RetentionPct` | 44 |
| Monthly Value Potentially Preserved | `=SUM(Monthly Charge for churned in segment) * RetentionPct` | $3,524.68 |
| Annualized Value Potentially Preserved | `=MonthlyPreserved * 12` | $42,296.22 |

### Labels (required)
- Sheet title: **Hypothetical Retention Scenario**
- Disclaimer: **"Illustrative scenario only — not a forecast or causal estimate."**

### Visual
- Simple bar: Observed churned vs Potentially retained (optional)

### Calculation Method
- **Formulas only** — retention % must be visible and editable

### Business Questions
- What if we retained X% of the highest-risk churned segment?
- How sensitive is value impact to retention assumption?

---

## Worksheet 06 — Data_Dictionary

### Purpose
Field reference for Tableau/Excel users — not full raw data documentation.

### Content

| Column | Business Definition | Used In |
|---|---|---|
| Customer ID | Unique customer key | All |
| Customer Status | Churned / Stayed / Joined | KPIs, filters |
| Is_Churned / Is_Retained | Binary flags | KPIs |
| Contract | Month-to-Month / One Year / Two Year | Segments |
| Tenure_Band | Lifecycle band (0–6 mo … 49–72 mo) | Segments |
| Internet Type | DSL / Cable / Fiber / N/A | Drivers |
| Offer | Offer A–E or None | Drivers |
| Monthly Charge | Current monthly bill | MRVL, scenario |
| Total Revenue | Historical cumulative revenue | Context only |
| Churn Category / Reason | Self-reported exit info | Drivers (churned only) |
| Descriptive Churn Risk Tier | Rule-based tier (calc column) | Segments |
| Flag_Negative_Monthly_Charge | 1 = credit/adjustment | QA note |

### Metric Definitions Section

Include canonical churn formula, MRVL definition, share-of-churn denominators, negative charge counts (120 / 114 / 6).

### Source
- Reference `docs/churn_definition.md` and `docs/dataset_audit.md`
- Do not duplicate entire Phase 1 audit

---

## Workbook Structure Summary

| Sheet | Primary Tool | Complements Tableau By |
|---|---|---|
| 01_Executive_Summary | Links + 2 charts | One-page management view |
| 02_KPI_Analysis | Formulas | Transparent KPI audit trail |
| 03_Segment_Analysis | PivotTables + slicers | Interactive segment slicing |
| 04_Churn_Drivers | PivotTables | Reason/offer inspection |
| 05_Retention_Scenario | Editable formulas | Scenario sensitivity (Tableau static) |
| 06_Data_Dictionary | Reference | Field governance |

---

## Phase 7 Implementation Dependencies

1. **Import** `customers_clean.csv` as Excel Table `tblCustomers`
2. **Add helper columns** for Risk Points, Descriptive Churn Risk Tier, High Risk Intersection (not in source CSV)
3. **Custom list** for Tenure_Band sort in PivotTables
4. **No new datasets** — single table architecture
5. Preserve **120** negative-charge rows; document 114 existing in dictionary

---

## Skills Demonstrated

| Skill | Where |
|---|---|
| COUNTIFS / SUMIFS / AVERAGEIF | Sheet 02, 05 |
| PivotTables + PivotCharts | Sheets 01, 03, 04 |
| Structured table references | All sheets |
| Conditional formatting | Sheet 03 |
| Editable scenario inputs | Sheet 05 |
| Percentage calculations | Sheets 02, 03, 04 |

**Not used:** Macros, VBA, Power Query, XLOOKUP (unless Phase 7 finds specific need)

---

## Metric Governance (Workbook)

Same rules as Tableau spec:
- Joined excluded from churn/retention denominators
- Share of all churn = default (66.1% Fiber)
- Share of internet churn = label explicitly (70.4%)
- Descriptive Churn Risk Tiers — not predictive
- Scenario = hypothetical only
