import { BreakdownTable } from "@/components/dashboard/breakdown-table"
import { RateVolumeBarChart } from "@/components/dashboard/rate-volume-bar-chart"
import { SectionCard } from "@/components/dashboard/section-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BreakdownRow } from "@/types/dashboard"

type DemographicsSectionProps = {
  demographics: {
    age_band: BreakdownRow[]
    gender: BreakdownRow[]
    married: BreakdownRow[]
    dependents: BreakdownRow[]
  }
}

const TABS = [
  { value: "age_band", label: "Age band" },
  { value: "gender", label: "Gender" },
  { value: "married", label: "Married" },
  { value: "dependents", label: "Dependents" },
] as const

function toChartData(rows: BreakdownRow[]) {
  return rows.map((row) => ({
    label: row.category,
    churn_rate_pct: row.churn_rate_pct,
    churned_customers: row.churned_customers,
    existing_customers: row.existing_customers,
    pct_of_total_churn: row.pct_of_total_churn,
  }))
}

export function DemographicsSection({
  demographics,
}: DemographicsSectionProps) {
  return (
    <SectionCard
      id="demographic-breakdowns"
      title="Demographic breakdowns"
      description="Associational view by age band, gender, married status, and dependents."
      footnote="Band boundaries come from the validated payload / cleaning pipeline."
    >
      <Tabs defaultValue="age_band" className="gap-3">
        <TabsList variant="line" className="w-full justify-start gap-1">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((item) => {
          const rows = demographics[item.value]
          return (
            <TabsContent
              key={item.value}
              value={item.value}
              className="space-y-3"
            >
              <RateVolumeBarChart
                data={toChartData(rows)}
                layout={item.value === "age_band" ? "vertical" : "horizontal"}
              />
              <BreakdownTable rows={rows} categoryLabel={item.label} />
            </TabsContent>
          )
        })}
      </Tabs>
    </SectionCard>
  )
}
