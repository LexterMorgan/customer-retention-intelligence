-- =============================================================================
-- 03_churn_by_tenure.sql
-- Business question: When during the customer lifecycle is churn most concentrated?
-- Uses approved Tenure_Band from Phase 2 cleaning.
-- =============================================================================

WITH existing AS (
    SELECT *
    FROM customers
    WHERE "Customer Status" IN ('Churned', 'Stayed')
),

total_churned AS (
    SELECT COUNT(*) AS total
    FROM existing
    WHERE "Customer Status" = 'Churned'
),

tenure_summary AS (
    SELECT
        Tenure_Band,
        COUNT(*)                                                    AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                    AS churned_customers,
        SUM(CASE WHEN "Customer Status" = 'Stayed'  THEN 1 ELSE 0 END)
                                                                    AS retained_customers,
        ROUND(
            100.0 * SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0),
            2
        )                                                           AS churn_rate_pct
    FROM existing
    GROUP BY Tenure_Band
)

SELECT
    ts.Tenure_Band,
    ts.existing_customers,
    ts.churned_customers,
    ts.retained_customers,
    ts.churn_rate_pct,
    ROUND(100.0 * ts.churned_customers / tc.total, 2)               AS pct_of_total_churn
FROM tenure_summary ts
CROSS JOIN total_churned tc
ORDER BY
    CASE ts.Tenure_Band
        WHEN '0-6 months'   THEN 1
        WHEN '7-12 months'  THEN 2
        WHEN '13-24 months' THEN 3
        WHEN '25-36 months' THEN 4
        WHEN '37-48 months' THEN 5
        WHEN '49-72 months' THEN 6
        ELSE 99
    END;
