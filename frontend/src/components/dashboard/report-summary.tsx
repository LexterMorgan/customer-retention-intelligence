import { useEffect, useMemo } from "react"

import { BreakdownTable } from "@/components/dashboard/breakdown-table"
import { RateVolumeBarChart } from "@/components/dashboard/rate-volume-bar-chart"
import { useDashboardFilters } from "@/hooks/use-dashboard-filters"
import {
  formatCurrency,
  formatInteger,
  formatPercent,
} from "@/lib/format"
import { PRIMARY_KPI_DEFINITIONS } from "@/lib/kpi-definitions"
import type { DashboardPayload } from "@/types/dashboard"

type ReportSummaryProps = {
  readonly payload: DashboardPayload
}

export function ReportSummary({ payload }: ReportSummaryProps) {
  const { filters } = useDashboardFilters()
  const kpis = payload.kpis
  const snapshot = payload.metadata.snapshot

  // Direct loads and evidence links target #contract-breakdown. The table is
  // collapsed by default, so reveal it before navigating to the table itself.
  useEffect(() => {
    const revealContractTable = () => {
      if (window.location.hash !== "#contract-breakdown") {
        return
      }
      const disclosure = document.getElementById("contract-breakdown")
      if (!(disclosure instanceof HTMLDetailsElement)) {
        return
      }
      disclosure.open = true
      requestAnimationFrame(() => {
        const table = document.getElementById("contract-breakdown-table")
        table?.focus({ preventScroll: true })
        table?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    }
    revealContractTable()
    window.addEventListener("hashchange", revealContractTable)
    return () => window.removeEventListener("hashchange", revealContractTable)
  }, [])

  const contractChartData = useMemo(
    () =>
      payload.by_contract.map((row) => ({
        label: row.category,
        churn_rate_pct: row.churn_rate_pct,
        churned_customers: row.churned_customers,
        existing_customers: row.existing_customers,
        pct_of_total_churn: row.pct_of_total_churn,
        highlighted:
          filters.contract === null
            ? undefined
            : row.category === filters.contract,
      })),
    [filters.contract, payload.by_contract]
  )

  return (
    <section
      id="executive-overview"
      aria-label="Quarterly churn summary"
      className="scroll-mt-24"
    >
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <p className="dashboard-label normal-case tracking-normal text-xs">
            Churn rate
          </p>
          <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
            <span className="font-heading text-6xl leading-none font-semibold tracking-tight text-destructive tabular-nums sm:text-8xl">
              {formatPercent(kpis.churn_rate_pct)}
            </span>
            <span className="max-w-44 pb-2 text-sm leading-snug text-muted-foreground">
              of existing customers churned this quarter
            </span>
          </div>

          <p className="mt-5 max-w-md text-lg leading-snug text-foreground">
            <strong className="font-semibold tabular-nums">
              {formatInteger(kpis.churned_customers)}
            </strong>{" "}
            of{" "}
            <strong className="font-semibold tabular-nums">
              {formatInteger(kpis.existing_customers)}
            </strong>{" "}
            existing customers churned.
          </p>
          <p className="mt-1.5 max-w-md text-[11px] leading-relaxed text-muted-foreground">
            Rates use existing customers (churned plus stayed). The{" "}
            {formatInteger(kpis.joined_customers)} Joined customers are
            excluded from rate denominators.
          </p>

          <div className="mt-5 max-w-md border-t border-border/70 pt-4 sm:mt-7 sm:pt-5">
            <p className="dashboard-label normal-case tracking-normal text-xs">
              Monthly recurring value lost
            </p>
            <p className="mt-1 text-4xl leading-none font-semibold tracking-tight text-destructive tabular-nums">
              {formatCurrency(kpis.mrvl)}
            </p>
            <p className="mt-2 text-xs leading-snug text-muted-foreground">
              Average{" "}
              {formatCurrency(payload.mrvl.avg_monthly_charge_churned)} per
              churned customer.
            </p>
          </div>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h2 className="dashboard-section-title text-base">
                Churn rate by contract
              </h2>
              <p className="dashboard-section-subtitle mt-0.5">
                Share of existing customers who churned, by contract type.
              </p>
            </div>
            <a
              href="#highlight-charts"
              className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Highlight contract
            </a>
          </div>
          <div className="mt-3">
            <RateVolumeBarChart
              data={contractChartData}
              heightClassName="h-[260px]"
            />
          </div>
          <p className="dashboard-footnote mt-2">
            Month-to-Month carries the highest observed churn rate. Contract
            type is associated with churn, not shown to cause it.
          </p>

          <details
            id="contract-breakdown"
            className="mt-4 scroll-mt-24 border-t border-border/70 pt-2"
          >
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm text-xs font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              Contract details
              <span className="text-[11px] font-normal text-muted-foreground">
                Existing, churned, retained, rate, share
              </span>
            </summary>
            <div
              id="contract-breakdown-table"
              tabIndex={-1}
              className="mt-3 scroll-mt-24 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:[&_.dashboard-table-wrap]:rounded-md max-sm:[&_.dashboard-table-wrap_table]:!min-w-0 max-sm:[&_table]:table-fixed max-sm:[&_th]:px-1 max-sm:[&_th]:text-[10px] max-sm:[&_th]:leading-tight max-sm:[&_th]:tracking-normal max-sm:[&_th]:whitespace-normal max-sm:[&_td]:px-1 max-sm:[&_td]:py-2 max-sm:[&_td]:text-[10px]"
            >
              <BreakdownTable
                rows={payload.by_contract}
                highlightCategory={filters.contract}
              />
            </div>
          </details>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-3 divide-x divide-border/70 border-t border-border/70 pt-5">
        <div className="pr-3 sm:pr-6">
          <dt className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
            Total customers
          </dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {formatInteger(kpis.total_customers)}
          </dd>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            In the {snapshot} snapshot.
          </p>
        </div>
        <div className="px-3 sm:px-6">
          <dt className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
            Retained customers
          </dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-positive">
            {formatInteger(kpis.retained_customers)}
          </dd>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Existing customers who stayed.
          </p>
        </div>
        <div className="pl-3 sm:pl-6">
          <dt className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
            Retention rate
          </dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-positive">
            {formatPercent(kpis.retention_rate_pct)}
          </dd>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Retained / existing customers.
          </p>
        </div>
      </dl>

      <details className="mt-6 border-t border-border/60 pt-4">
        <summary className="cursor-pointer text-xs font-medium text-foreground">
          Definitions and method
        </summary>
        <dl className="mt-3 grid gap-2 text-[11px] leading-snug text-muted-foreground sm:grid-cols-2">
          {PRIMARY_KPI_DEFINITIONS.map((definition) => (
            <div key={definition.id}>
              <dt className="font-medium text-foreground">
                {definition.label}
              </dt>
              <dd>{definition.definition}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Values come from the fixed {snapshot} aggregate snapshot.
          Descriptive and associational analysis only, not a forecast or a
          causal claim.
        </p>
      </details>
    </section>
  )
}
