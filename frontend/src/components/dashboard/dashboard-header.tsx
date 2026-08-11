import type { DashboardMetadata } from "@/types/dashboard"
import { Badge } from "@/components/ui/badge"

type DashboardHeaderProps = {
  metadata: DashboardMetadata | null
}

export function DashboardHeader({ metadata }: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-border/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <p className="dashboard-label">Customer Retention Intelligence</p>
        <h1 className="dashboard-page-title">Executive Churn Overview</h1>
        <p className="dashboard-section-subtitle max-w-2xl">
          Portfolio baseline from the validated analysis payload. Rates exclude
          Joined customers.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {metadata ? (
          <>
            <Badge variant="secondary" className="font-medium">
              {metadata.snapshot}
            </Badge>
            <Badge variant="outline" className="tabular-nums">
              {metadata.row_count.toLocaleString("en-US")} customers
            </Badge>
            {metadata.joined_excluded_from_rates ? (
              <Badge variant="outline">Joined excluded from rates</Badge>
            ) : null}
          </>
        ) : (
          <Badge variant="outline">Loading snapshot…</Badge>
        )}
      </div>
    </header>
  )
}
