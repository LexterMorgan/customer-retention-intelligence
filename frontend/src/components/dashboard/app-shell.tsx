import { useState } from "react"

import { AnalyticalViews } from "@/components/dashboard/analytical-views"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import {
  DashboardEmptyState,
  DashboardErrorState,
} from "@/components/dashboard/dashboard-states"
import { ExecutiveInsights } from "@/components/dashboard/executive-insights"
import { GlobalFilters } from "@/components/dashboard/global-filters"
import { KpiGrid, KpiGridSkeleton } from "@/components/dashboard/kpi-grid"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { Button } from "@/components/ui/button"
import { DashboardFiltersProvider } from "@/hooks/use-dashboard-filters"
import { useDashboardPayload } from "@/hooks/use-dashboard-payload"
import { PanelLeft } from "lucide-react"

function DashboardMain() {
  const { status, payload, error, reload } = useDashboardPayload()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [activeSection, setActiveSection] = useState("executive-overview")

  const navigateTo = (sectionId: string) => {
    setActiveSection(sectionId)
    setMobileNavOpen(false)
    const node = document.getElementById(sectionId)
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <div className="hidden md:block">
        <SidebarNav
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          activeSection={activeSection}
          onNavigate={navigateTo}
        />
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/20"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative z-10 h-full shadow-lg">
            <SidebarNav
              activeSection={activeSection}
              onNavigate={navigateTo}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border/80 px-4 py-2.5 md:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <PanelLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium">Retention Intelligence</span>
        </div>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:gap-5 sm:px-6 lg:gap-6 lg:px-8 lg:py-6">
            <DashboardHeader metadata={payload?.metadata ?? null} />

            <GlobalFilters
              dimensions={payload?.filter_dimensions ?? null}
              disabled={status !== "ready" && status !== "empty"}
            />

            {status === "loading" ? <KpiGridSkeleton /> : null}
            {status === "error" && error ? (
              <DashboardErrorState message={error} onRetry={reload} />
            ) : null}
            {status === "empty" ? <DashboardEmptyState /> : null}
            {status === "ready" && payload ? (
              <>
                <div
                  id="executive-overview"
                  className="scroll-mt-6 flex flex-col gap-5"
                >
                  <KpiGrid payload={payload} />
                  <ExecutiveInsights payload={payload} />
                </div>
                <AnalyticalViews payload={payload} />
              </>
            ) : null}
          </div>
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
