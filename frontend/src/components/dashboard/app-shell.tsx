import { useEffect, useState } from "react"

import { AnalyticalViews } from "@/components/dashboard/analytical-views"
import { CopilotPanel } from "@/components/dashboard/copilot-panel"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import {
  DashboardEmptyState,
  DashboardErrorState,
} from "@/components/dashboard/dashboard-states"
import { GlobalFilters } from "@/components/dashboard/global-filters"
import { ReportNav } from "@/components/dashboard/report-nav"
import { ReportSummary } from "@/components/dashboard/report-summary"
import { DashboardFiltersProvider } from "@/hooks/use-dashboard-filters"
import { useDashboardPayload } from "@/hooks/use-dashboard-payload"

const NAV_SECTIONS = [
  "executive-overview",
  "drivers",
  "risk-segments",
] as const

function DashboardMain() {
  const { status, payload, error, reload } = useDashboardPayload()
  const [activeSection, setActiveSection] = useState("executive-overview")

  const navigateTo = (sectionId: string) => {
    setActiveSection(sectionId)
    const node = document.getElementById(sectionId)
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  // Keep the reported section in sync with what is actually on screen.
  useEffect(() => {
    if (status !== "ready") {
      return
    }
    const syncActiveSection = () => {
      const marker = window.scrollY + 140
      let current: string = NAV_SECTIONS[0]
      for (const sectionId of NAV_SECTIONS) {
        const node = document.getElementById(sectionId)
        if (
          node !== null &&
          node.getBoundingClientRect().top + window.scrollY <= marker
        ) {
          current = sectionId
        }
      }
      setActiveSection((previous) =>
        previous === current ? previous : current
      )
    }
    syncActiveSection()
    window.addEventListener("scroll", syncActiveSection, { passive: true })
    window.addEventListener("resize", syncActiveSection)
    return () => {
      window.removeEventListener("scroll", syncActiveSection)
      window.removeEventListener("resize", syncActiveSection)
    }
  }, [status])

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-10 sm:px-6 lg:px-8">
        <DashboardHeader metadata={payload?.metadata ?? null} />
        <ReportNav activeSection={activeSection} onNavigate={navigateTo} />

        <main className="pt-4 sm:pt-6">
          {status === "loading" ? (
            <div className="space-y-3" aria-busy="true">
              <div className="h-24 animate-pulse rounded bg-muted/40" />
              <div className="h-16 animate-pulse rounded bg-muted/30" />
            </div>
          ) : null}
          {status === "error" && error ? (
            <DashboardErrorState message={error} onRetry={reload} />
          ) : null}
          {status === "empty" ? <DashboardEmptyState /> : null}
          {status === "ready" && payload ? (
            <>
              <GlobalFilters dimensions={payload.filter_dimensions} />
              <div className="mt-6 sm:mt-8">
                <ReportSummary payload={payload} />
              </div>
              <div className="mt-12">
                <AnalyticalViews payload={payload} />
              </div>
              {import.meta.env.DEV ? (
                <div className="mt-12">
                  <CopilotPanel />
                </div>
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  )
}

export function AppShell() {
  return (
    <DashboardFiltersProvider>
      <DashboardMain />
    </DashboardFiltersProvider>
  )
}
