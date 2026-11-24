import { buildExecutiveInsights } from "@/lib/executive-insights"
import type { DashboardPayload } from "@/types/dashboard"

const EVIDENCE_LINKS: Record<string, string> = {
  "early-tenure": "tenure-breakdown",
  "contract-structure": "contract-breakdown",
  "high-risk-intersection": "segments",
  "offer-e": "offer-breakdown",
  "competitor-reasons": "churn-reasons",
  mrvl: "mrvl-scenario",
  "tenure-contrast": "tenure-breakdown",
}

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
          <h2 className="dashboard-section-title">What stands out</h2>
          <p className="dashboard-section-subtitle">
            Descriptive associations from the charts. Not causal claims.
          </p>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {insights.map((insight) => (
          <article
            key={insight.id}
            className="rounded-lg border border-border/60 bg-card px-3.5 py-3"
          >
            <h3 className="text-[13px] leading-snug font-semibold tracking-tight text-balance">
              {insight.headline}
            </h3>
            <p className="dashboard-insight-metric mt-1.5">
              {insight.metric}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground text-pretty">
              {insight.implication}
            </p>
            {EVIDENCE_LINKS[insight.id] ? (
              <a
                href={`#${EVIDENCE_LINKS[insight.id]}`}
                className="mt-2 inline-block text-[11px] font-medium text-foreground underline underline-offset-2 hover:text-primary"
              >
                View evidence
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
