import { buildExecutiveInsights } from "@/lib/executive-insights"
import type { DashboardPayload } from "@/types/dashboard"

type ExecutiveInsightsProps = {
  payload: DashboardPayload
}

export function ExecutiveInsights({ payload }: ExecutiveInsightsProps) {
  const insights = buildExecutiveInsights(payload)

  if (insights.length === 0) {
    return null
  }

  return (
    <section
      id="executive-insights"
      aria-label="Executive insights"
      className="scroll-mt-6 space-y-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h2 className="dashboard-section-title">Executive Insights</h2>
          <p className="dashboard-section-subtitle">
            Payload-backed findings for rapid executive scan. Descriptive and
            associational only.
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          KPI → insight → evidence
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {insights.map((insight) => (
          <article
            key={insight.id}
            className="group relative overflow-hidden rounded-xl border border-border/80 bg-card px-3.5 py-3 shadow-none ring-0 transition-colors hover:border-border"
          >
            <span
              className="absolute inset-y-0 left-0 w-0.5 bg-destructive/80"
              aria-hidden
            />
            <div className="space-y-1.5 pl-1">
              <h3 className="text-[13px] leading-snug font-semibold tracking-tight text-balance">
                {insight.headline}
              </h3>
              <p className="dashboard-insight-metric">{insight.metric}</p>
              <p className="text-[11px] leading-snug text-muted-foreground text-pretty">
                {insight.implication}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
