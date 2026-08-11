# Tableau Visual Mapping

Maps each planned visual to dimensions, measures, and validated expected results.  
**Build reference for Phase 6.**

---

## Dashboard 1 — Executive Churn Overview

| # | Visual Name | Chart Type | Dimension(s) | Measure(s) | Filter(s) | Sort | Business Question | Expected Result |
|---|---|---|---|---|---|---|---|---|
| 1.1 | Total Customers KPI | BAN / Text | — | COUNT(Customer ID) | None | — | How many total customers? | 7,043 |
| 1.2 | Existing Customers KPI | BAN | — | Existing Customer Count | None | — | How many existing customers? | 6,589 |
| 1.3 | Churned Customers KPI | BAN | — | Churned Count | None | — | How many churned? | 1,869 |
| 1.4 | Retained Customers KPI | BAN | — | SUM(Retained Customer Flag) | None | — | How many retained? | 4,720 |
| 1.5 | Churn Rate KPI | BAN | — | Churn Rate | None | — | What is churn rate? | 28.37% |
| 1.6 | Retention Rate KPI | BAN | — | Retention Rate | None | — | What is retention rate? | 71.63% |
| 1.7 | MRVL KPI | BAN | — | Monthly Recurring Value Lost | None | — | Monthly value lost? | $137,086.65 |
| 1.8 | Customer Status Composition | Stacked bar | Customer Status | COUNT(Customer ID) | None | Churned, Stayed, Joined | How are customers distributed by status? | 4,720 / 1,869 / 454 |
| 1.9 | Churn Rate by Contract | Horizontal bar | Contract | Churn Rate, Churned Count | Existing only | Rate DESC | Which contract churns most? | M2M 51.69%, Two Year 2.58% |
| 1.10 | Churn by Tenure Band | Dual-axis bar+line OR paired bars | Tenure_Band | Churn Rate, Churned Count | Existing only | Tenure Band Sort ASC | When does churn peak? | 0–6 mo: 77.17%, 784 churned |
| 1.11 | Churn by Internet Type | Horizontal bar | Internet Type | Churn Rate, Share of All Churn | Internet Customer Flag = TRUE | Rate DESC | Which internet type associated with highest churn? | Fiber 42.13%, 66.1% of all churn |

---

## Dashboard 2 — Churn Drivers & Segments

| # | Visual Name | Chart Type | Dimension(s) | Measure(s) | Filter(s) | Sort | Business Question | Expected Result |
|---|---|---|---|---|---|---|---|---|
| 2.1 | High-Risk Callout | Text / BAN | — | High Risk Intersection metrics | M2M + 0–6 mo + Fiber | — | How severe is top intersection? | 487 / 444 / 91.17% / 23.76% |
| 2.2 | Competitor Callout | Text / BAN | Churn Category | COUNT (churned) | Customer Status = Churned | — | Top exit theme? | 841 / 45.0% |
| 2.3 | Churn Category Breakdown | Horizontal ranked bar | Churn Category | COUNT, % of churned | Churned only | Count DESC | What categories dominate exits? | Competitor 45.0% first |
| 2.4 | Top Churn Reasons | Horizontal bar (Top 8) | Churn Reason | COUNT, % of churned | Churned only | Count DESC | Specific stated reasons? | Better devices 16.75%, better offer 16.64% |
| 2.5 | Contract × Tenure Heatmap | Heatmap | Contract, Tenure_Band | Churn Rate | Existing; Internet N/A ok | Tenure Sort ASC | Where do contract and tenure intersect? | M2M + 0–6 mo: 81.33% |
| 2.6 | Priority Segments Table | Highlight table | Segment (calculated or set) | Customers, Churned, Churn Rate, Share of All Churn | Existing | Rate DESC | Key descriptive segments? | See dashboard_spec segment list |
| 2.7 | Churn by Offer | Horizontal bar | Offer | Churn Rate, Churned Count | Existing | Rate DESC | Offer-associated churn patterns? | Offer E 67.62% (confounded) |

**Segment calculated fields for 2.6 (boolean flags or sets):**
- Early-Tenure M2M: Contract = M2M AND Tenure_Band = 0–6 months
- M2M Fiber: Contract = M2M AND Internet Type = Fiber Optic
- High-Risk Intersection: per field #12 in calculated_fields.md
- Stable Two-Year: Contract = Two Year AND Tenure_Band IN (37–48, 49–72 months)

---

## Dashboard 3 — Retention Opportunities

| # | Visual Name | Chart Type | Dimension(s) | Measure(s) | Filter(s) | Sort | Business Question | Expected Result |
|---|---|---|---|---|---|---|---|---|
| 3.1 | Risk Tier Customer Count | Horizontal bar | Descriptive Churn Risk Tier | COUNT(Customer ID) | Existing | Tier order | How many in each tier? | Very High 2,156 |
| 3.2 | Risk Tier Churn Rate | Horizontal bar | Descriptive Churn Risk Tier | Churn Rate | Existing | Tier order | Do tiers separate churn? | Very High 66.51%, Low 3.42% |
| 3.3 | Segments by Churn Volume | Ranked horizontal bar | Segment name | Churned Count | Existing | Volume DESC | Where is churn volume largest? | M2M No Dependents 1,549* |
| 3.4 | Hypothetical Scenario | Text + highlight table | — | Static validated values | — | — | Illustrative retention impact? | 44 / $3,524.68 / $42,296.22 |
| 3.5 | Payment Method (context) | Horizontal bar | Payment Method | Churn Rate, Churned Count | Existing | Rate DESC | Billing association? | Bank Withdrawal 35.65% |
| 3.6 | Charge Band (context) | Horizontal bar | Charge_Band | Churn Rate | Existing | Rate DESC | Value band association? | $70–89: 39.84% |

*M2M No Dependents overlaps other segments — note in annotation.

---

## Global Filter Mapping

| Filter | Dashboard 1 | Dashboard 2 | Dashboard 3 | Behavior |
|---|---|---|---|---|
| Contract | — | ✓ | Optional | Cross-filter Dashboard 2 visuals |
| Tenure_Band | — | ✓ | — | Cross-filter heatmap + segments |
| Internet Type | — | ✓ | — | Exclude N/A default |
| Offer | — | ✓ | — | Dashboard 2 only |
| Age_Band | — | Optional | — | Secondary only |
| Payment Method | — | — | Optional | Dashboard 3 context |
| Descriptive Churn Risk Tier | — | — | ✓ | Dashboard 3 primary |

**Workbook-level sync:** Contract + Tenure_Band (optional, Phase 6 decision)

---

## Interaction Summary

| Action | Source | Target | Type |
|---|---|---|---|
| Contract click | Dashboard 1 bar | Dashboard 2 | Filter (optional action) |
| Heatmap cell | Dashboard 2 | Segment table | Highlight |
| Risk tier click | Dashboard 3 | Segment volume bar | Filter |

---

## Visual Count Check

| Dashboard | Visuals | Within 5–7 limit? |
|---|---:|---|
| Dashboard 1 | 7 (4 KPI groups + 4 charts — KPIs count as one row) | ✓ |
| Dashboard 2 | 7 | ✓ |
| Dashboard 3 | 6 | ✓ |

---

## Chart Types to Avoid

- Pie charts (except possibly Customer Status if single small donut — prefer stacked bar)
- 3D bars
- Gauges for churn rate
- Maps (geographic deprioritized per Phase 3/4)
