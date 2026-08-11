import { useMemo } from "react"

import { RateVolumeBarChart } from "@/components/dashboard/rate-volume-bar-chart"
import { SectionCard } from "@/components/dashboard/section-card"
import {
  dashboardTableCellClass,
  dashboardTableHeadClass,
  dashboardTableWrapClass,
} from "@/components/dashboard/table-styles"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatInteger, formatPercent } from "@/lib/format"
import type { RiskTierRow } from "@/types/dashboard"

type RiskTiersSectionProps = {
  rows: RiskTierRow[]
}

export function RiskTiersSection({ rows }: RiskTiersSectionProps) {
  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        label: row.tier,
        churn_rate_pct: row.churn_rate_pct,
        churned_customers: row.churned_customers,
        existing_customers: row.existing_customers,
        pct_of_total_churn: row.pct_of_total_churn,
      })),
    [rows]
  )

  return (
    <SectionCard
      id="risk-tiers"
      title="Descriptive Churn Risk Tiers"
      description="Rule-based descriptive segments — not predictive probabilities."
      footnote="Descriptive / rule-based churn risk tiers. Association only."
      actions={<Badge variant="secondary">Not predictive</Badge>}
    >
      <div className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Churn rate by tier
        </h3>
        <RateVolumeBarChart data={chartData} mode="rate" />
      </div>

      <div className={dashboardTableWrapClass()}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={dashboardTableHeadClass}>Tier</TableHead>
              <TableHead className={`${dashboardTableHeadClass} text-right`}>
                Existing
              </TableHead>
              <TableHead className={`${dashboardTableHeadClass} text-right`}>
                Churned
              </TableHead>
              <TableHead className={`${dashboardTableHeadClass} text-right`}>
                Churn rate
              </TableHead>
              <TableHead className={`${dashboardTableHeadClass} text-right`}>
                Share of churn
              </TableHead>
              <TableHead className={`${dashboardTableHeadClass} text-right`}>
                Avg risk pts
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.tier} className="hover:bg-muted/40">
                <TableCell
                  className={`${dashboardTableCellClass} font-medium`}
                >
                  {row.tier}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right tabular-nums text-muted-foreground`}
                >
                  {formatInteger(row.existing_customers)}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right font-medium tabular-nums text-destructive`}
                >
                  {formatInteger(row.churned_customers)}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right font-medium tabular-nums`}
                >
                  {formatPercent(row.churn_rate_pct)}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right tabular-nums text-muted-foreground`}
                >
                  {formatPercent(row.pct_of_total_churn)}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right tabular-nums text-muted-foreground`}
                >
                  {row.avg_risk_points.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  )
}
