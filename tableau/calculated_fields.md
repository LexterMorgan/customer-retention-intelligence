# Tableau Calculated Fields

**Data source:** `data/processed/customers_clean.csv`  
**Rule:** Reuse existing columns where available. Joined customers excluded from churn/retention denominators.

---

## Existing Columns (Use Directly — Do Not Recreate)

| Column | Use |
|---|---|
| `Customer ID` | Primary key, counts |
| `Customer Status` | Churned / Stayed / Joined |
| `Is_Churned` | 1/0 flag (existing customers) |
| `Is_Retained` | 1/0 flag (existing customers) |
| `Tenure_Band` | Segmentation (pre-calculated) |
| `Age_Band` | Filter/dimension |
| `Charge_Band` | Supporting billing view |
| `Monthly Charge` | Value metrics |
| `Total Revenue` | Historical value (context only) |
| `Contract`, `Internet Type`, `Offer`, etc. | Dimensions |

---

## Required Calculated Fields

### 1. Existing Customer Flag

| | |
|---|---|
| **Field Name** | `Existing Customer Flag` |
| **Formula** | `[Customer Status] = "Churned" OR [Customer Status] = "Stayed"` |
| **Business Definition** | TRUE when customer is in the churn/retention analysis population |
| **Used In** | KPI denominators, filter context |

---

### 2. Churned Customer Flag

| | |
|---|---|
| **Field Name** | `Churned Customer Flag` |
| **Formula** | `[Customer Status] = "Churned"` |
| **Business Definition** | TRUE for customers who left |
| **Used In** | Churn counts, MRVL, churn rate numerator |

---

### 3. Retained Customer Flag

| | |
|---|---|
| **Field Name** | `Retained Customer Flag` |
| **Formula** | `[Customer Status] = "Stayed"` |
| **Business Definition** | TRUE for customers who remained |
| **Used In** | Retention counts, retention rate numerator |

---

### 4. Churn Rate

| | |
|---|---|
| **Field Name** | `Churn Rate` |
| **Formula** | `SUM(INT([Churned Customer Flag])) / SUM(INT([Existing Customer Flag]))` |
| **Format** | Percentage, 2 decimals |
| **Business Definition** | Churned / Existing Customers. Joined excluded. |
| **Used In** | Dashboard 1 KPI, all churn rate bars |

**Tableau note:** Use `{ FIXED : ... }` only if blending — with single source, standard aggregation suffices.

---

### 5. Retention Rate

| | |
|---|---|
| **Field Name** | `Retention Rate` |
| **Formula** | `SUM(INT([Retained Customer Flag])) / SUM(INT([Existing Customer Flag]))` |
| **Format** | Percentage, 2 decimals |
| **Business Definition** | Retained / Existing Customers |
| **Used In** | Dashboard 1 KPI |

---

### 6. Churned Count

| | |
|---|---|
| **Field Name** | `Churned Count` |
| **Formula** | `SUM(INT([Churned Customer Flag]))` |
| **Business Definition** | Count of churned customers in current view |
| **Used In** | Volume bars, segment tables |

---

### 7. Existing Customer Count

| | |
|---|---|
| **Field Name** | `Existing Customer Count` |
| **Formula** | `SUM(INT([Existing Customer Flag]))` |
| **Business Definition** | Count of existing customers in current view |
| **Used In** | Segment tables, denominators |

---

### 8. Share of All Churn

| | |
|---|---|
| **Field Name** | `Share of All Churn` |
| **Formula** | `SUM(INT([Churned Customer Flag])) / { FIXED : SUM(INT([Churned Customer Flag])) }` |
| **Format** | Percentage, 1 decimal |
| **Business Definition** | Segment churned / total churned (1,869 baseline). **Default executive denominator.** |
| **Used In** | Dashboard 1 Internet Type tooltip, Dashboard 2 segments |

**Tooltip note for Fiber:** 66.1% of all churn (default). Use separate field below for internet-only context.

---

### 9. Share of Internet Churn (Optional — Label Explicitly)

| | |
|---|---|
| **Field Name** | `Share of Internet Churn` |
| **Formula** | `SUM(INT([Churned Customer Flag])) / { FIXED : SUM(IF [Internet Type] != "N/A" THEN INT([Churned Customer Flag]) END) }` |
| **Format** | Percentage, 1 decimal |
| **Business Definition** | Segment churned / churned internet customers (1,756). **Use only when labeled "Share of Internet-Customer Churn."** |
| **Used In** | Dashboard 1 Internet section (optional secondary tooltip) |

---

### 10. Monthly Recurring Value Lost

| | |
|---|---|
| **Field Name** | `Monthly Recurring Value Lost` |
| **Formula** | `SUM(IF [Customer Status] = "Churned" THEN [Monthly Charge] END)` |
| **Format** | Currency |
| **Business Definition** | Sum of current monthly bills for churned customers ($137,086.65 total) |
| **Used In** | Dashboard 1 KPI |

---

### 11. Tenure Band Sort Order

| | |
|---|---|
| **Field Name** | `Tenure Band Sort` |
| **Formula** | ```
CASE [Tenure_Band]
  WHEN "0-6 months"   THEN 1
  WHEN "7-12 months"  THEN 2
  WHEN "13-24 months" THEN 3
  WHEN "25-36 months" THEN 4
  WHEN "37-48 months" THEN 5
  WHEN "49-72 months" THEN 6
  ELSE 99
END
``` |
| **Business Definition** | Logical lifecycle ordering (not alphabetical) |
| **Used In** | All tenure band visuals — sort by this field ascending |

---

### 12. High-Risk Intersection Flag

| | |
|---|---|
| **Field Name** | `High Risk Intersection Flag` |
| **Formula** | `[Contract] = "Month-to-Month" AND [Tenure_Band] = "0-6 months" AND [Internet Type] = "Fiber Optic"` |
| **Business Definition** | Descriptive segment: M2M + early tenure + Fiber (487 customers, 91.17% churn) |
| **Used In** | Dashboard 2 callout, Dashboard 3 scenario |

---

### 13. Risk Points (Rule-Based)

| | |
|---|---|
| **Field Name** | `Risk Points` |
| **Formula** | ```
(IF [Contract] = "Month-to-Month" THEN 3 ELSE 0 END)
+ (IF [Tenure_Band] = "0-6 months" THEN 3 ELSE 0 END)
+ (IF [Internet Type] = "Fiber Optic" THEN 2 ELSE 0 END)
+ (IF [Number of Dependents] = 0 THEN 1 ELSE 0 END)
+ (IF [Married] = "No" THEN 1 ELSE 0 END)
``` |
| **Business Definition** | Rule-based score from Phase 4 SQL logic. NOT a predictive model. |
| **Used In** | Risk tier derivation |

---

### 14. Descriptive Churn Risk Tier

| | |
|---|---|
| **Field Name** | `Descriptive Churn Risk Tier` |
| **Formula** | ```
IF [Risk Points] >= 6 THEN "Very High"
ELSEIF [Risk Points] >= 4 THEN "High"
ELSEIF [Risk Points] >= 2 THEN "Medium"
ELSE "Low"
END
``` |
| **Business Definition** | Rule-Based Churn Risk Tier. Descriptive segmentation only. |
| **Used In** | Dashboard 3 — label as "Descriptive Churn Risk Tiers" |
| **Sort Order** | Very High → High → Medium → Low (custom sort) |

---

### 15. Internet Customer Flag

| | |
|---|---|
| **Field Name** | `Internet Customer Flag` |
| **Formula** | `[Internet Type] != "N/A"` |
| **Business Definition** | TRUE when customer has internet service |
| **Used In** | Filter internet-only analyses; exclude N/A from Internet Type charts |

---

## Fields NOT Required

Do not create unless Phase 6 discovers a gap:

- Predictive churn probability
- ML risk score
- Revenue at Risk (use Monthly Recurring Value Lost instead)
- Duplicate Tenure_Band / Age_Band / Charge_Band (already in dataset)

---

## Phase 6 Implementation Dependency

**Descriptive Churn Risk Tier** is NOT in `customers_clean.csv`. Phase 6 must create calculated fields #13 and #14 in Tableau using formulas above. No new dataset required.

---

## Metric Governance Reminders

| Metric | Rule |
|---|---|
| Churn Rate denominator | Existing customers only (exclude Joined) |
| Share of Churn (default) | All 1,869 churned |
| Share of Internet Churn | Label explicitly; 1,756 denominator |
| Fiber share | 66.1% default executive; 70.4% internet-only if labeled |
| Negative charges | 120 dataset-wide; 114 existing — do not filter out |
