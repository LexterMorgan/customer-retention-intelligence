import { BillingSection } from "@/components/dashboard/billing-section"
import { BreakdownSection } from "@/components/dashboard/breakdown-section"
import { ChurnReasonsSection } from "@/components/dashboard/churn-reasons-section"
import { ContractTenureSection } from "@/components/dashboard/contract-tenure-section"
import { DemographicsSection } from "@/components/dashboard/demographics-section"
import { ExecutiveInsights } from "@/components/dashboard/executive-insights"
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

function SubsectionHeading({ children }: { children: string }) {
  return (
    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

export function AnalyticalViews({ payload }: AnalyticalViewsProps) {
  const { filters } = useDashboardFilters()

  return (
    <div className="flex flex-col gap-7 lg:gap-8">
      <section
        id="evidence-breakdowns"
        aria-label="Churn by segment"
        className="scroll-mt-12 space-y-3.5"
      >
        <SectionIntro
          title="Churn by segment"
          subtitle="Internet type and tenure. Headline figures stay full-dataset."
        />

        <div className="grid gap-3.5 xl:grid-cols-2">
          <BreakdownSection
            id="internet-breakdown"
            title="Internet Type breakdown"
            description="Churn rate by Internet Type. N/A excluded from the chart per the executive overview specification."
            rows={payload.by_internet}
            highlightCategory={filters.internet_type}
            excludeCategories={["N/A"]}
          />
          <BreakdownSection
            id="tenure-breakdown"
            title="Tenure breakdown"
            description="Churn rate by Tenure Band (established lifecycle order)."
            rows={payload.by_tenure}
            highlightCategory={filters.tenure_band}
            chartLayout="vertical"
          />
        </div>
      </section>

      <ExecutiveInsights payload={payload} />

      <section
        id="drivers"
        aria-label="Churn drivers"
        className="scroll-mt-12 space-y-6"
      >
        <SectionIntro
          title="Drivers"
          subtitle="Offer, billing, demographics, self-reported exit themes, and contract × tenure concentration."
        />

        <BreakdownSection
          id="offer-breakdown"
          title="Offer breakdown"
          description="Churn by Offer (including None). Offer E is associated with M2M + early tenure — confounded, not causal."
          rows={payload.by_offer}
        />

        <div className="space-y-2">
          <SubsectionHeading>Billing and demographics</SubsectionHeading>
          <div className="grid gap-3.5 xl:grid-cols-2">
            <BillingSection billing={payload.by_billing} />
            <DemographicsSection demographics={payload.by_demographics} />
          </div>
        </div>

        <div className="space-y-2">
          <SubsectionHeading>Self-reported exit themes</SubsectionHeading>
          <ChurnReasonsSection
            totalChurned={payload.churn_reasons.total_churned}
            categories={payload.churn_reasons.categories}
            topReasons={payload.churn_reasons.top_5_reasons}
          />
        </div>

        <div className="space-y-2">
          <SubsectionHeading>Contract × tenure concentration</SubsectionHeading>
          <ContractTenureSection
            matrix={payload.contract_tenure_matrix}
            highlightContract={filters.contract}
            highlightTenure={filters.tenure_band}
          />
        </div>
      </section>

      <section
        id="risk-segments"
        aria-label="Risk tiers and segments"
        className="scroll-mt-12 space-y-6"
      >
        <SectionIntro
          title="Risk & Segments"
          subtitle="Rule-based tiers, overlapping descriptive segments, then the illustrative scenario."
        />

        <RiskTiersSection rows={payload.risk_tiers} />
        <SegmentsSection rows={payload.segments} />

        <div className="space-y-2">
          <SubsectionHeading>Illustrative scenario</SubsectionHeading>
          <MrvlScenarioSection
            mrvl={payload.mrvl}
            scenario={payload.scenario}
          />
        </div>
      </section>

      <aside className="space-y-1.5 border-t border-border/70 pt-5">
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
