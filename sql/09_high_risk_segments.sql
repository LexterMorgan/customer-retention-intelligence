-- =============================================================================
-- 09_high_risk_segments.sql
-- Business question: Which customer groups combine high churn rate AND business volume?
-- Segments OVERLAP — a customer may belong to multiple segments.
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

-- Each segment defined independently (allows overlap)
segments AS (
    SELECT 'A. Early-Tenure Month-to-Month' AS segment,
           e."Customer ID", e."Customer Status"
    FROM existing e
    WHERE e.Contract = 'Month-to-Month' AND e.Tenure_Band = '0-6 months'

    UNION ALL
    SELECT 'B. Month-to-Month Fiber Optic', e."Customer ID", e."Customer Status"
    FROM existing e
    WHERE e.Contract = 'Month-to-Month' AND e."Internet Type" = 'Fiber Optic'

    UNION ALL
    SELECT 'C. Month-to-Month No Dependents', e."Customer ID", e."Customer Status"
    FROM existing e
    WHERE e.Contract = 'Month-to-Month' AND e."Number of Dependents" = 0

    UNION ALL
    SELECT 'D. Stable Two-Year Customers', e."Customer ID", e."Customer Status"
    FROM existing e
    WHERE e.Contract = 'Two Year'
      AND e.Tenure_Band IN ('37-48 months', '49-72 months')

    UNION ALL
    SELECT 'E. Long-Tenure Customer Base', e."Customer ID", e."Customer Status"
    FROM existing e
    WHERE e.Tenure_Band = '49-72 months'

    UNION ALL
    SELECT 'F. M2M + 0-6 months + Fiber Optic', e."Customer ID", e."Customer Status"
    FROM existing e
    WHERE e.Contract = 'Month-to-Month'
      AND e.Tenure_Band = '0-6 months'
      AND e."Internet Type" = 'Fiber Optic'
),

segment_summary AS (
    SELECT
        s.segment,
        COUNT(DISTINCT s."Customer ID")                               AS segment_customer_count,
        SUM(CASE WHEN s."Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                        AS churned_customers,
        ROUND(
            100.0 * SUM(CASE WHEN s."Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(DISTINCT s."Customer ID"), 0), 2
        )                                                               AS churn_rate_pct
    FROM segments s
    GROUP BY s.segment
)

SELECT
    ss.segment,
    ss.segment_customer_count,
    ss.churned_customers,
    ss.churn_rate_pct,
    ROUND(100.0 * ss.churned_customers / tc.total, 2)                   AS pct_of_total_churn
FROM segment_summary ss
CROSS JOIN total_churned tc
ORDER BY ss.churn_rate_pct DESC;
