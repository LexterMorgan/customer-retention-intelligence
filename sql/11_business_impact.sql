-- =============================================================================
-- 11_business_impact.sql
-- Business question: What is the business value associated with churn,
-- and what might simple retention scenarios look like?
--
-- Scenarios are HYPOTHETICAL ONLY — not forecasts, not causal estimates, and not
-- predictions of intervention success. Association only.
-- =============================================================================

WITH existing AS (
    SELECT *
    FROM customers
    WHERE "Customer Status" IN ('Churned', 'Stayed')
),

-- Overall value comparison: churned vs retained
value_comparison AS (
    SELECT
        'Value Comparison'                                          AS analysis_section,
        e."Customer Status"                                         AS segment,
        COUNT(*)                                                    AS customers,
        ROUND(AVG(e."Monthly Charge"), 2)                           AS avg_monthly_charge,
        ROUND(SUM(e."Monthly Charge"), 2)                           AS total_monthly_charge,
        ROUND(SUM(e."Total Revenue"), 2)                            AS total_historical_revenue,
        NULL                                                        AS scenario_retained_customers,
        NULL                                                        AS scenario_monthly_value_preserved,
        NULL                                                        AS scenario_annual_value_preserved
    FROM existing e
    GROUP BY e."Customer Status"
),

-- Monthly Recurring Value Lost (approved Phase 2 KPI)
recurring_lost AS (
    SELECT
        'Monthly Recurring Value Lost'                              AS analysis_section,
        'All Churned'                                               AS segment,
        COUNT(*)                                                    AS customers,
        ROUND(AVG("Monthly Charge"), 2)                             AS avg_monthly_charge,
        ROUND(SUM("Monthly Charge"), 2)                             AS total_monthly_charge,
        ROUND(SUM("Total Revenue"), 2)                              AS total_historical_revenue,
        NULL, NULL, NULL
    FROM customers
    WHERE "Customer Status" = 'Churned'
),

-- Value concentration in highest-risk intersection
high_risk_intersection AS (
    SELECT
        'High-Risk Intersection Value'                                AS analysis_section,
        'M2M + 0-6mo + Fiber'                                         AS segment,
        COUNT(*)                                                    AS customers,
        ROUND(AVG("Monthly Charge"), 2)                             AS avg_monthly_charge,
        ROUND(SUM(CASE WHEN "Customer Status" = 'Churned'
                       THEN "Monthly Charge" ELSE 0 END), 2)        AS total_monthly_charge,
        ROUND(SUM(CASE WHEN "Customer Status" = 'Churned'
                       THEN "Total Revenue" ELSE 0 END), 2)          AS total_historical_revenue,
        NULL, NULL, NULL
    FROM existing
    WHERE Contract = 'Month-to-Month'
      AND Tenure_Band = '0-6 months'
      AND "Internet Type" = 'Fiber Optic'
),

-- Churn volume by contract (where most value leaves)
contract_impact AS (
    SELECT
        'Churn Volume by Contract'                                  AS analysis_section,
        Contract                                                    AS segment,
        SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                    AS customers,
        ROUND(AVG(CASE WHEN "Customer Status" = 'Churned'
                         THEN "Monthly Charge" END), 2)            AS avg_monthly_charge,
        ROUND(SUM(CASE WHEN "Customer Status" = 'Churned'
                       THEN "Monthly Charge" ELSE 0 END), 2)        AS total_monthly_charge,
        ROUND(SUM(CASE WHEN "Customer Status" = 'Churned'
                       THEN "Total Revenue" ELSE 0 END), 2)        AS total_historical_revenue,
        NULL, NULL, NULL
    FROM existing
    GROUP BY Contract
    HAVING SUM(CASE WHEN "Customer Status" = 'Churned' THEN 1 ELSE 0 END) > 0
),

-- HYPOTHETICAL SCENARIO ONLY (not a forecast or causal estimate):
-- retain 10% of churned customers in highest-risk intersection
-- (M2M + 0-6 months + Fiber Optic who churned)
-- Formula: segment_monthly_lost × 10% — illustrative sizing only.
scenario AS (
    SELECT
        COUNT(*)                                                    AS churned_in_segment,
        ROUND(SUM("Monthly Charge"), 2)                             AS segment_monthly_lost,
        ROUND(COUNT(*) * 0.10, 0)                                   AS scenario_retained_customers,
        ROUND(SUM("Monthly Charge") * 0.10, 2)                      AS scenario_monthly_preserved,
        ROUND(SUM("Monthly Charge") * 0.10 * 12, 2)                 AS scenario_annual_preserved
    FROM existing
    WHERE Contract = 'Month-to-Month'
      AND Tenure_Band = '0-6 months'
      AND "Internet Type" = 'Fiber Optic'
      AND "Customer Status" = 'Churned'
),

scenario_output AS (
    SELECT
        'Hypothetical Scenario (NOT a forecast)'                      AS analysis_section,
        'Retain 10% of churned in M2M+0-6mo+Fiber [what-if only]'    AS segment,
        s.churned_in_segment                                        AS customers,
        ROUND(s.segment_monthly_lost / NULLIF(s.churned_in_segment, 0), 2)
                                                                    AS avg_monthly_charge,
        s.segment_monthly_lost                                      AS total_monthly_charge,
        NULL                                                        AS total_historical_revenue,
        s.scenario_retained_customers,
        s.scenario_monthly_preserved,
        s.scenario_annual_preserved
    FROM scenario s
)

SELECT * FROM value_comparison
UNION ALL SELECT * FROM recurring_lost
UNION ALL SELECT * FROM high_risk_intersection
UNION ALL SELECT * FROM contract_impact
UNION ALL SELECT * FROM scenario_output
ORDER BY analysis_section, segment;
