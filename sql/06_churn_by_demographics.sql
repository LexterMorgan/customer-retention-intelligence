-- =============================================================================
-- 06_churn_by_demographics.sql
-- Business question: Which demographic groups show meaningful churn differences?
-- Focus on material associations; gender difference is minimal in Phase 3.
-- =============================================================================

WITH existing AS (
    SELECT
        *,
        CASE WHEN "Number of Dependents" > 0 THEN 'Has Dependents' ELSE 'No Dependents' END
                                                                    AS dependents_flag
    FROM customers
    WHERE "Customer Status" IN ('Churned', 'Stayed')
),

total_churned AS (
    SELECT COUNT(*) AS total
    FROM existing
    WHERE "Customer Status" = 'Churned'
),

-- Age band analysis
age_summary AS (
    SELECT
        'Age_Band'                                                    AS dimension,
        Age_Band                                                      AS category,
        COUNT(*)                                                      AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                      AS churned_customers,
        ROUND(
            100.0 * SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 2
        )                                                             AS churn_rate_pct
    FROM existing
    GROUP BY Age_Band
),

-- Gender
gender_summary AS (
    SELECT
        'Gender'                                                      AS dimension,
        Gender                                                        AS category,
        COUNT(*)                                                      AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                      AS churned_customers,
        ROUND(
            100.0 * SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 2
        )                                                             AS churn_rate_pct
    FROM existing
    GROUP BY Gender
),

-- Marital status
married_summary AS (
    SELECT
        'Married'                                                     AS dimension,
        Married                                                       AS category,
        COUNT(*)                                                      AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                      AS churned_customers,
        ROUND(
            100.0 * SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 2
        )                                                             AS churn_rate_pct
    FROM existing
    GROUP BY Married
),

-- Dependents
dependents_summary AS (
    SELECT
        'Dependents'                                                  AS dimension,
        dependents_flag                                               AS category,
        COUNT(*)                                                      AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                      AS churned_customers,
        ROUND(
            100.0 * SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 2
        )                                                             AS churn_rate_pct
    FROM existing
    GROUP BY dependents_flag
),

combined AS (
    SELECT * FROM age_summary
    UNION ALL SELECT * FROM gender_summary
    UNION ALL SELECT * FROM married_summary
    UNION ALL SELECT * FROM dependents_summary
)

SELECT
    c.dimension,
    c.category,
    c.existing_customers,
    c.churned_customers,
    c.churn_rate_pct,
    ROUND(100.0 * c.churned_customers / tc.total, 2)                AS pct_of_total_churn
FROM combined c
CROSS JOIN total_churned tc
ORDER BY c.dimension, c.churn_rate_pct DESC;
