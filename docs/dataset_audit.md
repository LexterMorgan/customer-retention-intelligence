# Dataset Audit & Cleaning Record

Concise record of the Phase 1 audit and Phase 2 cleaning decisions.

## Raw Files Used

| File | Rows | Purpose |
|---|---:|---|
| `data/raw/telecom_customer_churn.csv` | 7,043 | Main customer fact table |
| `data/raw/telecom_data_dictionary.csv` | 41 | Field definitions (reference only) |
| `data/raw/telecom_zipcode_population.csv` | 1,671 | Zip code population lookup |

**Raw files are immutable.** All transformations are applied in `analysis/data_cleaning.py`.

## Customer Grain

- **One row = one customer**
- Primary key: `Customer ID` (7,043 unique values, 0 duplicates)

## Important Source Columns

| Category | Columns |
|---|---|
| Identity | Customer ID |
| Demographics | Gender, Age, Married, Number of Dependents |
| Geography | City, Zip Code, Latitude, Longitude |
| Tenure & engagement | Tenure in Months, Number of Referrals |
| Products | Phone Service, Internet Service, Internet Type, 8 add-on fields |
| Contract & billing | Contract, Offer, Paperless Billing, Payment Method |
| Value | Monthly Charge, Total Charges, Total Revenue |
| Outcome | Customer Status, Churn Category, Churn Reason |

## Phase 1 Data-Quality Issues

| Issue | Severity | Phase 2 Handling |
|---|---|---|
| `Joined` status mixed with churn population | High | Kept in dataset; excluded from churn-rate KPIs via documentation |
| 120 negative `Monthly Charge` values | Medium | Flagged via `Flag_Negative_Monthly_Charge`; not removed. **120** = all customers; **114** = existing customers (Churned + Stayed); **6** = Joined only |
| `Offer` null = no offer accepted | Medium | Recoded to `None` |
| Internet-dependent nulls (1,526 rows) | Low | Recoded to `N/A` when Internet Service = No |
| Phone-dependent nulls (682 rows) | Low | Recoded to `N/A` when Phone Service = No |
| `Offer E` high churn (67.6%) | Medium | Preserved; flagged for future analysis |
| Zip Code stored as integer | Low | Converted to 5-digit text |

## Transformations Performed (Phase 2)

1. Stripped whitespace from text columns
2. Recoded `Offer` null → `None`
3. Recoded internet-dependent nulls → `N/A` when no internet
4. Recoded phone-dependent nulls → `N/A` when no phone
5. Filled internet add-on nulls → `No` for internet customers
6. Converted `Zip Code` to 5-digit text
7. Created `Is_Churned`, `Is_Retained`
8. Created `Flag_Negative_Monthly_Charge`
9. Created `Tenure_Band`, `Age_Band`, `Charge_Band`
10. Created `Add_On_Count` (internet customers only)
11. Left-joined `Zip_Population` on Zip Code

**Records removed:** 0  
**No outliers removed.** No silent corrections to suspicious values.

## Geographic Join Validation

| Check | Result |
|---|---|
| Lookup duplicate Zip Codes | 0 |
| Join type | Left join, many-to-one |
| Rows before join | 7,043 |
| Rows after join | 7,043 |
| Unique Customer IDs after join | 7,043 |
| Unmatched zip codes | 0 (100% match) |

## Analytical Fields Created

| Field | Description |
|---|---|
| `Is_Churned` | 1 if Customer Status = Churned |
| `Is_Retained` | 1 if Customer Status = Stayed |
| `Flag_Negative_Monthly_Charge` | 1 if Monthly Charge < 0 |
| `Tenure_Band` | 0-6, 7-12, 13-24, 25-36, 37-48, 49-72 months |
| `Age_Band` | Under 30, 30-39, 40-49, 50-59, 60-69, 70+ |
| `Charge_Band` | Credit (<$0), Low (<$30), $30-49, $50-69, $70-89, $90+ |
| `Add_On_Count` | Count of Yes internet add-ons (null if no internet) |
| `Zip_Population` | Population from zip lookup table |

### Band Rationale

- **Tenure_Band:** Aligns with business lifecycle (onboarding, year 1, years 2–4, long-term). Early tenure (0–6 months) showed the highest churn in Phase 1.
- **Age_Band:** Standard decade bands for readable demographic reporting.
- **Charge_Band:** Separates billing credits, low-cost phone-only accounts, and common monthly price tiers based on distribution quartiles.

### Add_On_Count Logic

Counts `Yes` values across these 8 columns (internet customers only):

- Online Security, Online Backup, Device Protection Plan, Premium Tech Support
- Streaming TV, Streaming Movies, Streaming Music, Unlimited Data

Customers with `Internet Service = No` receive a null `Add_On_Count` (not applicable).

## Processed Output

**File:** `data/processed/customers_clean.csv`  
**Rows:** 7,043  
**Columns:** 46 (38 original + 8 derived)

## Unresolved Limitations

1. **Negative monthly charges** — likely credits/adjustments; flagged but not corrected (no authoritative correction field in raw data).
2. **Offer E anomaly** — requires diagnostic analysis before drawing causal conclusions.
3. **Small-city samples** — many cities have fewer than 20 customers; geographic churn rates may be unstable.
4. **Churn reasons** — self-reported at exit; useful for diagnosis but subjective.
5. **Snapshot data** — Q2 2022 point-in-time; no time-series churn trend without additional periods.
6. **No predictive labels** — descriptive/diagnostic scope only in current phase.

## Reproducibility

```bash
python analysis/data_cleaning.py
```

Requires: Python 3, pandas (tested with pandas 2.3.3).

When reloading the cleaned CSV in Python, use `keep_default_na=False` (or exclude `"None"` from `na_values`) so the valid Offer category `None` is not parsed as missing.
