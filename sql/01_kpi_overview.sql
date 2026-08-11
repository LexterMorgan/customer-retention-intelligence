-- =============================================================================
-- 01_kpi_overview.sql
-- Business question: What are the core customer and churn KPIs for Q2 2022?
-- =============================================================================

WITH status_counts AS (
    SELECT
        COUNT(*)                                                    AS total_customers,
        SUM(CASE WHEN "Customer Status" IN ('Churned', 'Stayed') THEN 1 ELSE 0 END)
                                                                    AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                    AS churned_customers,
        SUM(CASE WHEN "Customer Status" = 'Stayed'  THEN 1 ELSE 0 END)
                                                                    AS retained_customers,
        SUM(CASE WHEN "Customer Status" = 'Joined'  THEN 1 ELSE 0 END)
                                                                    AS joined_customers
    FROM customers
),

-- Financial totals across all customers (historical revenue to quarter-end)
financial_totals AS (
    SELECT
        ROUND(SUM("Total Revenue"), 2)                              AS total_revenue_all,
        ROUND(SUM(CASE WHEN "Customer Status" = 'Stayed'
                       THEN "Total Revenue" ELSE 0 END), 2)         AS revenue_from_retained,
        ROUND(SUM(CASE WHEN "Customer Status" = 'Churned'
                       THEN "Total Revenue" ELSE 0 END), 2)         AS revenue_from_churned,
        -- Monthly Recurring Value Lost = sum of current monthly bills for churned customers
        ROUND(SUM(CASE WHEN "Customer Status" = 'Churned'
                       THEN "Monthly Charge" ELSE 0 END), 2)        AS monthly_recurring_value_lost
    FROM customers
)

SELECT
    s.total_customers,
    s.existing_customers,
    s.churned_customers,
    s.retained_customers,
    s.joined_customers,

    -- Churn Rate = Churned / (Churned + Stayed). Joined excluded from denominator.
    ROUND(
        100.0 * s.churned_customers / NULLIF(s.existing_customers, 0),
        2
    )                                                               AS churn_rate_pct,

    -- Retention Rate = Stayed / (Churned + Stayed)
    ROUND(
        100.0 * s.retained_customers / NULLIF(s.existing_customers, 0),
        2
    )                                                               AS retention_rate_pct,

    f.total_revenue_all,
    f.revenue_from_retained,
    f.revenue_from_churned,
    f.monthly_recurring_value_lost

FROM status_counts s
CROSS JOIN financial_totals f;
