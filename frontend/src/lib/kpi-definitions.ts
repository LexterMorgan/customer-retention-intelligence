import type { DashboardKpis, DashboardPayload } from "@/types/dashboard"
import {
  formatCurrency,
  formatInteger,
  formatPercent,
} from "@/lib/format"

export type KpiId = keyof Pick<
  DashboardKpis,
  | "total_customers"
  | "existing_customers"
  | "churned_customers"
  | "retained_customers"
  | "churn_rate_pct"
  | "retention_rate_pct"
  | "mrvl"
>

export type KpiTone = "neutral" | "positive" | "risk"

export type KpiDefinition = {
  id: KpiId
  label: string
  definition: string
  format: (value: number) => string
  /** Presentation-only cue; does not change metric definitions or values. */
  tone?: KpiTone
  /** Optional secondary line drawn from payload context (not recomputed). */
  footnote?: (payload: DashboardPayload) => string | undefined
}

/**
 * Presentation metadata for the seven primary Tableau BAN KPIs.
 * Values always come from payload.kpis — labels/definitions match existing specs.
 */
export const PRIMARY_KPI_DEFINITIONS: readonly KpiDefinition[] = [
  {
    id: "total_customers",
    label: "Total Customers",
    definition: "All customers in the cleaned snapshot.",
    format: formatInteger,
    tone: "neutral",
  },
  {
    id: "existing_customers",
    label: "Existing Customers",
    definition: "Churned + Stayed (Joined excluded from rates).",
    format: formatInteger,
    tone: "neutral",
    footnote: (payload) =>
      `Joined (excluded from rates): ${formatInteger(payload.kpis.joined_customers)}`,
  },
  {
    id: "churned_customers",
    label: "Churned Customers",
    definition: "Customer Status = Churned.",
    format: formatInteger,
    tone: "risk",
  },
  {
    id: "retained_customers",
    label: "Retained Customers",
    definition: "Customer Status = Stayed.",
    format: formatInteger,
    tone: "positive",
  },
  {
    id: "churn_rate_pct",
    label: "Churn Rate",
    definition: "Churned / Existing Customers.",
    format: formatPercent,
    tone: "risk",
  },
  {
    id: "retention_rate_pct",
    label: "Retention Rate",
    definition: "Retained / Existing Customers.",
    format: formatPercent,
    tone: "positive",
  },
  {
    id: "mrvl",
    label: "Monthly Recurring Value Lost",
    definition: "SUM(Monthly Charge) WHERE Churned.",
    format: formatCurrency,
    tone: "risk",
    footnote: (payload) =>
      `Avg monthly charge (churned): ${formatCurrency(payload.mrvl.avg_monthly_charge_churned)}`,
  },
] as const
