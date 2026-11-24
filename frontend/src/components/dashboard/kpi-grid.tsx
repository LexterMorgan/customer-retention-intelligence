import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  PRIMARY_KPI_DEFINITIONS,
  type KpiDefinition,
  type KpiTone,
} from "@/lib/kpi-definitions"
import { cn } from "@/lib/utils"
import type { DashboardPayload } from "@/types/dashboard"

type KpiCardProps = {
  definition: KpiDefinition
  value: number
  payload: DashboardPayload
}

const toneStyles: Record<KpiTone, { value: string }> = {
  neutral: { value: "text-foreground" },
  positive: { value: "text-positive" },
  risk: { value: "text-destructive" },
}

function KpiCard({ definition, value, payload }: KpiCardProps) {
  const footnote = definition.footnote?.(payload)
  const tone = definition.tone ?? "neutral"
  const styles = toneStyles[tone]

  return (
    <Card
      size="sm"
      className="min-w-0 gap-0 rounded-lg border border-border/70 py-0 shadow-none"
    >
      <CardHeader className="gap-1 px-3 pt-3 pb-1.5">
        <CardDescription className="dashboard-label normal-case tracking-normal text-[11px] leading-snug">
          {definition.label}
        </CardDescription>
        <p
          className={cn(
            "dashboard-kpi-value font-heading m-0 text-balance",
            styles.value
          )}
        >
          {definition.format(value)}
        </p>
      </CardHeader>
      <CardContent className="gap-0.5 px-3 pt-0 pb-3">
        <p className="text-[11px] leading-snug text-muted-foreground text-pretty">
          {definition.definition}
        </p>
        {footnote ? (
          <p className="text-[11px] leading-snug text-muted-foreground/90">
            {footnote}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function KpiGridSkeleton() {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7"
      aria-busy="true"
      aria-label="Loading KPI cards"
    >
      {PRIMARY_KPI_DEFINITIONS.map((definition) => (
        <Card key={definition.id} size="sm" className="gap-0 py-0 shadow-none">
          <CardHeader className="gap-2 px-4 pt-3.5 pb-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-28" />
          </CardHeader>
          <CardContent className="px-4 pt-0 pb-3.5">
            <Skeleton className="h-3 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

type KpiGridProps = {
  payload: DashboardPayload
}

export function KpiGrid({ payload }: KpiGridProps) {
  return (
    <section aria-label="Primary KPIs" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="dashboard-section-title">Primary KPIs</h2>
        <p className="text-[11px] text-muted-foreground">
          Rates exclude Joined customers
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {PRIMARY_KPI_DEFINITIONS.map((definition) => (
          <KpiCard
            key={definition.id}
            definition={definition}
            value={payload.kpis[definition.id]}
            payload={payload}
          />
        ))}
      </div>

      <details className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-foreground">
          Definitions and method
        </summary>
        <dl className="mt-2 grid gap-2 text-[11px] leading-snug text-muted-foreground sm:grid-cols-2">
          {PRIMARY_KPI_DEFINITIONS.map((definition) => (
            <div key={definition.id}>
              <dt className="font-medium text-foreground">
                {definition.label}
              </dt>
              <dd>{definition.definition}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Values come from the fixed Q2 2022 aggregate payload. Rates use
          existing customers (churned plus stayed); the{" "}
          {payload.kpis.joined_customers.toLocaleString("en-US")} Joined
          customers are excluded from rate denominators.
        </p>
      </details>
    </section>
  )
}
