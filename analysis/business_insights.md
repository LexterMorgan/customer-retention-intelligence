# Customer Churn & Retention — Business Insights

Phase 3 exploratory analysis of `data/processed/customers_clean.csv` (Q2 2022 California telecom snapshot).

**Analysis population:** Existing customers only (`Stayed` + `Churned`) for all churn rates unless noted. `Joined` customers (454) excluded from rate denominators per canonical definition.

---

## Executive Summary

Roughly **1 in 4 existing customers (28.4%) churned** during the observation period. Churn is **not evenly distributed** — it concentrates in a few high-risk profiles:

1. **Month-to-Month contracts** account for **88.6% of all churn** despite being only 48.6% of the existing base.
2. **Early-tenure customers (0–6 months)** have a **77.2% churn rate** and represent **42.0% of all departures**.
3. **The highest-risk combination** is **Month-to-Month + 0–6 months + Fiber Optic** (91.2% churn; 444 churned customers = 23.8% of all churn).
4. **Competitor-related exits** dominate self-reported reasons (**45.0%** of churned customers).
5. **Two-Year contract customers** are comparatively stable (**2.6% churn**).

The business problem is less about uniform customer loss and more about **retention failure in non-committed, early-tenure, fiber-internet customers**.

---

## Overall Churn Baseline

| Metric | Value |
|---|---:|
| Total customers | 7,043 |
| Existing customers (Churned + Stayed) | 6,589 |
| Churned | 1,869 |
| Retained (Stayed) | 4,720 |
| Joined (new, excluded from rates) | 454 |
| **Churn Rate** | **28.37%** |
| **Retention Rate** | **71.63%** |

### Customer Value Comparison (Association Only)

Churned customers differ from retained customers on several value metrics. **These differences are associated with tenure and service mix — not proof that churn caused lower lifetime value.**

| Metric | Churned (mean / median) | Stayed (mean / median) |
|---|---|---|
| Monthly Charge | $73.35 / $79.50 | $61.74 / $65.60 |
| Total Charges | $1,532 / $704 | $2,789 / $1,941 |
| Total Revenue | $1,971 / $894 | $3,736 / $2,960 |
| Tenure (months) | 18.0 / 10.0 | 41.0 / 42.0 |

**Interpretation:** Churned customers tend to be **newer** and have **lower accumulated revenue** because they had less time with the company. They also tend to carry **somewhat higher monthly bills**, which may reflect service bundle differences (e.g., fiber).

---

## Contract Findings

| Contract | Existing Customers | Churned | Churn Rate | Share of All Churn |
|---|---:|---:|---:|---:|
| Month-to-Month | 3,202 | 1,655 | **51.7%** | **88.6%** |
| One Year | 1,526 | 166 | 10.9% | 8.9% |
| Two Year | 1,861 | 48 | **2.6%** | 2.6% |

**Finding:** Month-to-Month customers churn at **20× the rate** of Two-Year customers (51.7% vs 2.6%).

**Business Meaning:** The largest **volume** and **rate** of customer loss is concentrated among customers without long-term commitment. This is the single strongest structural driver in the dataset.

**Potential Action:** Investigate retention programs targeting Month-to-Month customers — especially early-tenure and fiber segments (see multivariate analysis). Consider contract conversion incentives for high-value Month-to-Month accounts.

**Priority:** HIGH

---

## Tenure Findings

| Tenure Band | Existing Customers | Churned | Churn Rate | Share of All Churn |
|---|---:|---:|---:|---:|
| 0–6 months | 1,016 | 784 | **77.2%** | **42.0%** |
| 7–12 months | 716 | 253 | 35.3% | 13.5% |
| 13–24 months | 1,024 | 294 | 28.7% | 15.7% |
| 25–36 months | 832 | 180 | 21.6% | 9.6% |
| 37–48 months | 762 | 145 | 19.0% | 7.8% |
| 49–72 months | 2,239 | 213 | **9.5%** | 11.4% |

**Finding:** Churn is heavily front-loaded. More than **4 in 10 departures** occur in the first 6 months. Churn rate drops steadily as tenure increases.

**Business Meaning:** Onboarding and early lifecycle experience appear critical. Customers who survive past ~4 years churn at less than one-third of the overall rate.

**Potential Action:** Prioritize early-tenure retention touchpoints (welcome calls, service checks, contract upgrade offers) before customers reach the 6-month mark.

**Priority:** HIGH

---

## Service & Add-On Findings

### Internet Type (internet customers only)

| Internet Type | Existing Customers | Churn Rate | Share of Internet Churn |
|---|---:|---:|---:|
| Fiber Optic | 2,934 | **42.1%** | **70.4%** |
| Cable | 774 | 27.5% | 12.1% |
| DSL | 1,537 | 20.0% | 17.5% |

**Finding:** Fiber Optic customers churn at roughly **2× the rate** of DSL customers and account for **7 in 10 churned internet customers** (70.4% of 1,756 internet churners).

**Share-of-churn convention:** For executive and business-impact views, use **share of all churn** (Fiber = **66.1%** of 1,869 total churners). The 70.4% figure above uses an internet-customer churn denominator and is appropriate only when the analysis scope is internet customers.

**Business Meaning:** Fiber may attract less committed customers, or early fiber experiences may underperform expectations. This is an association — fiber may also correlate with Month-to-Month contracts and shorter tenure.

**Potential Action:** Investigate fiber onboarding quality, pricing competitiveness, and competitor offers in fiber markets.

**Priority:** HIGH (especially combined with contract/tenure)

### Add-On Count (internet customers only)

| Add-Ons Subscribed | Churn Rate |
|---|---:|
| 0 | 60.3% |
| 1 | 59.2% |
| 2–3 | 40–45% |
| 4–5 | 29–32% |
| 6–7 | 11–21% |
| 8 | **4.9%** |

**Finding:** Customers with **more internet add-ons show lower churn**. This likely reflects deeper product engagement and/or longer relationships — not proof that add-ons prevent churn.

**Business Meaning:** Highly engaged bundle subscribers appear more retained. Low add-on fiber customers may represent a less sticky profile.

**Potential Action:** Explore bundle adoption campaigns for early-tenure fiber customers — as a hypothesis worth testing, not a guaranteed fix.

**Priority:** MEDIUM (contextual — may reflect tenure/confounding)

---

## Offer Findings

| Offer | Existing Customers | Churn Rate | Share of All Churn |
|---|---:|---:|---:|
| Offer E | 630 | **67.6%** | 22.8% |
| None | 3,598 | 29.2% | 56.2% |
| Offer D | 602 | 26.7% | 8.6% |
| Offer C | 415 | 22.9% | 5.1% |
| Offer B | 824 | 12.3% | 5.4% |
| Offer A | 520 | **6.7%** | 1.9% |

### Offer E Context Check

| Segment | Churn Rate |
|---|---:|
| All Offer E | 67.6% |
| Offer E + Month-to-Month | 74.6% |
| Offer E + 0–6 months | 79.8% |
| Offer E + Month-to-Month + 0–6 months | **83.9%** |
| Offer E + Fiber Optic | 81.4% |
| All non-Offer E | 24.2% |

**Finding:** Offer E shows very high churn, but the pattern is **largely confounded** by contract type, tenure, and internet type. When Offer E appears on One Year contracts, churn drops to **12.1%** (n=33).

**Business Meaning:** Offer E is likely a **short-term promotional offer** attracting Month-to-Month, early-tenure customers — not necessarily a causal driver of churn by itself.

**Potential Action:** Review Offer E targeting and qualification criteria. Compare Offer E customer journey vs. Offer A/B (6.7–12.3% churn).

**Priority:** MEDIUM (important anomaly, but confounded)

---

## Churn Reasons

### Top Exit Categories (churned customers only)

| Churn Category | Count | % of Churned |
|---|---:|---:|
| **Competitor** | 841 | **45.0%** |
| Dissatisfaction | 321 | 17.2% |
| Attitude | 314 | 16.8% |
| Price | 211 | 11.3% |
| Other | 182 | 9.7% |

### Top Specific Reasons

| Churn Reason | Count | % of Churned |
|---|---:|---:|
| Competitor had better devices | 313 | 16.8% |
| Competitor made better offer | 311 | 16.6% |
| Attitude of support person | 220 | 11.8% |
| Competitor offered more data | 117 | 6.3% |
| Competitor offered higher download speeds | 100 | 5.4% |

**Finding:** Nearly **half of churned customers** cite competitor-related reasons. Combined competitor sub-reasons (devices, offers, data, speeds) exceed **45%**.

**Business Meaning:** Competitive pressure — particularly on **devices, pricing, and speed/data** — is the dominant *stated* reason for departure. Service attitude issues are the next-largest theme.

**Potential Action:** Conduct competitive benchmarking on fiber pricing, device offerings, and speed tiers in high-churn markets. Review support interactions for attitude-related churn.

**Priority:** HIGH (for strategic investigation)

**Caveat:** Self-reported exit reasons describe what customers *said* — not verified causes.

---

## Billing & Payment Findings

### Payment Method

| Payment Method | Churn Rate | Share of All Churn |
|---|---:|---:|
| Mailed Check | 41.4% | 7.6% |
| Bank Withdrawal | 35.7% | **71.1%** |
| Credit Card | 15.8% | 21.3% |

### Paperless Billing

| Paperless | Churn Rate | Share of All Churn |
|---|---:|---:|
| Yes | 35.2% | **74.9%** |
| No | 17.9% | 25.1% |

### Charge Band

| Charge Band | Churn Rate | Share of All Churn |
|---|---:|---:|
| $70–89 | 39.8% | **36.9%** |
| $90+ | 33.4% | 30.4% |
| Low (<$30) | 11.1% | 8.4% |

**Finding:** Bank Withdrawal and Paperless Billing customers show higher churn rates — but these groups also overlap heavily with Month-to-Month and fiber segments. Credit Card customers churn at **15.8%**. Mid-to-high charge bands ($70+) carry the most churn volume.

**Business Meaning:** Billing preferences may proxy for customer type rather than cause churn directly. Higher monthly charges are associated with higher churn — likely linked to fiber and bundle pricing.

**Potential Action:** Treat billing variables as **segment descriptors** in dashboards, not standalone intervention levers, until further analysis controls for contract/tenure.

**Priority:** MEDIUM (contextual — likely confounded)

**Note:** **120 customers** dataset-wide have negative Monthly Charge (`Flag_Negative_Monthly_Charge = 1`): Churned 30, Stayed 84, Joined 6. Of these, **114 are existing customers** (Churned + Stayed) and appear in churn-rate analyses; 6 Joined customers are excluded from churn denominators. All were retained in analysis — not removed or corrected.

---

## Demographic Findings

| Dimension | Highest Churn | Lowest Churn | Notes |
|---|---|---|---|
| Age Band | 70+ (42.9%) | Under 30 (23.4%) | Older customers churn more |
| Gender | Female 28.7% vs Male 28.1% | — | **Minimal difference** |
| Married | No (36.7%) | Yes (20.2%) | Not married ≈ 1.8× churn rate |
| Dependents | No dependents (35.0%) | Has dependents (6.9%) | Strongest demographic split |

**Finding:** Gender is **not** a meaningful churn differentiator. **Marital status and dependents** show stronger associations — customers without dependents churn at **35.0%** vs **6.9%** for those with dependents.

**Business Meaning:** Household stability (dependents) may correlate with longer commitments and lower churn — or with different contract/service choices.

**Potential Action:** Use demographic variables as **filters/segment descriptors**, not primary intervention targets, unless combined with contract/tenure risk.

**Priority:** MEDIUM for Married/Dependents; CONTEXTUAL for Gender/Age

---

## Geographic Findings

**Minimum sample threshold:** 20 existing customers per city (to avoid ranking tiny markets with extreme percentages).

| City | Existing Customers | Churn Rate |
|---|---:|---:|
| San Diego | 278 | 66.6% |
| Fallbrook | 41 | 63.4% |
| Temecula | 36 | 61.1% |
| Bakersfield | 35 | **5.7%** |
| Chula Vista | 20 | **10.0%** |

**Finding:** Churn varies geographically. San Diego stands out with both **large volume (278 customers)** and **high rate (66.6%)**.

**Business Meaning:** Some markets may face stronger competitive pressure or service issues. Small cities with extreme rates (e.g., Fallbrook, n=41) should be interpreted cautiously.

**Potential Action:** Prioritize market-level review for **San Diego** (volume + rate). Use geographic filters in dashboards with sample-size awareness.

**Priority:** MEDIUM for San Diego; CONTEXTUAL for small cities

---

## High-Risk Segment Interactions

### Contract × Tenure (highest-risk cells)

| Contract | Tenure | Segment Size | Churn Rate | Share of All Churn |
|---|---|---:|---:|---:|
| Month-to-Month | 0–6 months | 959 | **81.3%** | **41.7%** |
| Month-to-Month | 7–12 months | 546 | 44.7% | 13.1% |
| Two Year | 49–72 months | 643 | 12.8% | 4.4% |

### Contract × Internet Type

| Contract | Internet | Segment Size | Churn Rate | Share of All Churn |
|---|---|---:|---:|---:|
| Month-to-Month | Fiber Optic | 1,796 | **61.6%** | **59.2%** |
| Month-to-Month | Cable | 369 | 50.7% | 10.0% |
| Two Year | Fiber Optic | 555 | 5.6% | 1.7% |

### Contract × Tenure × Internet (top cell)

| Segment | Size | Churn Rate | Share of All Churn |
|---|---:|---:|---:|
| Month-to-Month + 0–6 mo + Fiber | 487 | **91.2%** | **23.8%** |
| Month-to-Month + 0–6 mo + Cable | 127 | 78.7% | 5.4% |
| Month-to-Month + 0–6 mo + DSL | 212 | 75.5% | 8.6% |

**Finding:** The **single most actionable high-risk profile** is Month-to-Month, early-tenure, fiber customers — a relatively large group (487) with >90% churn.

**Priority:** HIGH

---

## Proposed Customer Segments

These are **descriptive retention segments** based on EDA evidence — not predictive risk scores. Some segments overlap by design.

### 1. Early-Tenure Month-to-Month
- **Definition:** Contract = Month-to-Month AND Tenure_Band = 0–6 months
- **Count:** 959 existing | **Churned:** 780 | **Rate:** 81.3% | **Share of churn:** 41.7%
- **Why it matters:** Largest concentration of early departures; more than 4 in 10 churned customers fit this profile.

### 2. Month-to-Month Fiber Optic
- **Definition:** Contract = Month-to-Month AND Internet Type = Fiber Optic
- **Count:** 1,796 | **Churned:** 1,107 | **Rate:** 61.6% | **Share of churn:** 59.2%
- **Why it matters:** Fiber on flexible contracts drives the majority of churn volume.

### 3. Month-to-Month Without Dependents
- **Definition:** Contract = Month-to-Month AND Number of Dependents = 0
- **Count:** 2,662 | **Churned:** 1,549 | **Rate:** 58.2% | **Share of churn:** 82.9%
- **Why it matters:** Broad segment capturing non-committed household profiles; useful as a filter, overlaps with segments 1 and 2.

### 4. Stable Two-Year Customers
- **Definition:** Contract = Two Year AND Tenure_Band in (37–48 months, 49–72 months)
- **Count:** 1,502 | **Churned:** 46 | **Rate:** 3.1% | **Share of churn:** 2.5%
- **Why it matters:** Protective segment — long-committed customers with very low churn. Model for retention success.

### 5. Long-Tenure Customer Base
- **Definition:** Tenure_Band = 49–72 months (all contracts)
- **Count:** 2,239 | **Churned:** 213 | **Rate:** 9.5% | **Share of churn:** 11.4%
- **Why it matters:** Core loyal base; retention focus shifts from prevention to protection/upsell.

### 6. Competitor-Attributed Churners (exit profile)
- **Definition:** Churn Category = Competitor (churned customers only)
- **Count:** 841 churned | **Share of all churn:** 45.0%
- **Why it matters:** Defines the competitive battleground — devices, pricing, speed/data.

---

## Prioritized Findings

| Priority | Finding | Rate | Volume Impact |
|---|---|---:|---|
| **HIGH** | Month-to-Month contract churn | 51.7% | 88.6% of all churn |
| **HIGH** | Early tenure (0–6 months) churn | 77.2% | 42.0% of all churn |
| **HIGH** | Month-to-Month + early + Fiber | 91.2% | 23.8% of all churn |
| **HIGH** | Competitor cited as exit reason | — | 45.0% of churned |
| **HIGH** | Fiber Optic churn (internet) | 42.1% | 66.1% of all churn / 70.4% of internet churn |
| **MEDIUM** | Offer E (confounded by contract/tenure) | 67.6% | 22.8% of all churn |
| **MEDIUM** | Not married / no dependents | 36.7% / 35.0% | 64.2% / 94.3% of churn |
| **MEDIUM** | San Diego geographic concentration | 66.6% | n=278 |
| **CONTEXTUAL** | Gender difference | ~28% both | Minimal |
| **CONTEXTUAL** | Paperless / Bank Withdrawal | 35.2% / 35.7% | Likely confounded |

---

## Potential Retention Actions

| # | Action | Based On | Type |
|---|---|---|---|
| 1 | Early-tenure outreach program for Month-to-Month customers | 81.3% churn in 0–6 mo M2M | Hypothesis |
| 2 | Contract conversion incentives for high-value Month-to-Month fiber | 61.6% M2M fiber churn | Hypothesis |
| 3 | Competitive benchmarking on fiber pricing/devices/speeds | 45% competitor exits | Investigation |
| 4 | Review Offer E targeting criteria | 83.9% when M2M + early tenure | Investigation |
| 5 | Protect and upsell Two-Year / long-tenure base | 2.6–9.5% churn | Strategy |
| 6 | Market review in San Diego | 66.6% churn, n=278 | Investigation |

All actions are **recommendations to investigate** — not proven interventions.

---

## Limitations & Interpretation Warnings

1. **Snapshot data** — Q2 2022 only; no trend over time.
2. **Association ≠ causation** — all findings describe patterns, not proven drivers.
3. **Self-reported churn reasons** — subjective exit survey responses.
4. **Confounding** — contract, tenure, internet type, and offer overlap heavily.
5. **Segment overlap** — proposed segments are not mutually exclusive.
6. **Historical value metrics** — Total Revenue/Charges reflect tenure length, not just customer quality.
7. **Geographic small samples** — cities below 20 customers excluded from rankings.
8. **No predictive modeling** — segments are descriptive, not scored propensities.

---

## Dashboard Recommendations

*(For future Tableau/Excel — do not build yet)*

### A. Executive KPIs
- Total Existing Customers
- Churned / Retained Counts
- Churn Rate (28.4%) and Retention Rate (71.6%)
- New Customers Joined (454)
- Monthly Recurring Value Lost (from churned Monthly Charge)
- Top Churn Category (Competitor)

### B. Essential Charts
1. Churn Rate by Contract Type
2. Churn Volume + Rate by Tenure Band
3. Churn Rate by Internet Type
4. Contract × Tenure Heatmap
5. Top Churn Categories (bar/Pareto)
6. Churn Rate by Charge Band
7. Churn Rate by Payment Method
8. Monthly Charge Distribution (Churned vs Stayed)

### C. Useful Filters
- Customer Status (for detail views)
- Contract, Tenure_Band, Internet Type
- Offer, Age_Band, Married
- City (with sample-size warning)
- Paperless Billing, Payment Method

### D. Important Segment Views
- Early-Tenure Month-to-Month segment
- Month-to-Month Fiber segment
- Stable Two-Year segment
- Competitor-Attributed churn breakdown
- Descriptive Churn Risk Tiers (rule-based; not predictive-model outputs)

### E. NOT Dashboard Priority
- Gender (minimal difference)
- Small-city geographic rankings
- Individual churn reason text (too granular for executive view)
- Add-on count as standalone KPI (better as supporting detail)
- Negative charge flag (data quality note, not executive metric)

---

*Generated by Phase 3 EDA — `analysis/exploratory_analysis.py`*
