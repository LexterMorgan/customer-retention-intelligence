import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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

const toneStyles: Record<
  KpiTone,
  { value: string; bar: string; card: string }
> = {
  neutral: {
    value: "text-foreground",
    bar: "bg-border",
    card: "",
  },
  positive: {
    value: "text-positive",
    bar: "bg-positive/70",
    card: "ring-positive/15",
  },
  risk: {
    value: "text-destructive",
    bar: "bg-destructive/70",
    card: "ring-destructive/15",
  },
}

function KpiCard({ definition, value, payload }: KpiCardProps) {
  const footnote = definition.footnote?.(payload)
  const tone = definition.tone ?? "neutral"
  const styles = toneStyles[tone]

  return (
    <Card
      size="sm"
      className={cn(
        "relative min-w-0 gap-0 overflow-hidden py-0 shadow-none transition-colors",
        styles.card
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-0.5", styles.bar)}
        aria-hidden
      />
      <CardHeader className="gap-2 px-4 pt-3.5 pb-2">
        <CardDescription className="dashboard-label normal-case tracking-normal text-[11px] leading-snug">
          {definition.label}
        </CardDescription>
        <CardTitle
          className={cn("dashboard-kpi-value font-heading", styles.value)}
        >
          {definition.format(value)}
        </CardTitle>
      </CardHeader>
      <CardContent className="gap-1 px-4 pt-0 pb-3.5">
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
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="dashboard-section-title">Primary KPIs</h2>
        <p className="text-[11px] text-muted-foreground">
          Validated portfolio baseline
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
    </section>
  )
}
