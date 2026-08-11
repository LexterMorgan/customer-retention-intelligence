# Tableau Dashboard Specification

**Project:** Customer Churn & Retention Analytics  
**Data source:** `data/processed/customers_clean.csv` (1 row = 1 customer)  
**Dashboard count:** 3 (maximum)  
**Build phase:** Phase 6

---

## Design Principles

- Professional, clean, executive-friendly layout
- 5–7 meaningful visuals per dashboard
- Show **rate AND volume** where small high-rate groups could mislead
- Association language only — no causal claims
- Consistent red/amber emphasis for churn/high-risk elements
- No 3D charts, gauges, or decorative pie charts

---

## Dashboard 1 — Executive Churn Overview

**Business purpose:** WHAT is happening? Allow management to assess retention health within seconds.

**Business questions answered:**
- How many customers do we have, and how many churned?
- What are our churn and retention rates?
- How much monthly recurring value did we lose?
- Which contract types, tenure bands, and internet types show the highest churn?

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ TOP — KPI BAN CARDS (single row, 7 cards)                       │
│ Total | Existing | Churned | Retained | Churn% | Retention% | MRVL │
├─────────────────────────────────────────────────────────────────┤
│ MIDDLE LEFT          │ MIDDLE RIGHT                             │
│ Customer Status      │ Churn Rate by Contract (bar)              │
│ composition (stacked │ + churn volume labels                    │
│ bar or highlight tbl)│                                          │
├──────────────────────┼──────────────────────────────────────────┤
│ BOTTOM LEFT          │ BOTTOM RIGHT                             │
│ Churn Rate + Volume  │ Churn Rate by Internet Type (bar)        │
│ by Tenure Band       │ + share-of-all-churn note on tooltip       │
│ (dual-axis or paired)│                                          │
└─────────────────────────────────────────────────────────────────┘
```

### KPI BAN Cards (TOP)

| KPI | Validated Value | Notes |
|---|---:|---|
| Total Customers | 7,043 | All rows |
| Existing Customers | 6,589 | Excludes Joined from churn metrics |
| Churned Customers | 1,869 | |
| Retained Customers | 4,720 | |
| Churn Rate | 28.37% | Churned / Existing |
| Retention Rate | 71.63% | Retained / Existing |
| Monthly Recurring Value Lost | $137,086.65 | SUM(Monthly Charge) WHERE Churned |

**Annotation:** Joined Customers (454) shown in tooltip or small subtitle — not in churn-rate denominator.

### Visuals

| # | Visual | Type | Primary dimensions/measures |
|---|---|---|---|
| 1 | Customer Status Overview | Stacked bar or highlight table | Customer Status, COUNT(Customer ID) |
| 2 | Churn by Contract | Horizontal bar | Contract, Churn Rate, Churned Count |
| 3 | Churn by Tenure Band | Dual-axis bar + line OR paired bars | Tenure_Band (ordered), Churn Rate, Churned Count |
| 4 | Churn by Internet Type | Horizontal bar | Internet Type (exclude N/A), Churn Rate, Share of All Churn |

### Filters (Dashboard 1)

- **Global (workbook):** None required on this dashboard beyond optional Customer Status for detail drill
- **Dashboard-specific:** None — keep executive view unfiltered by default

### Interactions

- Click Contract bar → highlight/filter Dashboard 2 (cross-dashboard action, optional)
- Tooltips show count, rate, and share of all churn

### Annotations

- Footer note: "Churn Rate = Churned / (Churned + Stayed). Joined customers excluded."
- Internet tooltip: default share denominator = all 1,869 churned (66.1% for Fiber)

---

## Dashboard 2 — Churn Drivers & Segments

**Business purpose:** WHERE and AMONG WHOM is churn concentrated?

**Business questions answered:**
- Which customer groups are associated with elevated churn?
- What are the top stated reasons for leaving?
- How concentrated is churn in the high-risk intersection?
- How do Offer and billing variables relate to churn?

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ TOP — Highlight callout cards (3)                                 │
│ M2M+0-6mo+Fiber | Competitor exits | Month-to-Month overview    │
├──────────────────────────────┬──────────────────────────────────┤
│ MIDDLE LEFT                  │ MIDDLE RIGHT                     │
│ Churn Category (ranked bar)    │ Contract × Tenure Band heatmap   │
│ Top 5 Churn Reasons (bar)    │                                  │
├──────────────────────────────┴──────────────────────────────────┤
│ BOTTOM — Priority segment table (highlight table)               │
│ Segment | Customers | Churned | Churn Rate | Share of Churn     │
└─────────────────────────────────────────────────────────────────┘
```

### Highlight Callouts (TOP)

| Callout | Validated Values |
|---|---|
| High-Risk Intersection (M2M + 0–6 mo + Fiber) | 487 customers, 444 churned, 91.17%, 23.76% of all churn |
| Competitor-Attributed Exits | 841 churned, 45.0% of all churn |
| Month-to-Month Contract | 51.69% churn, 1,655 churned, 88.55% of all churn |

Language: "concentrated among," "associated with," "descriptive segment."

### Visuals

| # | Visual | Type | Details |
|---|---|---|---|
| 1 | Churn Category Breakdown | Horizontal ranked bar | Churn Category (churned only), COUNT, % of churned |
| 2 | Top Churn Reasons | Horizontal bar (top 5–8) | Churn Reason, COUNT — label as "stated exit reasons" |
| 3 | Contract × Tenure Heatmap | Heatmap / highlight table | Contract, Tenure_Band (ordered), Churn Rate |
| 4 | Priority Segments Table | Highlight table | See segment list below |
| 5 | Offer Churn Comparison | Horizontal bar | Offer (incl. None), Churn Rate + volume |

**Priority segments table rows:**
- Early-Tenure Month-to-Month (959 / 81.33%)
- Month-to-Month Fiber Optic (1,796 / 61.64%)
- M2M + 0–6 mo + Fiber (487 / 91.17%)
- Stable Two-Year (1,502 / 3.06%)

### Filters (Dashboard 2)

| Filter | Scope | Default |
|---|---|---|
| Contract | Dashboard | All |
| Tenure_Band | Dashboard | All |
| Internet Type | Dashboard | All (exclude N/A from viz when not applicable) |
| Offer | Dashboard | All |

### Interactions

- Heatmap cell click → filter segment table and reason charts
- Segment table row click → highlight matching customers (optional detail sheet)

### Annotations

- Offer E: note "high churn associated with M2M + early tenure — confounded, not causal"
- Churn reasons: "self-reported exit themes, not verified causes"

---

## Dashboard 3 — Retention Opportunities

**Business purpose:** WHAT should the business prioritize?

**Business questions answered:**
- Which Descriptive Churn Risk Tiers contain the most customers and highest churn?
- Where are retention efforts likely to have the largest impact?
- What does a hypothetical retention scenario look like?

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ TOP — Descriptive Churn Risk Tier summary (BAN + bar)           │
├──────────────────────────────┬──────────────────────────────────┤
│ MIDDLE LEFT                  │ MIDDLE RIGHT                     │
│ Churn Rate by Risk Tier (bar)│ Priority segments ranked by      │
│ + customer count labels      │ churn volume (bar)               │
├──────────────────────────────┴──────────────────────────────────┤
│ BOTTOM — Hypothetical Retention Scenario (text + highlight tbl) │
│ Editable parameters in Phase 6 OR static validated scenario      │
└─────────────────────────────────────────────────────────────────┘
```

### Descriptive Churn Risk Tiers (validated)

| Tier | Customers | Churn Rate |
|---|---:|---:|
| Very High (6+ pts) | 2,156 | 66.51% |
| High (4–5) | 1,259 | 20.65% |
| Medium (2–3) | 1,714 | 7.29% |
| Low (0–1) | 1,460 | 3.42% |

**Label required:** "Descriptive Churn Risk Tiers" or "Rule-Based Churn Risk Tiers" — NOT predictive probabilities.

### Hypothetical Retention Scenario (validated, static for Phase 6)

**Segment:** Month-to-Month + 0–6 months + Fiber Optic (churned)  
**Assumption:** Retain 10% of churned in segment

| Output | Value |
|---|---:|
| Observed churned in segment | 444 |
| Potentially retained | 44 |
| Monthly value potentially preserved | $3,524.68 |
| Annualized value potentially preserved | $42,296.22 |

**Required label:** "Illustrative scenario only — not a forecast or causal estimate."

### Visuals

| # | Visual | Type |
|---|---|---|
| 1 | Risk Tier Customer Count | Horizontal bar |
| 2 | Risk Tier Churn Rate | Horizontal bar (sorted by tier order) |
| 3 | Priority Segments by Churn Volume | Ranked horizontal bar |
| 4 | Retention Scenario Summary | Text object + highlight table |
| 5 | Payment Method / Charge Band (supporting) | Small multiples or single bar — contextual only |

### Filters (Dashboard 3)

| Filter | Scope |
|---|---|
| Descriptive Churn Risk Tier | Dashboard |
| Contract | Dashboard (optional) |

### Interactions

- Risk tier click → filter priority segment view
- Scenario section is read-only in Phase 6 (Excel workbook holds editable version)

### Annotations

- Footer: "Risk tiers are rule-based descriptive segments from Phase 4 SQL logic."
- Scenario disclaimer prominently displayed

---

## Workbook Structure (Phase 6)

| Sheet | Content |
|---|---|
| Data | Hidden — connection to customers_clean.csv |
| Dashboard 1 | Executive Churn Overview |
| Dashboard 2 | Churn Drivers & Segments |
| Dashboard 3 | Retention Opportunities |

## Color & Formatting Guidance

- Primary palette: neutral gray background, white cards
- Churn emphasis: `#C00000` (red) for high churn / high risk
- Retained/stable: `#4472C4` (blue)
- KPI cards: large bold number, small gray label
- Percentages: 1 decimal place; currency: $ with commas

## Cross-Dashboard Navigation

- Workbook-level filter sync: Contract, Tenure_Band, Internet Type (optional)
- Dashboard actions: Filter / Highlight between Dashboard 1 ↔ 2
