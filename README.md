# Customer Retention Intelligence

A customer churn and retention analytics project built to transform raw telecom customer data into **validated business insights, SQL analysis, descriptive risk segments, and an executive-facing analytics dashboard**.

The project focuses on answering a practical business question:

> **Who is leaving, where is churn concentrated, and which customer segments should a retention team investigate first?**

---

## Overview

Customer retention is not simply about measuring the overall churn rate. The more important question is understanding **where churn is concentrated and what customer characteristics are associated with higher retention risk**.

This project analyzes a Q2 2022 California telecom customer snapshot and builds an end-to-end analytical workflow:

```text
Raw Customer Data
       ↓
Data Audit & Cleaning
       ↓
Exploratory Data Analysis
       ↓
SQL Analytical Layer
       ↓
Business Insights
       ↓
Descriptive Risk Segmentation
       ↓
Executive Dashboard
```

The current scope is **descriptive and diagnostic analytics**. It does not claim to predict individual customer churn or establish causal relationships.

---

## Business Problem

A telecom organization needs to understand customer churn in order to prioritize retention efforts.

The analysis is designed to answer questions such as:

- What is the overall churn rate?
- Which contract types contribute the most churn?
- How does churn change with customer tenure?
- Which internet service segments are most exposed to churn?
- Which customer profiles represent the highest concentration of departures?
- What are customers reporting as their reasons for leaving?
- Which geographic markets show unusual churn?
- Which customer segments should retention teams investigate first?
- How can raw customer data be transformed into decision-ready metrics?

---

## Key Results

The dataset contains **7,043 customers**.

For churn-rate calculations, the analysis uses existing customers only:

- **Churned:** 1,869
- **Stayed:** 4,720
- **Existing customers:** 6,589
- **Joined customers:** 454
- **Overall churn rate:** **28.37%**
- **Retention rate:** **71.63%**

`Joined` customers are excluded from churn-rate denominators because they represent new acquisitions rather than customers who could have churned during the observation period.

### Major Findings

| Finding | Result |
|---|---:|
| Overall churn rate | **28.37%** |
| Month-to-Month churn rate | **51.7%** |
| Two-Year churn rate | **2.6%** |
| 0–6 month churn rate | **77.2%** |
| Month-to-Month share of all churn | **88.6%** |
| 0–6 month share of all churn | **42.0%** |
| Month-to-Month + 0–6 months churn | **81.3%** |
| Month-to-Month + 0–6 months + Fiber churn | **91.2%** |
| Competitor-related churn reasons | **45.0%** |
| Fiber churn rate | **42.1%** |
| San Diego churn rate | **66.6%** |

### Highest-Risk Intersection

The strongest descriptive risk segment identified in the analysis is:

**Month-to-Month + 0–6 Months + Fiber Optic**

- Segment size: **487 customers**
- Churn rate: **91.2%**
- Share of all churn: **23.8%**

This means nearly one quarter of all observed churn comes from a single highly concentrated customer profile.

This is a **descriptive segment**, not a machine-learning prediction.

---

## Business Interpretation

The analysis suggests that customer churn is highly concentrated rather than evenly distributed across the customer base.

### 1. Contract Commitment

Month-to-Month customers are the largest structural source of churn.

- Month-to-Month churn: **51.7%**
- One-Year churn: **10.9%**
- Two-Year churn: **2.6%**

Month-to-Month customers represent **88.6% of all churn** while representing approximately half of the existing customer base.

This suggests that contract commitment is an important retention segmentation dimension.

---

### 2. Early-Tenure Customers

Churn is heavily front-loaded.

| Tenure | Churn Rate | Share of Churn |
|---|---:|---:|
| 0–6 months | **77.2%** | **42.0%** |
| 7–12 months | 35.3% | 13.5% |
| 13–24 months | 28.7% | 15.7% |
| 25–36 months | 21.6% | 9.6% |
| 37–48 months | 19.0% | 7.8% |
| 49–72 months | 9.5% | 11.4% |

The first six months represent the most significant concentration of customer departures.

This makes onboarding and early-lifecycle retention an important area for further investigation.

---

### 3. Fiber Customers

Fiber Optic customers show substantially higher churn than other internet technologies.

| Internet Type | Churn Rate |
|---|---:|
| Fiber Optic | **42.1%** |
| Cable | 27.5% |
| DSL | 20.0% |

Fiber customers account for approximately **66.1% of all churn**.

However, this relationship should not be interpreted as causal. Fiber customers also overlap with other high-risk characteristics such as Month-to-Month contracts and shorter tenure.

---

### 4. Competitor Pressure

Among customers who churned, competitor-related reasons were the dominant reported category.

| Churn Category | Share of Churn |
|---|---:|
| Competitor | **45.0%** |
| Dissatisfaction | 17.2% |
| Attitude | 16.8% |
| Price | 11.3% |
| Other | 9.7% |

The most common specific reasons include:

- Competitor had better devices
- Competitor made a better offer
- Attitude of support personnel
- Competitor offered more data
- Competitor offered higher download speeds

This points toward competitive pricing, device offerings, service quality, and network/value perception as areas worth investigating.

---

### 5. Offer E

Offer E has an unusually high observed churn rate:

**67.6%**

However, further segmentation shows that Offer E customers overlap heavily with Month-to-Month contracts, early tenure, and Fiber customers.

For example:

- Offer E overall: **67.6%**
- Offer E + Month-to-Month: **74.6%**
- Offer E + 0–6 months: **79.8%**
- Offer E + Month-to-Month + 0–6 months: **83.9%**
- Offer E + Fiber: **81.4%**

Therefore, Offer E should be treated as an **anomaly requiring further investigation**, rather than being labeled a direct cause of churn.

---

## Data

### Source Dataset

The project uses a California telecom customer dataset representing a **Q2 2022 snapshot**.

Raw files:

```text
data/raw/
├── telecom_customer_churn.csv
├── telecom_data_dictionary.csv
└── telecom_zipcode_population.csv
```

### Dataset Grain

One row represents one customer.

Primary key:

```text
Customer ID
```

The raw customer dataset contains:

**7,043 unique customers**

with no duplicate customer IDs.

---

## Data Quality & Cleaning

The raw dataset is preserved and transformations are performed through:

```text
analysis/data_cleaning.py
```

The cleaning process does not silently remove suspicious records.

### Important Data Issues

| Issue | Handling |
|---|---|
| `Joined` customers mixed with churn population | Kept, excluded from churn-rate denominator |
| 120 negative Monthly Charge values | Flagged, not removed |
| Missing Offer values | Recoded to `None` |
| Internet-dependent nulls | Recoded to `N/A` |
| Phone-dependent nulls | Recoded to `N/A` |
| Internet add-on nulls | Recoded to `No` where applicable |
| Zip Code stored as integer | Converted to 5-digit text |
| Offer E anomaly | Preserved for investigation |

No customer records were removed during cleaning.

---

## Derived Analytical Fields

The cleaned dataset contains additional analytical fields including:

- `Is_Churned`
- `Is_Retained`
- `Flag_Negative_Monthly_Charge`
- `Tenure_Band`
- `Age_Band`
- `Charge_Band`
- `Add_On_Count`
- `Zip_Population`

The processed dataset contains:

**7,043 rows × 46 columns**

---

## Churn Definition

The project uses the following canonical definition:

```text
Churn Rate
= Churned / (Churned + Stayed) × 100

Retention Rate
= Stayed / (Churned + Stayed) × 100
```

### Customer Status

| Status | Meaning | Included in churn denominator? |
|---|---|---|
| Churned | Customer left | Yes |
| Stayed | Customer retained | Yes |
| Joined | New customer | No |

This definition is used consistently across the Python, SQL, and dashboard layers.

See:

```text
docs/churn_definition.md
```

for the detailed metric definition.

---

# Analytical Workflow

## Phase 1 — Data Audit

The project begins by auditing:

- Dataset grain
- Primary key uniqueness
- Missing values
- Suspicious values
- Customer status distribution
- Data types
- Geographic lookup integrity
- Business meaning of important fields

Audit documentation:

```text
docs/dataset_audit.md
```

---

## Phase 2 — Data Cleaning

Cleaning and feature engineering are implemented in:

```text
analysis/data_cleaning.py
```

The resulting dataset is:

```text
data/processed/customers_clean.csv
```

---

## Phase 3 — Exploratory Analysis

The EDA layer evaluates churn across:

- Contract type
- Tenure
- Internet service
- Offers
- Demographics
- Billing
- Payment methods
- Churn reasons
- Geography
- Customer value
- Multi-dimensional customer segments

Main analysis files:

```text
analysis/
├── data_cleaning.py
├── exploratory_analysis.py
├── dashboard_payload.py
├── business_insights.md
└── sql_business_findings.md
```

Charts generated during analysis are stored under:

```text
analysis/outputs/
```

---

# SQL Analytics Layer

The project includes a SQLite analytical database:

```text
sql/customer_churn.db
```

The database contains the processed customer dataset at one-row-per-customer grain.

SQL analysis is organized around business questions rather than isolated technical demonstrations.

### Query Structure

```text
sql/
├── 01_kpi_overview.sql
├── 02_churn_by_contract.sql
├── 03_churn_by_tenure.sql
├── 04_churn_by_internet.sql
├── 05_churn_by_offer.sql
├── 06_churn_by_demographics.sql
├── 07_churn_by_billing.sql
├── 08_churn_reasons.sql
├── 09_high_risk_segments.sql
├── 10_customer_risk_ranking.sql
├── 11_business_impact.sql
└── README.md
```

### SQL Techniques

The project demonstrates:

- CTEs
- Conditional aggregation
- `CASE` expressions
- Window functions
- `RANK()`
- `NULLIF`
- `ROUND`
- Deterministic ordering
- Rule-based segmentation

---

## Descriptive Risk Tiers

The SQL layer includes a rule-based customer risk ranking.

These are **not predictive machine-learning scores**.

They are deterministic descriptive tiers derived from observed customer characteristics.

They should therefore be interpreted as:

> **Descriptive Churn Risk Tiers**

rather than predicted probabilities of churn.

---

# Executive Dashboard

The project includes a React-based executive analytics interface under:

```text
frontend/
```

The dashboard is designed to translate the analytical layer into an interactive management-facing experience.

### Dashboard Areas

The frontend includes views covering:

- Executive KPIs
- Global filters
- Analytical breakdowns
- Contract and tenure
- Billing
- Demographics
- Churn reasons
- Risk tiers
- Customer segments
- Executive insights
- Business-impact scenarios

The frontend consumes a validated analytical payload rather than independently redefining the core metrics.

---

## Frontend Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- shadcn
- Lucide React

The frontend package includes dedicated scripts for:

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run preview
```

---

# Reproducibility

## Python Environment

Python 3 with pandas is required for the analysis pipeline.

### Run Data Cleaning

From the project root:

```bash
python analysis/data_cleaning.py
```

This generates:

```text
data/processed/customers_clean.csv
```

---

## Build / Reload the SQLite Database

The database can be recreated from the processed dataset:

```bash
python3 -c "
import sqlite3, pandas as pd
df = pd.read_csv(
    'data/processed/customers_clean.csv',
    keep_default_na=False,
    na_values=['']
)
conn = sqlite3.connect('sql/customer_churn.db')
df.to_sql('customers', conn, index=False, if_exists='replace')
conn.close()
print(f'Loaded {len(df):,} customers')
"
```

Then run an analytical query:

```bash
sqlite3 sql/customer_churn.db < sql/01_kpi_overview.sql
```

Or open SQLite interactively:

```bash
sqlite3 sql/customer_churn.db
```

Then:

```sql
.headers on
.mode column
.read sql/02_churn_by_contract.sql
```

---

## Frontend

Navigate into the frontend:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build the production bundle:

```bash
npm run build
```

Run type checking:

```bash
npm run typecheck
```

Run linting:

```bash
npm run lint
```

---

# Validation

The project includes automated tests under:

```text
tests/
├── test_dashboard_payload.py
└── test_data_cleaning.py
```

Validation is designed to ensure that transformations and dashboard-facing analytical outputs remain consistent with the documented KPI definitions.

SQL results were also reconciled against the Python analysis.

Key reconciled metrics include:

- Total customers: **7,043**
- Churn rate: **28.37%**
- Month-to-Month churn: **51.69%**
- Two-Year churn: **2.58%**
- 0–6 month churn: **77.17%**
- Highest-risk intersection: **487 customers / 91.17% churn**

---

# Business Recommendations

The analysis suggests several areas for retention investigation.

### 1. Prioritize Early-Tenure Month-to-Month Customers

The combination of Month-to-Month contracts and 0–6 month tenure produces an **81.3% churn rate**.

Potential investigation:

- Improve onboarding
- Early customer health checks
- Proactive service outreach
- Contract conversion incentives

---

### 2. Investigate Month-to-Month Fiber Customers

Month-to-Month Fiber customers represent a major concentration of churn.

Potential investigation:

- Fiber pricing competitiveness
- Service quality
- Speed expectations
- Device offerings
- Contract conversion programs

---

### 3. Investigate Competitive Pressure

45% of churned customers cite competitor-related reasons.

Potential investigation:

- Competitive pricing benchmarks
- Device comparisons
- Speed/data offerings
- Retention offers
- Customer support experience

---

### 4. Review Offer E

Offer E has unusually high churn, but the effect appears strongly associated with other high-risk characteristics.

The appropriate next step is diagnostic analysis rather than assuming Offer E causes churn.

---

### 5. Protect the Long-Tenure Base

Customers with long tenure and Two-Year contracts have very low observed churn.

Potential strategy:

- Protect the existing loyal base
- Identify upsell opportunities
- Avoid unnecessary retention spend on already-stable customers

---

# Important Interpretation Warnings

This project intentionally avoids overstating what the data can prove.

### Association ≠ Causation

The analysis identifies relationships and patterns.

It does not establish that a particular variable directly causes churn.

---

### Snapshot Dataset

The dataset represents a Q2 2022 snapshot.

It does not provide sufficient longitudinal history to establish month-over-month churn trends.

---

### Self-Reported Churn Reasons

Churn reasons are customer-reported exit information.

They are useful for diagnosis but should not automatically be treated as verified causal explanations.

---

### Confounding

Contract type, tenure, internet type, offers, and other variables overlap substantially.

A high churn rate for one dimension may partially reflect the composition of that segment.

---

### Descriptive Risk ≠ Predictive Model

The current project does not train a machine-learning model.

Risk tiers are deterministic analytical segments based on observed characteristics.

---

### Geographic Sample Size

Small cities can produce unstable churn rates.

Geographic analysis therefore applies a minimum existing-customer threshold when ranking cities.

---

# Project Structure

```text
customer-retention-intelligence/
│
├── analysis/
│   ├── data_cleaning.py
│   ├── exploratory_analysis.py
│   ├── dashboard_payload.py
│   ├── business_insights.md
│   ├── sql_business_findings.md
│   └── outputs/
│
├── data/
│   ├── raw/
│   │   ├── telecom_customer_churn.csv
│   │   ├── telecom_data_dictionary.csv
│   │   └── telecom_zipcode_population.csv
│   │
│   └── processed/
│       ├── customers_clean.csv
│       └── dashboard_payload.json
│
├── docs/
│   ├── churn_definition.md
│   └── dataset_audit.md
│
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── sql/
│   ├── 01_kpi_overview.sql
│   ├── 02_churn_by_contract.sql
│   ├── 03_churn_by_tenure.sql
│   ├── 04_churn_by_internet.sql
│   ├── 05_churn_by_offer.sql
│   ├── 06_churn_by_demographics.sql
│   ├── 07_churn_by_billing.sql
│   ├── 08_churn_reasons.sql
│   ├── 09_high_risk_segments.sql
│   ├── 10_customer_risk_ranking.sql
│   ├── 11_business_impact.sql
│   ├── customer_churn.db
│   └── README.md
│
├── tests/
│   ├── test_dashboard_payload.py
│   └── test_data_cleaning.py
│
└── README.md
```

---

# Analytical Deliverables

The project produces several layers of output:

### Data

- Audited raw customer dataset
- Cleaned customer dataset
- Geographic enrichment
- Derived analytical fields

### Analysis

- Exploratory analysis
- Churn segmentation
- Business insights
- Churn reason analysis
- High-risk segment analysis
- Business impact analysis

### SQL

- KPI queries
- Segmentation queries
- Ranking queries
- Business-impact queries
- Descriptive risk tiers

### Application

- Executive-facing React dashboard
- Interactive filtering
- KPI views
- Analytical breakdowns
- Executive interpretation layer

### Validation

- Data-cleaning tests
- Dashboard-payload tests
- Cross-validation between Python and SQL analytical outputs

---

# What This Project Demonstrates

This project is intended to demonstrate an end-to-end analytics workflow rather than simply a collection of charts.

Key capabilities demonstrated:

- Data quality auditing
- Data cleaning and feature engineering
- Exploratory data analysis
- SQL analytics
- Business metric definition
- Segmentation analysis
- Rule-based risk scoring
- Business interpretation
- Dashboard architecture
- Frontend development
- Analytical validation
- Reproducible workflows
- Communicating technical findings in business terms

---

# Future Extensions

Potential future iterations could include:

- Predictive churn modeling
- Customer-level probability scoring
- Model explainability
- Retention campaign simulation
- Time-series churn monitoring with additional periods
- A/B testing of retention interventions
- Customer lifetime value modeling
- Automated data refresh
- Production database integration

These are intentionally outside the current descriptive-analysis scope.

---

## Final Takeaway

The central finding from the current analysis is that churn is **highly concentrated in a relatively small number of customer profiles**.

The strongest concentration is:

> **Month-to-Month + Early Tenure + Fiber Optic**

Rather than treating all customers equally, a retention strategy can use these analytical segments to prioritize investigation, onboarding improvements, competitive benchmarking, and contract-conversion opportunities.

The project therefore moves from:

**raw customer records → validated metrics → SQL analysis → business insights → actionable retention segmentation → executive analytics.**

---

## Author

**Michael Alexander**

Built as a portfolio project demonstrating practical data analytics, SQL, Python, business intelligence, and analytics application development.
