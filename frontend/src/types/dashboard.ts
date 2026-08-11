/** Types for data/processed/dashboard_payload.json (Milestone 2 artifact). */

export type DashboardKpis = {
  total_customers: number
  existing_customers: number
  churned_customers: number
  retained_customers: number
  churn_rate_pct: number
  retention_rate_pct: number
  mrvl: number
  joined_customers: number
}

export type DashboardMetadata = {
  analysis_notes: string
  column_count: number
  definitions_ref: string
  generated_by: string
  joined_excluded_from_rates: boolean
  row_count: number
  snapshot: string
  source: string
  source_sha256: string
}

export type FilterDimensions = {
  contract: string[]
  tenure_band: string[]
  internet_type: string[]
  offer: string[]
  payment_method: string[]
  age_band: string[]
  charge_band: string[]
  descriptive_churn_risk_tier: string[]
  customer_status: string[]
}

/** Shared row shape for single-dimension churn breakdowns. */
export type BreakdownRow = {
  category: string
  existing_customers: number
  churned_customers: number
  retained_customers: number
  churn_rate_pct: number
  pct_of_total_churn: number
}

export type BillingBreakdownRow = BreakdownRow & {
  avg_monthly_charge: number
}

export type ChurnReasonCategory = {
  category: string
  churner_count: number
  pct_of_churners: number
}

export type ChurnReasonRow = {
  rank: number
  reason: string
  churner_count: number
  pct_of_churners: number
  cumulative_pct_of_churners: number
}

export type RiskTierRow = {
  tier: string
  existing_customers: number
  churned_customers: number
  churn_rate_pct: number
  pct_of_total_churn: number
  avg_risk_points: number
}

export type SegmentRow = {
  segment: string
  sql_label: string
  existing_customers: number
  churned_customers: number
  churn_rate_pct: number
  pct_of_total_churn: number
}

export type ContractTenureCell = {
  contract: string
  tenure_band: string
  existing_customers: number
  churned_customers: number
  churn_rate_pct: number
}

export type DashboardPayload = {
  metadata: DashboardMetadata
  kpis: DashboardKpis
  filter_dimensions: FilterDimensions
  by_contract: BreakdownRow[]
  by_tenure: BreakdownRow[]
  by_internet: BreakdownRow[]
  by_offer: BreakdownRow[]
  by_billing: {
    payment_method: BillingBreakdownRow[]
    paperless_billing: BillingBreakdownRow[]
    charge_band: BillingBreakdownRow[]
  }
  by_demographics: {
    age_band: BreakdownRow[]
    gender: BreakdownRow[]
    married: BreakdownRow[]
    dependents: BreakdownRow[]
  }
  churn_reasons: {
    total_churned: number
    categories: ChurnReasonCategory[]
    reasons: ChurnReasonRow[]
    top_reasons: ChurnReasonRow[]
    top_5_reasons: ChurnReasonRow[]
  }
  risk_tiers: RiskTierRow[]
  segments: SegmentRow[]
  contract_tenure_matrix: ContractTenureCell[]
  mrvl: {
    definition: string
    mrvl: number
    churned_customers: number
    avg_monthly_charge_churned: number
  }
  scenario: {
    name: string
    segment: string
    illustrative_only: boolean
    retention_assumption_pct: number
    churned_in_segment: number
    scenario_retained_customers: number
    segment_monthly_lost: number
    scenario_monthly_preserved: number
    scenario_annual_preserved: number
  }
}

/** Global filter keys used by the Excel/Tableau interactive shells. */
export const PRIMARY_FILTER_KEYS = [
  "contract",
  "tenure_band",
  "internet_type",
] as const

export type PrimaryFilterKey = (typeof PRIMARY_FILTER_KEYS)[number]

export type DashboardFilters = Record<PrimaryFilterKey, string | null>

export const EMPTY_FILTERS: DashboardFilters = {
  contract: null,
  tenure_band: null,
  internet_type: null,
}

export const CONTRACT_ORDER = [
  "Month-to-Month",
  "One Year",
  "Two Year",
] as const

export const TENURE_ORDER = [
  "0-6 months",
  "7-12 months",
  "13-24 months",
  "25-36 months",
  "37-48 months",
  "49-72 months",
] as const
