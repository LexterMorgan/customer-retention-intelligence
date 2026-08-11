# SQL Analysis — Customer Churn & Retention

Portfolio SQL layer for analyzing 7,043 California telecom customers (Q2 2022 snapshot).

## Why SQLite?

SQLite is file-based, requires no server setup, and runs anywhere Python runs. It is ideal for portfolio projects where recruiters or interviewers need to reproduce analysis quickly:

```bash
sqlite3 sql/customer_churn.db < sql/01_kpi_overview.sql
```

## Source Data

| Item | Value |
|---|---|
| Source file | `data/processed/customers_clean.csv` |
| Database | `sql/customer_churn.db` |
| Table | `customers` |
| Grain | **1 row = 1 customer** |
| Rows | 7,043 |

The database is derived from the processed dataset. Raw and processed source files are never modified by SQL scripts.

## Churn Definition

| Status | Meaning | In churn-rate denominator? |
|---|---|---|
| Churned | Customer left | Yes (numerator) |
| Stayed | Customer retained | Yes (denominator) |
| Joined | New acquisition | **No** |

```
Churn Rate     = Churned / (Churned + Stayed) × 100
Retention Rate = Stayed  / (Churned + Stayed) × 100
```

Full definitions: `docs/churn_definition.md`

## Metric Conventions

### Share of churn (denominator)
- **Default (executive / business-impact):** share of **all 1,869 churned customers**
- **Internet-only sections:** share of **1,756 churned internet customers** — label explicitly when used

Example: Fiber Optic = **66.1%** of all churn (default) vs **70.4%** of internet churn.

### Negative monthly charge counts
- **120** = full dataset (`Flag_Negative_Monthly_Charge = 1` across all 7,043 customers)
- **114** = existing customers only (excludes 6 Joined customers with negative charges)

### Descriptive Churn Risk Tiers
Rule-based tiers from `10_customer_risk_ranking.sql` — **not predictive-model outputs**. Use the label "Descriptive Churn Risk Tiers" or "Rule-Based Churn Risk Tiers" in dashboards and reports.

## Column Naming

Several columns contain spaces (e.g., `"Customer Status"`, `"Monthly Charge"`). All SQL files use double-quote identifiers consistently.

The Offer category `None` is a valid business value meaning "no offer accepted."

## Query Files (run in order)

| File | Business Question |
|---|---|
| `01_kpi_overview.sql` | Core KPIs and financial totals |
| `02_churn_by_contract.sql` | Churn by contract type with ranking |
| `03_churn_by_tenure.sql` | Churn by tenure band |
| `04_churn_by_internet.sql` | Churn by internet technology |
| `05_churn_by_offer.sql` | Churn by offer + Offer E diagnostic |
| `06_churn_by_demographics.sql` | Age, gender, marital status, dependents |
| `07_churn_by_billing.sql` | Payment method, paperless, charge bands |
| `08_churn_reasons.sql` | Exit categories and top reasons |
| `09_high_risk_segments.sql` | Overlapping high-risk customer segments |
| `10_customer_risk_ranking.sql` | Descriptive risk points and tiers |
| `11_business_impact.sql` | Value impact and hypothetical scenarios |

## SQL Techniques Demonstrated

- **CTEs** — reusable base populations (`existing`, `total_churned`)
- **Conditional aggregation** — `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`
- **CASE expressions** — risk scoring, segment definitions, tenure ordering
- **Window functions** — `RANK()` for contract and churn-reason ranking
- **NULLIF** — division-by-zero protection on rates
- **ROUND** — presentation-ready percentages
- **Deterministic ORDER BY** — tenure bands, risk tiers

## Reproduce the Analysis

### 1. Build the database (one-time)

```bash
python3 -c "
import sqlite3, pandas as pd
df = pd.read_csv('data/processed/customers_clean.csv', keep_default_na=False, na_values=[''])
conn = sqlite3.connect('sql/customer_churn.db')
df.to_sql('customers', conn, index=False, if_exists='replace')
conn.close()
print(f'Loaded {len(df):,} customers')
"
```

### 2. Run a query

```bash
sqlite3 sql/customer_churn.db < sql/01_kpi_overview.sql
```

### 3. Interactive exploration

```bash
sqlite3 sql/customer_churn.db
sqlite> .headers on
sqlite> .mode column
sqlite> .read sql/02_churn_by_contract.sql
```

## Validation

SQL results were validated against Phase 2 (cleaning) and Phase 3 (Python EDA). Key reconciled metrics:

- Total customers: 7,043
- Churn rate: 28.37%
- Month-to-Month churn: 51.69%
- Two-Year churn: 2.58%
- 0–6 month churn: 77.17%
- High-risk intersection: 487 customers, 91.17% churn

See `analysis/sql_business_findings.md` for the full reconciliation summary.

## Dependencies

- Python 3 + pandas (database loading only)
- SQLite 3 (built into Python and macOS)
