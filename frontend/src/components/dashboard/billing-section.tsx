import { BreakdownTable } from "@/components/dashboard/breakdown-table"
import { RateVolumeBarChart } from "@/components/dashboard/rate-volume-bar-chart"
import { SectionCard } from "@/components/dashboard/section-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BillingBreakdownRow } from "@/types/dashboard"

type BillingSectionProps = {
  billing: {
    payment_method: BillingBreakdownRow[]
    paperless_billing: BillingBreakdownRow[]
    charge_band: BillingBreakdownRow[]
  }
}

const TABS = [
  {
    value: "payment_method",
    label: "Payment method",
  },
  {
    value: "charge_band",
    label: "Charge band",
  },
  {
    value: "paperless_billing",
    label: "Paperless billing",
  },
] as const

function toChartData(rows: BillingBreakdownRow[]) {
  return rows.map((row) => ({
    label: row.category,
    churn_rate_pct: row.churn_rate_pct,
    churned_customers: row.churned_customers,
    existing_customers: row.existing_customers,
    pct_of_total_churn: row.pct_of_total_churn,
  }))
}

function avgChargeMap(rows: BillingBreakdownRow[]) {
  const map: Record<string, number> = {}
  for (const row of rows) {
    map[row.category] = row.avg_monthly_charge
  }
  return map
}

export function BillingSection({ billing }: BillingSectionProps) {
  return (
    <SectionCard
      id="billing-breakdown"
      title="Billing breakdown"
      description="Payment method, charge band, and paperless billing associations."
      footnote="Avg monthly charge is payload context only — not recomputed in the browser."
    >
      <Tabs defaultValue="payment_method" className="gap-3">
        <TabsList variant="line" className="w-full justify-start gap-1">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((item) => {
          const rows = billing[item.value]
          return (
            <TabsContent
              key={item.value}
              value={item.value}
              className="space-y-3"
            >
              <RateVolumeBarChart data={toChartData(rows)} />
              <BreakdownTable
                rows={rows}
                categoryLabel={item.label}
                showAvgCharge
                avgChargeByCategory={avgChargeMap(rows)}
              />
            </TabsContent>
          )
        })}
      </Tabs>
    </SectionCard>
  )
}
