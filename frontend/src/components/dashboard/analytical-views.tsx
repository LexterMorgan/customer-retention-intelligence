import { BillingSection } from "@/components/dashboard/billing-section"
import { BreakdownSection } from "@/components/dashboard/breakdown-section"
import { ChurnReasonsSection } from "@/components/dashboard/churn-reasons-section"
import { ContractTenureSection } from "@/components/dashboard/contract-tenure-section"
import { DemographicsSection } from "@/components/dashboard/demographics-section"
import { MrvlScenarioSection } from "@/components/dashboard/mrvl-scenario-section"
import { RiskTiersSection } from "@/components/dashboard/risk-tiers-section"
import { SegmentsSection } from "@/components/dashboard/segments-section"
import { useDashboardFilters } from "@/hooks/use-dashboard-filters"
import type { DashboardPayload } from "@/types/dashboard"

type AnalyticalViewsProps = {
  payload: DashboardPayload
}

function SectionIntro({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="space-y-0.5">
      <h2 className="dashboard-section-title text-lg">{title}</h2>
      <p className="dashboard-section-subtitle max-w-3xl">{subtitle}</p>
    </div>
  )
}

export function AnalyticalViews({ payload }: AnalyticalViewsProps) {
  const { filters } = useDashboardFilters()

  return (
    <div className="flex flex-col gap-7 lg:gap-8">
      <section
        id="evidence-breakdowns"
        aria-label="Evidence and breakdowns"
        className="scroll-mt-6 space-y-3.5"
      >
        <SectionIntro
          title="Evidence & breakdowns"
          subtitle="Supporting detail behind the executive insights. KPI cards remain the unfiltered portfolio baseline."
        />

        <div className="grid gap-3.5 xl:grid-cols-2">
          <BreakdownSection
            id="contract-breakdown"
            title="Contract breakdown"
            description="Churn rate by Contract."
            rows={payload.by_contract}
            highlightCategory={filters.contract}
            footnote="Share of churn uses the all-churn denominator from the payload."
          />
          <BreakdownSection
            id="internet-breakdown"
            title="Internet Type breakdown"
            description="Churn rate by Internet Type. N/A excluded from the chart per the executive overview specification."
            rows={payload.by_internet}
            highlightCategory={filters.internet_type}
            excludeCategories={["N/A"]}
          />
        </div>

        <BreakdownSection
          id="tenure-breakdown"
          title="Tenure breakdown"
          description="Churn rate by Tenure Band (established lifecycle order)."
          rows={payload.by_tenure}
          highlightCategory={filters.tenure_band}
          chartLayout="vertical"
        />
      </section>

      <section
        id="drivers"
        aria-label="Churn drivers"
        className="scroll-mt-6 space-y-3.5"
      >
        <SectionIntro
          title="Drivers & concentration"
          subtitle="Offer, billing, demographics, stated exit reasons, and Contract × Tenure concentration."
        />

        <BreakdownSection
          id="offer-breakdown"
          title="Offer breakdown"
          description="Churn by Offer (including None). Offer E is associated with M2M + early tenure — confounded, not causal."
          rows={payload.by_offer}
        />

        <BillingSection billing={payload.by_billing} />
        <DemographicsSection demographics={payload.by_demographics} />

        <ChurnReasonsSection
          totalChurned={payload.churn_reasons.total_churned}
          categories={payload.churn_reasons.categories}
          topReasons={payload.churn_reasons.top_5_reasons}
        />

        <ContractTenureSection
          matrix={payload.contract_tenure_matrix}
          highlightContract={filters.contract}
          highlightTenure={filters.tenure_band}
        />
      </section>

      <section
        id="risk-segments"
        aria-label="Risk tiers and segments"
        className="scroll-mt-6 space-y-3.5"
      >
        <SectionIntro
          title="Risk concentration & financial impact"
          subtitle="Descriptive risk tiers, overlapping segments, MRVL, and the illustrative retention what-if."
        />

        <RiskTiersSection rows={payload.risk_tiers} />
        <SegmentsSection rows={payload.segments} />
        <MrvlScenarioSection mrvl={payload.mrvl} scenario={payload.scenario} />
      </section>

      <aside className="dashboard-panel space-y-1.5 px-4 py-3.5">
        <p className="text-xs font-semibold tracking-tight">
          Analytical disclaimers
        </p>
        <ul className="dashboard-footnote list-disc space-y-1 pl-4">
          <li>
            Descriptive / associational analysis only — not causal claims.
          </li>
          <li>
            Risk tiers are rule-based segments, not predictive probabilities.
          </li>
          <li>
            Scenario values are illustrative what-if scenarios, not forecasts.
          </li>
          <li>
            Stated churn reasons are self-reported themes, not verified causal
            explanations.
          </li>
        </ul>
        <p className="dashboard-footnote border-t border-border/70 pt-2">
          {payload.metadata.analysis_notes} Source: {payload.metadata.source} (
          {payload.metadata.snapshot}).
        </p>
      </aside>
    </div>
  )
}
