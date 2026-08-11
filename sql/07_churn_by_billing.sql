-- =============================================================================
-- 07_churn_by_billing.sql
-- Business question: How do billing preferences and charge levels relate to churn?
-- Negative Monthly Charge rows are preserved (Flag_Negative_Monthly_Charge = 1).
-- Association only — payment method does not cause churn.
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

-- Payment Method
payment_summary AS (
    SELECT
        'Payment Method'                                              AS dimension,
        "Payment Method"                                              AS category,
        COUNT(*)                                                      AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                      AS churned_customers,
        ROUND(
            100.0 * SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 2
        )                                                             AS churn_rate_pct,
        ROUND(AVG("Monthly Charge"), 2)                             AS avg_monthly_charge
    FROM existing
    GROUP BY "Payment Method"
),

-- Paperless Billing
paperless_summary AS (
    SELECT
        'Paperless Billing'                                           AS dimension,
        "Paperless Billing"                                           AS category,
        COUNT(*)                                                      AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                      AS churned_customers,
        ROUND(
            100.0 * SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 2
        )                                                             AS churn_rate_pct,
        ROUND(AVG("Monthly Charge"), 2)                             AS avg_monthly_charge
    FROM existing
    GROUP BY "Paperless Billing"
),

-- Charge Band
charge_summary AS (
    SELECT
        'Charge_Band'                                                 AS dimension,
        Charge_Band                                                   AS category,
        COUNT(*)                                                      AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                      AS churned_customers,
        ROUND(
            100.0 * SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 2
        )                                                             AS churn_rate_pct,
        ROUND(AVG("Monthly Charge"), 2)                             AS avg_monthly_charge
    FROM existing
    GROUP BY Charge_Band
),

-- Diagnostic: negative monthly charge flag (not removed from analysis)
-- Reports existing-customer count (114). Dataset-wide flagged count = 120 (includes 6 Joined).
negative_flag_summary AS (
    SELECT
        'Negative Charge Flag'                                        AS dimension,
        CASE WHEN Flag_Negative_Monthly_Charge = 1
             THEN 'Flagged (credit/adjustment)' ELSE 'Normal charge' END
                                                                      AS category,
        COUNT(*)                                                      AS existing_customers,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                      AS churned_customers,
        ROUND(
            100.0 * SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*), 0), 2
        )                                                             AS churn_rate_pct,
        ROUND(AVG("Monthly Charge"), 2)                             AS avg_monthly_charge
    FROM existing
    GROUP BY Flag_Negative_Monthly_Charge
),

combined AS (
    SELECT * FROM payment_summary
    UNION ALL SELECT * FROM paperless_summary
    UNION ALL SELECT * FROM charge_summary
    UNION ALL SELECT * FROM negative_flag_summary
)

SELECT
    c.dimension,
    c.category,
    c.existing_customers,
    c.churned_customers,
    c.churn_rate_pct,
    ROUND(100.0 * c.churned_customers / tc.total, 2)                AS pct_of_total_churn,
    c.avg_monthly_charge
FROM combined c
CROSS JOIN total_churned tc
ORDER BY c.dimension, c.churn_rate_pct DESC;
