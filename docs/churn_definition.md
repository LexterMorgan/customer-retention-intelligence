# Churn Definition

This document is the single source of truth for churn and retention logic across Python, SQL, Tableau, and Excel.

## Source Column

**`Customer Status`** — customer account status at the end of Q2 2022.

## Customer Status Values

| Value | Meaning | Count (raw) | In churn-rate denominator? |
|---|---|---:|---|
| **Churned** | Customer left the company during or before the quarter | 1,869 | Yes (numerator) |
| **Stayed** | Existing customer who remained active | 4,720 | Yes (denominator) |
| **Joined** | New customer acquired during the quarter | 454 | **No** |

## Definitions

### Churned
A customer with `Customer Status = 'Churned'`.

These customers have exited. `Churn Category` and `Churn Reason` are populated for them.

### Stayed (Retained)
A customer with `Customer Status = 'Stayed'`.

These are existing customers who did not leave during the observation period.

### Joined
A customer with `Customer Status = 'Joined'`.

These are **new acquisitions** (tenure 1–3 months in the raw data). They were not part of the existing customer base at the start of the retention analysis window.

**Joined customers are kept in the cleaned dataset** but are **excluded from churn and retention rate calculations**.

## Calculated Flags (in `customers_clean.csv`)

| Field | Definition |
|---|---|
| **Is_Churned** | `1` when `Customer Status = 'Churned'`, else `0` |
| **Is_Retained** | `1` when `Customer Status = 'Stayed'`, else `0` |

Joined customers have `Is_Churned = 0` and `Is_Retained = 0`.

## Canonical Formulas

### Churn Rate

```
Churn Rate = Churned / (Churned + Stayed)
```

**SQL example:**

```sql
SELECT
    SUM(CASE WHEN Customer_Status = 'Churned' THEN 1 ELSE 0 END) * 1.0
    / SUM(CASE WHEN Customer_Status IN ('Churned', 'Stayed') THEN 1 ELSE 0 END)
    AS churn_rate
FROM customers_clean;
```

**Python example:**

```python
existing = df[df["Customer Status"].isin(["Churned", "Stayed"])]
churn_rate = (existing["Customer Status"] == "Churned").mean()
```

### Retention Rate

```
Retention Rate = Stayed / (Churned + Stayed)
```

Equivalently: `Retention Rate = 1 - Churn Rate`

## Why Joined Customers Are Excluded

Joined customers were **not existing customers** at the start of the analysis period. Including them in the churn-rate denominator would:

1. Understate churn (new customers cannot have "stayed" from a prior period)
2. Mix acquisition metrics with retention metrics
3. Produce a misleading executive KPI

Joined customers belong in **acquisition/growth analysis**, not retention-rate denominators.

## Verified Rates (Phase 2 cleaned data)

| Metric | Value |
|---|---:|
| Churned | 1,869 |
| Stayed | 4,720 |
| Existing customer base | 6,589 |
| **Churn Rate** | **28.37%** |
| **Retention Rate** | **71.63%** |

## Important Notes

- Do **not** use `Churn Category` or `Churn Reason` to define churn — they are only available for customers who already churned.
- Do **not** infer churn from tenure, contract end dates, or charges.
- Association findings (e.g., contract type vs. churn) describe **relationships**, not proven causes.
