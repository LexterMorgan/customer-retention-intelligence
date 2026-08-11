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
import type { SegmentRow } from "@/types/dashboard"

type SegmentsSectionProps = {
  rows: SegmentRow[]
}

export function SegmentsSection({ rows }: SegmentsSectionProps) {
  const volumeData = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.churned_customers - a.churned_customers)
        .map((row) => ({
          label: row.segment,
          churn_rate_pct: row.churn_rate_pct,
          churned_customers: row.churned_customers,
          existing_customers: row.existing_customers,
          pct_of_total_churn: row.pct_of_total_churn,
        })),
    [rows]
  )

  return (
    <SectionCard
      id="segments"
      title="Priority segments"
      description="Overlapping descriptive segments. Associational — not causal."
      footnote="Segments may overlap. Chart ordered by payload churned counts."
      actions={<Badge variant="secondary">Descriptive</Badge>}
    >
      <RateVolumeBarChart
        data={volumeData}
        mode="volume"
        heightClassName="aspect-auto h-[280px]"
      />

      <div className={dashboardTableWrapClass()}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={dashboardTableHeadClass}>Segment</TableHead>
              <TableHead className={dashboardTableHeadClass}>SQL label</TableHead>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.segment} className="hover:bg-muted/40">
                <TableCell
                  className={`${dashboardTableCellClass} font-medium whitespace-normal`}
                >
                  {row.segment}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-muted-foreground whitespace-normal`}
                >
                  {row.sql_label}
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  )
}
