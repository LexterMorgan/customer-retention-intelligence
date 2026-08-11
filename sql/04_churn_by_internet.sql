-- =============================================================================
-- 04_churn_by_internet.sql
-- Business question: How does churn differ by internet technology type?
-- Excludes N/A (customers without internet service).
-- =============================================================================

WITH existing AS (
    SELECT *
    FROM customers
    WHERE "Customer Status" IN ('Churned', 'Stayed')
      AND "Internet Type" != 'N/A'
),

total_churned AS (
    SELECT COUNT(*) AS total
    FROM customers
    WHERE "Customer Status" = 'Churned'
),

internet_summary AS (
    SELECT
        "Internet Type",
        COUNT(*)                                                    AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                    AS churned_customers,
        ROUND(
            100.0 * SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0),
            2
        )                                                           AS churn_rate_pct,
        ROUND(AVG("Monthly Charge"), 2)                             AS avg_monthly_charge
    FROM existing
    GROUP BY "Internet Type"
)

SELECT
    ins."Internet Type",
    ins.existing_customers,
    ins.churned_customers,
    ins.churn_rate_pct,
    ROUND(100.0 * ins.churned_customers / tc.total, 2)               AS pct_of_total_churn,
    ins.avg_monthly_charge
FROM internet_summary ins
CROSS JOIN total_churned tc
ORDER BY ins.churn_rate_pct DESC;
