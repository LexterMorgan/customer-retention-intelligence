-- =============================================================================
-- 02_churn_by_contract.sql
-- Business question: Which contract types have the highest churn rate and volume?
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

contract_summary AS (
    SELECT
        Contract,
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
    GROUP BY Contract
)

SELECT
    cs.Contract,
    cs.existing_customers,
    cs.churned_customers,
    cs.retained_customers,
    cs.churn_rate_pct,
    ROUND(100.0 * cs.churned_customers / tc.total, 2)               AS pct_of_total_churn,
    RANK() OVER (ORDER BY cs.churn_rate_pct DESC)                    AS churn_rate_rank,
    RANK() OVER (ORDER BY cs.churned_customers DESC)                AS churn_volume_rank
FROM contract_summary cs
CROSS JOIN total_churned tc
ORDER BY cs.churn_rate_pct DESC;
