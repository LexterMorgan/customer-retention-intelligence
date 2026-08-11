-- =============================================================================
-- 08_churn_reasons.sql
-- Business question: What do churned customers say about why they left?
-- Churned customers ONLY. Self-reported exit themes — not verified causes.
-- =============================================================================

WITH churned AS (
    SELECT *
    FROM customers
    WHERE "Customer Status" = 'Churned'
),

total AS (
    SELECT COUNT(*) AS total_churned FROM churned
),

-- Exit categories
category_summary AS (
    SELECT
        'Churn Category'                                              AS reason_level,
        "Churn Category"                                              AS reason,
        COUNT(*)                                                      AS churner_count,
        ROUND(100.0 * COUNT(*) / (SELECT total_churned FROM total), 2)
                                                                      AS pct_of_churners,
        RANK() OVER (ORDER BY COUNT(*) DESC)                          AS reason_rank
    FROM churned
    GROUP BY "Churn Category"
),

-- Specific reasons (top themes)
reason_summary AS (
    SELECT
        'Churn Reason'                                                AS reason_level,
        "Churn Reason"                                                AS reason,
        COUNT(*)                                                      AS churner_count,
        ROUND(100.0 * COUNT(*) / (SELECT total_churned FROM total), 2)
                                                                      AS pct_of_churners,
        RANK() OVER (ORDER BY COUNT(*) DESC)                          AS reason_rank
    FROM churned
    GROUP BY "Churn Reason"
)

SELECT reason_level, reason, churner_count, pct_of_churners, reason_rank
FROM category_summary

UNION ALL

SELECT reason_level, reason, churner_count, pct_of_churners, reason_rank
FROM reason_summary
WHERE reason_rank <= 10  -- top 10 specific reasons

ORDER BY reason_level, reason_rank;
