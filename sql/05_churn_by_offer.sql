-- =============================================================================
-- 05_churn_by_offer.sql
-- Business question: How does churn vary by marketing offer?
-- "None" is a valid category meaning no offer accepted.
-- Includes Offer E diagnostic by contract and tenure (association, not causation).
-- =============================================================================

-- Part A: Overall churn by Offer
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

offer_summary AS (
    SELECT
        Offer,
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
    GROUP BY Offer
)

SELECT
    'Overall by Offer'                                              AS analysis_section,
    os.Offer,
    NULL                                                            AS Contract,
    NULL                                                            AS Tenure_Band,
    os.existing_customers,
    os.churned_customers,
    os.retained_customers,
    os.churn_rate_pct,
    ROUND(100.0 * os.churned_customers / tc.total, 2)               AS pct_of_total_churn
FROM offer_summary os
CROSS JOIN total_churned tc

UNION ALL

-- Part B: Offer E diagnostic — check confounding by contract and tenure
SELECT
    'Offer E Diagnostic'                                            AS analysis_section,
    'Offer E'                                                       AS Offer,
    e.Contract,
    e.Tenure_Band,
    COUNT(*)                                                        AS existing_customers,
    SUM(CASE WHEN e."Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                    AS churned_customers,
    SUM(CASE WHEN e."Customer Status" = 'Stayed'  THEN 1 ELSE 0 END)
                                                                    AS retained_customers,
    ROUND(
        100.0 * SUM(CASE WHEN e."Customer Status" = 'Churned' THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0),
        2
    )                                                               AS churn_rate_pct,
    NULL                                                            AS pct_of_total_churn
FROM existing e
WHERE e.Offer = 'Offer E'
GROUP BY e.Contract, e.Tenure_Band
HAVING COUNT(*) >= 20  -- meaningful sample size only

ORDER BY analysis_section, churn_rate_pct DESC;
