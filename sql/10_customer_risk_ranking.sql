-- =============================================================================
-- 10_customer_risk_ranking.sql
-- Business question: Which customers show the strongest combination of churn
-- associations, and how do Descriptive Churn Risk Tiers (rule-based) perform?
--
-- LIMITATIONS (read before interpreting):
--   - Descriptive / Rule-Based Churn Risk Tiers — NOT predictive-model outputs.
--   - This is NOT a predictive ML model.
--   - Risk points reflect Phase 3 associations (contract, tenure, internet, household).
--   - Points do not prove causation or forecast individual churn probability.
-- =============================================================================

WITH existing AS (
    SELECT *
    FROM customers
    WHERE "Customer Status" IN ('Churned', 'Stayed')
),

-- Transparent point assignment based on Phase 3 high-confidence associations
scored AS (
    SELECT
        "Customer ID",
        Contract,
        Tenure_Band,
        "Internet Type",
        "Monthly Charge",
        "Customer Status",

        -- Month-to-Month: strongest structural driver (51.7% vs 2.6% Two Year)
        CASE WHEN Contract = 'Month-to-Month' THEN 3 ELSE 0 END
        +
        -- Early tenure 0-6 months: 77.2% churn in Phase 3
        CASE WHEN Tenure_Band = '0-6 months' THEN 3 ELSE 0 END
        +
        -- Fiber Optic: 42.1% churn among internet customers
        CASE WHEN "Internet Type" = 'Fiber Optic' THEN 2 ELSE 0 END
        +
        -- No dependents: 35.0% vs 6.9% with dependents
        CASE WHEN "Number of Dependents" = 0 THEN 1 ELSE 0 END
        +
        -- Not married: 36.7% vs 20.2% married
        CASE WHEN Married = 'No' THEN 1 ELSE 0 END
                                                                    AS risk_points

    FROM existing
),

tiered AS (
    SELECT
        s.*,
        CASE
            WHEN s.risk_points >= 6 THEN 'Very High'
            WHEN s.risk_points >= 4 THEN 'High'
            WHEN s.risk_points >= 2 THEN 'Medium'
            ELSE 'Low'
        END                                                         AS risk_tier
    FROM scored s
)

-- Part A: Customer-level ranking (top 20 highest-risk for portfolio demo)
SELECT
    'Customer Detail'                                               AS output_section,
    t."Customer ID",
    t.Contract,
    t.Tenure_Band,
    t."Internet Type",
    ROUND(t."Monthly Charge", 2)                                  AS monthly_charge,
    t.risk_points,
    t.risk_tier,
    t."Customer Status"
FROM tiered t
ORDER BY t.risk_points DESC, t."Monthly Charge" DESC
LIMIT 20;

-- Part B: Risk tier summary — validates whether points separate churn rates
WITH existing AS (
    SELECT * FROM customers WHERE "Customer Status" IN ('Churned', 'Stayed')
),
scored AS (
    SELECT
        "Customer Status",
        CASE WHEN Contract = 'Month-to-Month' THEN 3 ELSE 0 END
        + CASE WHEN Tenure_Band = '0-6 months' THEN 3 ELSE 0 END
        + CASE WHEN "Internet Type" = 'Fiber Optic' THEN 2 ELSE 0 END
        + CASE WHEN "Number of Dependents" = 0 THEN 1 ELSE 0 END
        + CASE WHEN Married = 'No' THEN 1 ELSE 0 END                AS risk_points
    FROM existing
),
tiered AS (
    SELECT
        s."Customer Status",
        CASE
            WHEN s.risk_points >= 6 THEN 'Very High'
            WHEN s.risk_points >= 4 THEN 'High'
            WHEN s.risk_points >= 2 THEN 'Medium'
            ELSE 'Low'
        END                                                         AS risk_tier
    FROM scored s
)
SELECT
    t.risk_tier,
    COUNT(*)                                                        AS tier_customers,
    SUM(CASE WHEN t."Customer Status" = 'Churned' THEN 1 ELSE 0 END)
                                                                    AS tier_churned,
    ROUND(
        100.0 * SUM(CASE WHEN t."Customer Status" = 'Churned' THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0), 2
    )                                                               AS tier_churn_rate_pct
FROM tiered t
GROUP BY t.risk_tier
ORDER BY
    CASE t.risk_tier
        WHEN 'Very High' THEN 1
        WHEN 'High'      THEN 2
        WHEN 'Medium'    THEN 3
        ELSE 4
    END;
