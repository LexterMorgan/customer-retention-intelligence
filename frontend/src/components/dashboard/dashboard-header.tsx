import { ThemeToggle } from "@/components/dashboard/theme-toggle"
import type { DashboardMetadata } from "@/types/dashboard"

type DashboardHeaderProps = {
  metadata: DashboardMetadata | null
}

export function DashboardHeader({ metadata }: DashboardHeaderProps) {
  const snapshot = metadata?.snapshot ?? "Q2 2022"

  return (
    <header className="flex items-start justify-between gap-3 border-b border-border/70 pb-5">
      <div className="min-w-0 space-y-1">
        <p className="dashboard-label">Customer Retention Intelligence</p>
        <h1 className="dashboard-page-title">{snapshot} churn report</h1>
        <p className="dashboard-section-subtitle hidden max-w-2xl sm:block">
          Existing-customer churn, monthly recurring value lost, and where churn
          concentrates by contract.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  )
}
