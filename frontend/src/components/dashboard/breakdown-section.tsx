import { useMemo } from "react"

import { BreakdownTable } from "@/components/dashboard/breakdown-table"
import { RateVolumeBarChart } from "@/components/dashboard/rate-volume-bar-chart"
import { SectionCard } from "@/components/dashboard/section-card"
import { Badge } from "@/components/ui/badge"
import type { BreakdownRow } from "@/types/dashboard"

type BreakdownSectionProps = {
  id: string
  title: string
  description: string
  footnote?: string
  rows: BreakdownRow[]
  highlightCategory?: string | null
  excludeCategories?: string[]
  chartLayout?: "horizontal" | "vertical"
  badge?: string
}

export function BreakdownSection({
  id,
  title,
  description,
  footnote,
  rows,
  highlightCategory = null,
  excludeCategories = [],
  chartLayout = "horizontal",
  badge,
}: BreakdownSectionProps) {
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => !excludeCategories.includes(row.category)),
    [rows, excludeCategories]
  )

  const chartData = useMemo(
    () =>
      visibleRows.map((row) => ({
        label: row.category,
        churn_rate_pct: row.churn_rate_pct,
        churned_customers: row.churned_customers,
        existing_customers: row.existing_customers,
        pct_of_total_churn: row.pct_of_total_churn,
        highlighted:
          highlightCategory == null
            ? undefined
            : row.category === highlightCategory,
      })),
    [visibleRows, highlightCategory]
  )

  return (
    <SectionCard
      id={id}
      title={title}
      description={description}
      footnote={footnote}
      actions={badge ? <Badge variant="outline">{badge}</Badge> : null}
    >
      <RateVolumeBarChart data={chartData} layout={chartLayout} />
      <BreakdownTable
        rows={visibleRows}
        highlightCategory={highlightCategory}
      />
    </SectionCard>
  )
}
