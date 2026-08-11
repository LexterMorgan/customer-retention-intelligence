# Customer Retention Intelligence

A customer churn and retention analytics project built to transform raw telecom customer data into validated business insights, customer risk segments, and an executive-facing analytics dashboard.

The project combines **Python, SQL, and React/TypeScript** to create an end-to-end analytics workflow focused on understanding customer churn and identifying where retention teams should prioritize their attention.

---

## Business Problem

Customer churn is one of the most important problems for subscription-based businesses.

Understanding the overall churn rate is not enough. A useful retention analysis needs to identify **where churn is concentrated, which customer characteristics are associated with higher churn, and which segments should be investigated first.**

This project focuses on answering:

> **Who is leaving, where is churn concentrated, and which customer segments should a retention team investigate first?**

The objective is to move from raw customer records to a structured retention intelligence workflow:

```text
Raw Customer Data
        ↓
Data Cleaning & Validation
        ↓
Exploratory Analysis
        ↓
SQL Business Analysis
        ↓
Risk Segmentation
        ↓
Dashboard Payload
        ↓
Executive Dashboard
```

---

## Objectives

The project was designed to answer several practical customer-retention questions:

- What is the overall customer churn rate?
- Which contract types experience the highest churn?
- How does churn change across customer tenure?
- Which internet service types have higher churn?
- Which offers are associated with different churn patterns?
- How does churn vary across payment methods and billing behavior?
- Are certain demographic groups more exposed to churn?
- Which customer segments represent the highest retention risk?
- Which customers should a retention team investigate first?
- What is the potential business impact of churn?

---

## Dataset

The project uses a telecom customer dataset containing customer-level information covering:

- Customer demographics
- Customer tenure
- Contract information
- Internet services
- Additional services
- Payment methods
- Monthly charges
- Total charges
- Churn status
- Churn-related attributes

The raw data is preserved separately from the processed analytical dataset.

### Data Layers

```text
data/
├── raw/
│   ├── telecom_customer_churn.csv
│   ├── telecom_data_dictionary.csv
│   └── telecom_zipcode_population.csv
│
└── processed/
    ├── customers_clean.csv
    └── dashboard_payload.json
```

---

## Analytical Workflow

### 1. Data Cleaning

Python is used to prepare the raw customer data for analysis.

The cleaning workflow includes:

- Dataset inspection
- Data type validation
- Missing-value handling
- Field standardization
- Analytical variable preparation
- Processed dataset generation

The cleaned customer-level dataset becomes the foundation for the downstream analysis.

---

### 2. Exploratory Data Analysis

The exploratory analysis investigates churn across multiple customer dimensions.

Key areas include:

- Contract type
- Customer tenure
- Internet service
- Offers
- Payment methods
- Monthly charges
- Age
- Customer demographics

Supporting analytical outputs are generated in:

```text
analysis/outputs/
```

These visualizations are used to identify and validate the major churn patterns before translating them into dashboard insights.

---

### 3. SQL Business Analysis

SQL provides an independent analytical layer for answering the core business questions.

The SQL workflow covers:

| Analysis | Purpose |
|---|---|
| KPI Overview | Establish overall customer and churn metrics |
| Churn by Contract | Identify contract-related churn patterns |
| Churn by Tenure | Analyze churn across customer lifecycle stages |
| Churn by Internet | Compare churn across internet services |
| Churn by Offer | Evaluate churn patterns across offers |
| Churn by Demographics | Investigate demographic differences |
| Churn by Billing | Analyze billing and payment behavior |
| Churn Reasons | Identify major churn reasons |
| High-Risk Segments | Identify concentrated risk groups |
| Customer Risk Ranking | Prioritize individual customers |
| Business Impact | Connect churn patterns to business impact |

The queries are organized under:

```text
sql/
```

---

## Customer Risk Analysis

The project goes beyond simply reporting churn percentages.

The analysis identifies customer segments where multiple churn-related characteristics overlap, allowing the dashboard to present a practical **retention prioritization framework**.

The purpose of the risk analysis is not to claim that every customer in a high-risk segment will churn.

Instead, it answers:

> **Where should the retention team look first?**

The workflow can be summarized as:

```text
Customer Profile
       +
Service & Contract Characteristics
       +
Billing Behavior
       +
Tenure
       ↓
Risk Indicators
       ↓
Risk Segments
       ↓
Retention Prioritization
```

---

## Dashboard

The final analytical layer is an interactive executive-facing dashboard built with React and TypeScript.

The dashboard translates the validated analytical outputs into a decision-oriented interface.

### Dashboard Areas

The dashboard includes:

- Executive KPIs
- Executive insights
- Analytical views
- Contract and tenure analysis
- Billing analysis
- Demographic analysis
- Customer segmentation
- Risk tiers
- Churn reason analysis
- Interactive global filters
- Customer risk prioritization

The dashboard is designed around the retention decision workflow rather than simply presenting a collection of charts.

---

## Dashboard Architecture

The frontend consumes a structured analytical payload generated from the validated analysis layer.

```text
Python Analysis
      ↓
Processed Dataset
      ↓
Dashboard Payload
      ↓
React / TypeScript
      ↓
Interactive Dashboard
```

This keeps analytical calculations separate from the presentation layer and provides a clearer architecture between:

- Data processing
- Business logic
- Dashboard presentation

---

## Technology Stack

### Data & Analytics

- Python
- Pandas
- NumPy
- Matplotlib

### SQL

- SQL
- SQLite

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts

### Testing & Validation

- Python testing
- TypeScript type checking
- Production build validation
- Dashboard payload validation

### Deployment

- Vercel

---

## Validation

The project includes validation across the major stages of the workflow.

### Data Validation

- Raw dataset inspection
- Cleaning checks
- Processed dataset validation

### Analytical Validation

- Python analysis outputs
- SQL business analysis
- Dashboard payload validation
- KPI consistency checks

### Frontend Validation

- TypeScript type checking
- Production build validation
- Dashboard rendering checks
- Executive insight rendering checks

Automated tests are included for:

```text
tests/
├── test_dashboard_payload.py
└── test_data_cleaning.py
```

---

## Repository Structure

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
│   └── processed/
│
├── docs/
│   ├── churn_definition.md
│   └── dataset_audit.md
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── types/
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
│   └── README.md
│
└── tests/
    ├── test_dashboard_payload.py
    └── test_data_cleaning.py
```

---

## Key Takeaways

The project demonstrates an end-to-end approach to customer retention analytics:

**1. Start with clean and validated data**

Reliable business insights depend on reliable analytical inputs.

**2. Combine Python and SQL**

Python supports exploratory analysis and data preparation, while SQL provides structured and reproducible business analysis.

**3. Move beyond aggregate churn**

Overall churn is only the starting point. Segment-level analysis provides a more useful view of where risk is concentrated.

**4. Connect analysis to action**

Risk segmentation and customer prioritization turn descriptive analytics into a more practical retention workflow.

**5. Build for decision-making**

The dashboard is designed to help an executive or retention team quickly understand:

- What is happening?
- Where is the problem?
- Which customers or segments deserve attention?
- What should be investigated next?

---

## Future Improvements

Potential extensions include:

- Predictive churn modeling
- Customer churn probability scoring
- Customer lifetime value analysis
- Cohort analysis
- Retention campaign simulation
- Retention ROI modeling
- Automated ETL scheduling
- Automated dashboard data refresh
- Database-backed dashboard architecture
- Automated reporting exports
- Data quality monitoring
- Model monitoring
- Containerized full-stack deployment

---

## Live Dashboard

Explore the interactive portfolio deployment:

**[Open Customer Retention Intelligence Dashboard →](https://customer-retention-intelligence.vercel.app/)**

---

## License

This project was developed for portfolio and educational purposes.
