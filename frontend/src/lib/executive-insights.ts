import { formatCurrency, formatInteger, formatPercent } from "@/lib/format"
import type { DashboardPayload } from "@/types/dashboard"

export type ExecutiveInsight = {
  id: string
  headline: string
  metric: string
  implication: string
}

/**
 * Presentation-only interpretation layer.
 * Metrics are read from the validated payload — never recomputed.
 */
export function buildExecutiveInsights(
  payload: DashboardPayload
): ExecutiveInsight[] {
  const earlyTenure = payload.by_tenure.find(
    (row) => row.category === "0-6 months"
  )
  const longTenure = payload.by_tenure.find(
    (row) => row.category === "49-72 months"
  )
  const monthToMonth = payload.by_contract.find(
    (row) => row.category === "Month-to-Month"
  )
  const oneYear = payload.by_contract.find(
    (row) => row.category === "One Year"
  )
  const twoYear = payload.by_contract.find(
    (row) => row.category === "Two Year"
  )
  const highRiskSegment = payload.segments.find(
    (row) => row.segment === "M2M + 0-6 months + Fiber Optic"
  )
  const offerE = payload.by_offer.find((row) => row.category === "Offer E")
  const [reasonOne, reasonTwo] = payload.churn_reasons.top_5_reasons

  const insights: ExecutiveInsight[] = []

  if (earlyTenure) {
    insights.push({
      id: "early-tenure",
      headline: "Early tenure is the highest-risk lifecycle stage",
      metric: `${formatPercent(earlyTenure.churn_rate_pct)} churn rate among 0–6 month customers · ${formatPercent(earlyTenure.pct_of_total_churn)} of all churn`,
      implication:
        "Prioritize early-tenure retention and onboarding interventions.",
    })
  }

  if (monthToMonth && oneYear && twoYear) {
    insights.push({
      id: "contract-structure",
      headline: "Month-to-Month contracts are associated with elevated churn",
      metric: `${formatPercent(monthToMonth.churn_rate_pct)} M2M vs ${formatPercent(oneYear.churn_rate_pct)} One Year and ${formatPercent(twoYear.churn_rate_pct)} Two Year`,
      implication:
        "Review contract-mix exposure and conversion paths away from M2M where appropriate.",
    })
  }

  if (highRiskSegment) {
    insights.push({
      id: "high-risk-intersection",
      headline: "Churn concentrates in the M2M + early tenure + Fiber segment",
      metric: `${formatPercent(highRiskSegment.churn_rate_pct)} churn rate · ${formatInteger(highRiskSegment.churned_customers)} churned customers`,
      implication:
        "Treat this descriptive intersection as a priority watchlist for retention focus.",
    })
  }

  if (offerE) {
    insights.push({
      id: "offer-e",
      headline: "Offer E shows elevated churn association",
      metric: `${formatPercent(offerE.churn_rate_pct)} churn rate among Offer E customers`,
      implication:
        "Investigate Offer E alongside M2M and early-tenure mix — association may be confounded.",
    })
  }

  if (reasonOne && reasonTwo) {
    insights.push({
      id: "competitor-reasons",
      headline: "Top stated exit themes are competitor-related",
      metric: `“${reasonOne.reason}” (${formatInteger(reasonOne.churner_count)}) · “${reasonTwo.reason}” (${formatInteger(reasonTwo.churner_count)})`,
      implication:
        "Use stated reasons as directional themes, not verified causal explanations.",
    })
  }

  insights.push({
    id: "mrvl",
    headline: "Churn carries material monthly recurring value loss",
    metric: `${formatCurrency(payload.kpis.mrvl)} MRVL across ${formatInteger(payload.kpis.churned_customers)} churned customers`,
    implication:
      "Anchor retention prioritization to both volume and recurring-value impact.",
  })

  if (earlyTenure && longTenure) {
    insights.push({
      id: "tenure-contrast",
      headline: "Long-tenure customers show markedly lower churn",
      metric: `${formatPercent(longTenure.churn_rate_pct)} for 49–72 months vs ${formatPercent(earlyTenure.churn_rate_pct)} for 0–6 months`,
      implication:
        "Protect mature relationships while concentrating effort on early-lifecycle risk.",
    })
  }

  return insights
}
