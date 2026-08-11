# Phase 6 — Tableau Desktop Build Guide

Execute in Tableau Desktop. Save as `tableau/customer_churn_dashboard.twbx`.

**Data:** `data/processed/customers_clean.csv`  
**Validate after build:** `python3 tableau/validate_tableau_metrics.py`

---

## Step 0 — Connect Data

1. Connect → Text file → select `customers_clean.csv`
2. Confirm **7,043 rows**
3. Verify `Offer` value `None` appears as a dimension (not null). If null, edit connection / remap.
4. Rename connection: `Customer Churn`

---

## Step 1 — Calculated Fields

Create in this order (formulas from `calculated_fields.md`):

| # | Name | Formula |
|---|---|---|
| 1 | `Existing Customer Flag` | `[Customer Status] = "Churned" OR [Customer Status] = "Stayed"` |
| 2 | `Churned Customer Flag` | `[Customer Status] = "Churned"` |
| 3 | `Retained Customer Flag` | `[Customer Status] = "Stayed"` |
| 4 | `Churn Rate` | `SUM(INT([Churned Customer Flag])) / SUM(INT([Existing Customer Flag]))` → Percent, 2 dec |
| 5 | `Retention Rate` | `SUM(INT([Retained Customer Flag])) / SUM(INT([Existing Customer Flag]))` → Percent, 2 dec |
| 6 | `Churned Count` | `SUM(INT([Churned Customer Flag]))` |
| 7 | `Existing Customer Count` | `SUM(INT([Existing Customer Flag]))` |
| 8 | `Share of All Churn` | `SUM(INT([Churned Customer Flag])) / { FIXED : SUM(INT([Churned Customer Flag])) }` → Percent, 1 dec |
| 9 | `Share of Internet Churn` | `SUM(INT([Churned Customer Flag])) / { FIXED : SUM(IF [Internet Type] != "N/A" THEN INT([Churned Customer Flag]) END) }` → Percent, 1 dec |
| 10 | `Monthly Recurring Value Lost` | `SUM(IF [Customer Status] = "Churned" THEN [Monthly Charge] END)` → Currency |
| 11 | `Tenure Band Sort` | See calculated_fields.md #11 |
| 12 | `High Risk Intersection Flag` | `[Contract] = "Month-to-Month" AND [Tenure_Band] = "0-6 months" AND [Internet Type] = "Fiber Optic"` |
| 13 | `Risk Points` | See calculated_fields.md #13 |
| 14 | `Descriptive Churn Risk Tier` | See calculated_fields.md #14 |
| 15 | `Internet Customer Flag` | `[Internet Type] != "N/A"` |

**Additional fields for build:**

```
Risk Tier Sort:
CASE [Descriptive Churn Risk Tier]
  WHEN "Very High" THEN 1 WHEN "High" THEN 2
  WHEN "Medium" THEN 3 ELSE 4 END

Pct of Churned (for reason charts):
COUNT([Customer ID]) / { FIXED : COUNT([Customer ID]) }

Joined Count:
COUNTD(IF [Customer Status] = "Joined" THEN [Customer ID] END)
```

**Segment flags** (each Boolean, existing-customer scope applied at sheet level):

```
Early Tenure M2M Flag:
[Contract] = "Month-to-Month" AND [Tenure_Band] = "0-6 months"

M2M Fiber Flag:
[Contract] = "Month-to-Month" AND [Internet Type] = "Fiber Optic"

Stable Two Year Flag:
[Contract] = "Two Year" AND [Tenure_Band] IN ("37-48 months","49-72 months")

M2M No Dependents Flag:
[Contract] = "Month-to-Month" AND [Number of Dependents] = 0
```

**Spot-check after Step 1** (blank sheet, no filters):

| Measure | Expected |
|---|---:|
| COUNT(Customer ID) | 7,043 |
| Existing Customer Count | 6,589 |
| Churned Count | 1,869 |
| Churn Rate | 28.37% |
| MRVL | $137,086.65 |

---

## Step 2 — Formatting Defaults

| Element | Setting |
|---|---|
| Churn / high-risk color | `#C00000` |
| Retained / stable color | `#4472C4` |
| Dashboard background | `#F2F2F2` |
| Card background | White |
| Percent display on charts | 1 decimal |
| BAN font | 28–32 pt number, 10 pt gray label |

---

## Step 3 — Worksheets

### Dashboard 1 — Executive Churn Overview

#### WS_D1_TotalCustomers (BAN)
- **Text:** `STR(COUNT([Customer ID]))`
- **Validate:** 7,043

#### WS_D1_ExistingCustomers (BAN)
- **Text:** `STR([Existing Customer Count])`
- **Validate:** 6,589

#### WS_D1_Churned (BAN)
- **Text:** `STR([Churned Count])`
- **Validate:** 1,869

#### WS_D1_Retained (BAN)
- **Text:** `STR(SUM(INT([Retained Customer Flag])))`
- **Validate:** 4,720

#### WS_D1_ChurnRate (BAN)
- **Text:** `STR(ROUND([Churn Rate]*100,1)) + "%"`
- **Validate:** 28.4% (display)

#### WS_D1_RetentionRate (BAN)
- **Text:** `STR(ROUND([Retention Rate]*100,1)) + "%"`
- **Validate:** 71.6%

#### WS_D1_MRVL (BAN)
- **Text:** `"$" + STR(ROUND([Monthly Recurring Value Lost],2))`
- **Validate:** $137,086.65

#### WS_D1_StatusComposition
| Shelf | Field |
|---|---|
| Columns | Customer Status |
| Rows | COUNT(Customer ID) |
| Marks | Bar (stacked) |
| Color | Customer Status — Churned `#C00000`, Stayed `#4472C4`, Joined gray |
| Sort | Manual: Stayed, Churned, Joined |

**Tooltip:** include Joined Count note (454).

#### WS_D1_ChurnByContract
| Shelf | Field |
|---|---|
| Rows | Contract |
| Columns | Churn Rate |
| Color | Churn Rate (red gradient) |
| Label | Churn Rate + Churned Count |
| Filter | Existing Customer Flag = TRUE |
| Sort | Churn Rate DESC |

**Validate:** M2M 51.7%, Two Year 2.6%

#### WS_D1_ChurnByTenure
| Shelf | Field |
|---|---|
| Rows | Tenure_Band |
| Columns | Churn Rate (bar) + Churned Count (line, dual axis) |
| Sort | Tenure Band Sort ASC |
| Filter | Existing Customer Flag = TRUE |

**Validate:** 0-6 months 77.2%, 784 churned

#### WS_D1_ChurnByInternet
| Shelf | Field |
|---|---|
| Rows | Internet Type |
| Columns | Churn Rate |
| Filter | Internet Customer Flag = TRUE; Existing Customer Flag = TRUE |
| Label | Churn Rate |
| Sort | Churn Rate DESC |

**Tooltip:** Churn Rate, Churned Count, Share of All Churn  
**Validate:** Fiber 42.1%, Share 66.1%

---

### Dashboard 2 — Churn Drivers & Segments

#### WS_D2_CalloutHighRisk (Text)
```
High-Risk Intersection (M2M + 0–6 mo + Fiber)
487 customers | 444 churned | 91.2% churn | 23.8% of all churn
Descriptive segment — association only
```

#### WS_D2_CalloutCompetitor (Text)
```
Competitor-Attributed Exits
841 churned | 45.0% of all churn
Self-reported exit themes
```

#### WS_D2_CalloutM2M (Text)
```
Month-to-Month Contract
51.7% churn | 1,655 churned | 88.6% of all churn
```

#### WS_D2_ChurnCategory
| Shelf | Field |
|---|---|
| Rows | Churn Category |
| Columns | COUNT(Customer ID) |
| Filter | Customer Status = Churned |
| Sort | COUNT DESC |
| Chart | Horizontal bar |

**Validate:** Competitor first, 841 (45.0%)

#### WS_D2_TopReasons
| Shelf | Field |
|---|---|
| Rows | Churn Reason |
| Columns | COUNT(Customer ID) |
| Filter | Customer Status = Churned |
| Filter | Top 8 by COUNT |
| Sort | COUNT DESC |

**Subtitle:** "Stated exit reasons — not verified causes"

#### WS_D2_ContractTenureHeatmap
| Shelf | Field |
|---|---|
| Rows | Tenure_Band (sort Tenure Band Sort ASC) |
| Columns | Contract |
| Text/Color | Churn Rate |
| Filter | Existing Customer Flag = TRUE |

**Validate:** M2M × 0-6 months = 81.3%

#### WS_D2_PrioritySegments (highlight table)

Use **Measure Names / Measure Values** approach:

| Measure Name | Formula |
|---|---|
| Segment Customers | `{ FIXED : SUM(INT([Early Tenure M2M Flag])) }` etc. per segment |
| Segment Churned | `{ FIXED : SUM(IF [Early Tenure M2M Flag] AND [Churned Customer Flag] THEN 1 END) }` |
| Segment Churn Rate | Segment Churned / Segment Customers |

**Alternative (simpler):** Build 4-column crosstab with calculated fields:

```
Early M2M Customers: SUM(IF [Early Tenure M2M Flag] THEN 1 END)
Early M2M Churn Rate: SUM(IF [Early Tenure M2M Flag] AND [Churned Customer Flag] THEN 1 END)
  / SUM(IF [Early Tenure M2M Flag] THEN 1 END)
```

Repeat for M2M Fiber, High Risk Intersection, Stable Two Year.  
Layout as highlight table with segment names as row headers (Text objects + values).

**Validate rows:**

| Segment | Customers | Churn Rate |
|---|---:|---:|
| Early-Tenure M2M | 959 | 81.3% |
| M2M Fiber Optic | 1,796 | 61.6% |
| M2M + 0-6 mo + Fiber | 487 | 91.2% |
| Stable Two-Year | 1,502 | 3.1% |

#### WS_D2_ChurnByOffer
| Shelf | Field |
|---|---|
| Rows | Offer |
| Columns | Churn Rate |
| Label | Churn Rate, Churned Count |
| Filter | Existing Customer Flag = TRUE |
| Sort | Churn Rate DESC |

**Annotation on Offer E:** "High churn associated with M2M + early tenure — confounded, not causal"

**Dashboard 2 filters (apply to all sheets):** Contract, Tenure_Band, Internet Type, Offer — all default All

**Interaction:** Heatmap click → Filter action → Priority Segments + Category/Reason sheets

---

### Dashboard 3 — Retention Opportunities

#### WS_D3_RiskTierCount
| Shelf | Field |
|---|---|
| Rows | Descriptive Churn Risk Tier (sort Risk Tier Sort ASC) |
| Columns | COUNT(Customer ID) |
| Filter | Existing Customer Flag = TRUE |

**Validate:** Very High 2,156

#### WS_D3_RiskTierChurnRate
| Shelf | Field |
|---|---|
| Rows | Descriptive Churn Risk Tier (sort Risk Tier Sort ASC) |
| Columns | Churn Rate |
| Label | Churn Rate, COUNT(Customer ID) |
| Filter | Existing Customer Flag = TRUE |

**Validate:** Very High 66.5%, Low 3.4%

#### WS_D3_SegmentVolume
Rank segments by churned count. Use horizontal bar:

Create calculated dimension `Priority Segment Label` with nested IF (first match wins) OR separate bar chart with 5 measures on shared axis:

| Segment | Churned (validate) |
|---|---:|
| M2M No Dependents | 1,549 |
| M2M Fiber Optic | 1,107 |
| Early-Tenure M2M | 780 |
| M2M + 0-6 mo + Fiber | 444 |
| Stable Two-Year | 46 |

**Annotation:** "Segments overlap — customers may appear in multiple groups"

#### WS_D3_Scenario (Text object — static)
```
HYPOTHETICAL RETENTION SCENARIO — Illustrative only
NOT a forecast or causal estimate

Segment: Month-to-Month + 0–6 months + Fiber Optic (churned)
Assumption: Retain 10% of churned in segment

Observed churned in segment:     444
Potentially retained:             44
Monthly value preserved:          $3,524.68
Annualized value preserved:     $42,296.22
```

Do **not** use parameters in v1.

#### WS_D3_PaymentMethod
| Shelf | Field |
|---|---|
| Rows | Payment Method |
| Columns | Churn Rate |
| Label | Churned Count |
| Filter | Existing Customer Flag = TRUE |

**Validate:** Bank Withdrawal 35.7%

#### WS_D3_ChargeBand
| Shelf | Field |
|---|---|
| Rows | Charge_Band |
| Columns | Churn Rate |
| Filter | Existing Customer Flag = TRUE |

**Validate:** $70-89 band 39.8%

**Dashboard 3 filters:** Descriptive Churn Risk Tier, Contract (optional)

**Interaction:** Risk tier click → Filter → Segment Volume sheet

**Footer text:** "Risk tiers are rule-based descriptive segments from Phase 4 SQL logic."

---

## Step 4 — Dashboard Assembly

### DB1 Executive Churn Overview
```
┌─ 7 BAN cards (horizontal container) ─────────────────────────┐
├─ Status Composition (left) │ Churn by Contract (right) ────┤
├─ Churn by Tenure (left)    │ Churn by Internet (right) ────┤
└─ Footer: Churn Rate = Churned / (Churned + Stayed)... ─────┘
```
Size: 1200×800 or fit to screen. No filters.

### DB2 Churn Drivers & Segments
```
┌─ 3 callout text boxes ───────────────────────────────────────┐
├─ Churn Category (left)     │ Contract×Tenure Heatmap (right)┤
├─ Top Reasons (left)        │ (heatmap continues)            ┤
├─ Priority Segments table (full width) ───────────────────────┤
├─ Churn by Offer (full or half width) ────────────────────────┤
└─ Filters: Contract, Tenure_Band, Internet Type, Offer ─────┘
```

### DB3 Retention Opportunities
```
┌─ Title: Descriptive Churn Risk Tiers (NOT predictive) ───────┐
├─ Risk Tier Count (left)    │ Risk Tier Churn Rate (right) ──┤
├─ Segment Volume (left)     │ Payment Method (right) ────────┤
├─ Scenario text block (full width) ───────────────────────────┤
├─ Charge Band (optional bottom) ──────────────────────────────┤
└─ Filters: Risk Tier, Contract ───────────────────────────────┘
```

Hide all data worksheets from workbook tabs. Show dashboards only.

---

## Step 5 — Final Validation Checklist

Run `python3 tableau/validate_tableau_metrics.py` then spot-check in Tableau:

- [ ] Total 7,043 | Existing 6,589 | Churned 1,869 | Retained 4,720
- [ ] Churn 28.37% | Retention 71.63% | MRVL $137,086.65
- [ ] Fiber share 66.1% of all churn
- [ ] High-risk intersection 487 / 444 / 91.17%
- [ ] Competitor 841 / 45.0%
- [ ] Risk tiers: VH 2156/66.51%, Low 1460/3.42%
- [ ] Scenario static text: 44 / $3,524.68 / $42,296.22
- [ ] No cross-dashboard filter sync (v1)
- [ ] All disclaimers present (risk tiers, scenario, reasons, Offer E)

---

## Known Items

1. **Offer "None":** Confirm not parsed as null on CSV import.
2. **Annual scenario $42,296.22:** Use SQL-validated static text; minor rounding variance if computed dynamically ($42,296.16).
3. **Priority segments overlap:** Table uses separate segment flags, not a single Segment dimension.
4. **Cross-dashboard sync:** Skipped for v1 per approval.
