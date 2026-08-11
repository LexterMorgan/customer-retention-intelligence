# SQL Business Findings

Independent confirmation of Phase 3 insights via SQL analysis on `sql/customer_churn.db`.

All churn rates exclude `Joined` customers from denominators unless noted.

---

## 1. KPI Reconciliation

**FACT:** SQL results match Phase 2 and Phase 3 exactly on all core KPIs.

| Metric | SQL Result | Phase 3 | Match |
|---|---:|---:|---|
| Total customers | 7,043 | 7,043 | Yes |
| Existing customers | 6,589 | 6,589 | Yes |
| Churned | 1,869 | 1,869 | Yes |
| Retained | 4,720 | 4,720 | Yes |
| Joined | 454 | 454 | Yes |
| Churn rate | 28.37% | 28.37% | Yes |
| Retention rate | 71.63% | 71.63% | Yes |
| Monthly Recurring Value Lost | $137,086.65 | — | SQL-derived |
| Historical revenue (churned) | $3,684,459.82 | — | SQL-derived |

No discrepancies in KPI definitions or counts.

---

## 2. Strongest Churn Patterns (SQL-Confirmed)

### Contract — HIGH PRIORITY

**FACT:**
| Contract | Churn Rate | Churned | Share of All Churn |
|---|---:|---:|---:|
| Month-to-Month | 51.69% | 1,655 | 88.55% |
| One Year | 10.88% | 166 | 8.88% |
| Two Year | 2.58% | 48 | 2.57% |

**INTERPRETATION:** Month-to-Month customers drive nearly all churn volume at the highest rate.

### Tenure — HIGH PRIORITY

**FACT:**
| Tenure Band | Churn Rate | Churned | Share of All Churn |
|---|---:|---:|---:|
| 0–6 months | 77.17% | 784 | 41.95% |
| 49–72 months | 9.51% | 213 | 11.40% |

**INTERPRETATION:** Churn is front-loaded in the first 6 months.

### Internet Type — HIGH PRIORITY

**FACT:**
| Internet Type | Churn Rate | Churned |
|---|---:|---:|
| Fiber Optic | 42.13% | 1,236 |
| Cable | 27.52% | 213 |
| DSL | 19.97% | 307 |

**INTERPRETATION:** Fiber Optic customers show the highest churn rate among internet types. This is an association — fiber correlates with Month-to-Month contracts and shorter tenure.

### Share-of-Churn Denominator Convention

| Metric | Value | Denominator | Use |
|---|---:|---|---|
| **Share of all churn (default)** | **66.1%** | All 1,869 churned customers (1,236 ÷ 1,869) | Executive KPIs, business-impact views, cross-dimension comparisons |
| Share of internet churn | 70.4% | 1,756 churned internet customers (1,236 ÷ 1,756) | Internet-only analysis sections/charts |

**Default convention:** Use **share of all churn (66.1%)** unless a chart or table explicitly analyzes internet customers only. Phase 3 EDA used the internet-customer denominator (70.4%) in its internet-type table; SQL uses the all-churn denominator consistently. Churn counts (1,236) and rates (42.13%) match exactly — only the share label differs.

---

## 3. Highest-Risk Customer Profiles

**FACT:** From `09_high_risk_segments.sql` (segments overlap):

| Segment | Customers | Churn Rate | Share of All Churn |
|---|---:|---:|---:|
| M2M + 0–6 mo + Fiber Optic | 487 | **91.17%** | 23.76% |
| Early-Tenure Month-to-Month | 959 | 81.33% | 41.73% |
| Month-to-Month Fiber Optic | 1,796 | 61.64% | 59.23% |
| Month-to-Month No Dependents | 2,662 | 58.19% | 82.88% |
| Stable Two-Year Customers | 1,502 | 3.06% | 2.46% |
| Long-Tenure Base | 2,239 | 9.51% | 11.40% |

**INTERPRETATION:** The highest-risk intersection (Month-to-Month + early tenure + Fiber) matches Phase 3 exactly: 487 customers, 444 churned, 91.17% churn.

---

## 4. Churn Reason Themes

**FACT:** (churned customers only)

| Churn Category | Count | % of Churned |
|---|---:|---:|
| Competitor | 841 | 45.00% |
| Dissatisfaction | 321 | 17.17% |
| Attitude | 314 | 16.80% |
| Price | 211 | 11.29% |

Top stated reasons: competitor devices (16.75%), competitor offer (16.64%), support attitude (11.77%).

**INTERPRETATION:** Competitive pressure dominates self-reported exit themes. These are stated reasons, not verified causes.

---

## 5. Business Value Implications

**FACT:**
| Metric | Churned | Retained |
|---|---:|---:|
| Avg Monthly Charge | $73.35 | $61.74 |
| Total Monthly Charge | $137,086.65 | $291,400.60 |
| Total Historical Revenue | $3,684,459.82 | $17,632,392.12 |

**FACT:** Month-to-Month churn alone represents **$118,802.90/month** in recurring value lost (1,655 churned customers).

**INTERPRETATION:** Churned customers carry higher monthly bills on average, but lower historical revenue due to shorter tenure (association, not causation).

---

## 6. Rule-Based Churn Risk Tiers (Descriptive — Not Predictive)

**FACT:** SQL CASE-based **Descriptive Churn Risk Tiers** (also called **Rule-Based Churn Risk Tiers**). These are not predictive-model outputs.

| Factor | Points |
|---|---:|
| Month-to-Month contract | +3 |
| Tenure 0–6 months | +3 |
| Fiber Optic | +2 |
| No dependents | +1 |
| Not married | +1 |

| Descriptive Churn Risk Tier | Customers | Churn Rate |
|---|---:|---:|
| Very High (6+) | 2,156 | **66.51%** |
| High (4–5) | 1,259 | 20.65% |
| Medium (2–3) | 1,714 | 7.29% |
| Low (0–1) | 1,460 | 3.42% |

**INTERPRETATION:** The rule-based point system separates churn rates effectively across tiers. This validates that combining Phase 3 associations into a single prioritization score has analytical utility — but it is **not a predictive model**.

**LIMITATION:** Descriptive Churn Risk Tiers reflect historical associations. They do not forecast individual churn probability.

---

## 7. Hypothetical Scenario (Not a Forecast or Causal Estimate)

**HYPOTHETICAL SCENARIO ONLY** — the calculation below is a **what-if illustration** for business-impact sizing. It is **not** a forecast, **not** a prediction of intervention success, and **not** a causal estimate of what retention actions would achieve.

If 10% of churned customers in the M2M + 0–6 month + Fiber segment had been retained:

| Metric | Value |
|---|---:|
| Churned in segment | 444 |
| Customers potentially retained (10% of 444) | 44 |
| Monthly value potentially preserved | $3,524.68 |
| Annualized value potentially preserved | $42,296.22 |

Formula: `segment_monthly_lost × 10%` applied to churned customers in the intersection only. This illustrates scale — not expected outcomes from any specific retention program.

---

## 8. Offer E Diagnostic

**FACT:**
| Segment | Churn Rate |
|---|---:|
| All Offer E | 67.62% |
| Offer E + Month-to-Month + 0–6 months | 83.94% |
| Offer E + One Year (n≥20 cells) | 12.12–13.64% |

**INTERPRETATION:** Offer E's high churn is **confounded** by contract and tenure composition. It should not be presented as a causal churn driver.

---

## 9. Limitations & Confounders

1. **Association only** — no causal claims in any SQL output
2. **Overlapping segments** — customers appear in multiple segments
3. **Self-reported reasons** — churn categories reflect exit surveys
4. **Confounding** — contract, tenure, internet, and offer variables overlap
5. **Descriptive Churn Risk Tiers** — rule-based, not validated for prediction
6. **Snapshot** — Q2 2022 point-in-time; no trend analysis
7. **Negative charges preserved** — see reconciliation note below; conclusions unchanged

### Negative-Charge Count Reconciliation

| Count | Definition | Filter |
|---:|---|---|
| **120** | All customers with `Flag_Negative_Monthly_Charge = 1` | Full dataset (7,043 rows) — **Phase 2/3 dataset-wide count** |
| **114** | Existing customers with negative monthly charge | `Customer Status IN ('Churned', 'Stayed')` — **Phase 4 SQL billing diagnostic count** |
| **6** | Joined customers with negative monthly charge | `Customer Status = 'Joined'` — excluded from churn-rate and existing-customer SQL analyses |

Breakdown of 120: Churned 30 + Stayed 84 + Joined 6 = 120. No data discrepancy — the difference is the **analysis population filter**. Phase 4 query `07_churn_by_billing.sql` reports the 114 existing-customer count because all churn metrics in that file use the existing-customer base.

---

## 10. Implications for Future Dashboard

SQL analysis confirms these dashboard priorities:

| Priority | Dashboard Element |
|---|---|
| Must-have | Churn Rate, Retention Rate, Contract breakdown |
| Must-have | Tenure band chart with volume + rate |
| Must-have | High-risk segment summary |
| Must-have | Churn reason Pareto (Competitor first) |
| Should-have | Internet type comparison |
| Should-have | Descriptive Churn Risk Tier summary (rule-based, not predictive) |
| Should-have | Monthly Recurring Value Lost KPI |
| Filter | Contract, Tenure_Band, Internet Type |
| De-prioritize | Gender (minimal difference) |
| De-prioritize | Offer E as standalone KPI (confounded) |

---

*Validated against Phase 3 on 2026-08-02. All 11 query files executed successfully.*
