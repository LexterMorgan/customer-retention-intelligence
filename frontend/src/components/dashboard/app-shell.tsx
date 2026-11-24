import { useEffect, useRef, useState } from "react"

import { AnalyticalViews } from "@/components/dashboard/analytical-views"
import { CopilotPanel } from "@/components/dashboard/copilot-panel"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import {
  DashboardEmptyState,
  DashboardErrorState,
} from "@/components/dashboard/dashboard-states"
import { GlobalFilters } from "@/components/dashboard/global-filters"
import { KpiGrid, KpiGridSkeleton } from "@/components/dashboard/kpi-grid"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { Button } from "@/components/ui/button"
import { DashboardFiltersProvider } from "@/hooks/use-dashboard-filters"
import { useDashboardPayload } from "@/hooks/use-dashboard-payload"
import { PanelLeft } from "lucide-react"

const NAV_SECTIONS = [
  "executive-overview",
  "drivers",
  "risk-segments",
] as const

function DashboardMain() {
  const { status, payload, error, reload } = useDashboardPayload()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [activeSection, setActiveSection] = useState("executive-overview")
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileDialogRef = useRef<HTMLDialogElement>(null)
  const pendingSectionFocusRef = useRef<string | null>(null)
  const mobileCloseFocusRef = useRef<"trigger" | "section" | "desktop">(
    "trigger"
  )

  const scrollToSection = (sectionId: string) => {
    const node = document.getElementById(sectionId)
    if (!node) {
      return
    }
    node.setAttribute("tabindex", "-1")
    node.focus({ preventScroll: true })
    if (sectionId === "executive-overview") {
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    node.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const navigateTo = (sectionId: string) => {
    setActiveSection(sectionId)
    const wasMobileOpen = mobileNavOpen
    if (wasMobileOpen) {
      // Close the native modal without letting its return-focus scroll the page
      // back to the trigger; focus and scroll the destination instead.
      mobileCloseFocusRef.current = "section"
      pendingSectionFocusRef.current = sectionId
      mobileDialogRef.current?.close()
    }
    requestAnimationFrame(() => scrollToSection(sectionId))
  }

  // Keep the highlighted section in sync with what is actually on screen, so
  // the sidebar never claims "Drivers" while the overview is displayed.
  useEffect(() => {
    if (status !== "ready") {
      return
    }
    const syncActiveSection = () => {
      const marker = window.scrollY + 160
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

  useEffect(() => {
    const dialog = mobileDialogRef.current
    if (dialog === null) {
      return
    }
    if (mobileNavOpen && !dialog.open) {
      dialog.showModal()
      dialog
        .querySelector<HTMLButtonElement>("nav button")
        ?.focus()
    }
    if (!mobileNavOpen && dialog.open) {
      dialog.close()
    }
    if (!mobileNavOpen) {
      return
    }
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return
      }
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ].filter(
        (element) =>
          element.getClientRects().length > 0 &&
          element.getAttribute("aria-hidden") !== "true"
      )
      if (focusable.length === 0) {
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }
      if (active === last || !dialog.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog.addEventListener("keydown", onKeyDown)
    return () => dialog.removeEventListener("keydown", onKeyDown)
  }, [mobileNavOpen])

  // A native modal dialog stays open and modal even when CSS hides it at the
  // md breakpoint. Close it when crossing to desktop and move focus to the
  // visible desktop navigation instead of the hidden mobile trigger.
  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)")
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        return
      }
      const dialog = mobileDialogRef.current
      if (dialog?.open) {
        mobileCloseFocusRef.current = "desktop"
        dialog.close()
      }
    }
    desktopQuery.addEventListener("change", closeOnDesktop)
    return () => desktopQuery.removeEventListener("change", closeOnDesktop)
  }, [])

  const handleMobileDialogClose = () => {
    setMobileNavOpen(false)
    const targetId = pendingSectionFocusRef.current
    const focusMode = mobileCloseFocusRef.current
    pendingSectionFocusRef.current = null
    mobileCloseFocusRef.current = "trigger"
    requestAnimationFrame(() => {
      if (focusMode === "section" && targetId !== null) {
        scrollToSection(targetId)
        return
      }
      if (focusMode === "desktop") {
        const desktopNav = document.querySelector<HTMLButtonElement>(
          'nav[aria-label="Dashboard"] button[aria-current="page"]'
        )
        const fallback = document.querySelector<HTMLButtonElement>(
          'nav[aria-label="Dashboard"] button'
        )
        ;(desktopNav ?? fallback)?.focus()
        return
      }
      mobileTriggerRef.current?.focus()
    })
  }

  const closeMobileNav = () => {
    mobileDialogRef.current?.close()
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <div className="hidden md:sticky md:top-0 md:block md:h-svh md:shrink-0">
        <SidebarNav
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          activeSection={activeSection}
          onNavigate={navigateTo}
        />
      </div>

      <dialog
        id="mobile-navigation-dialog"
        ref={mobileDialogRef}
        aria-label="Dashboard navigation"
        onClose={handleMobileDialogClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeMobileNav()
          }
        }}
        className="fixed inset-y-0 left-0 z-50 m-0 h-dvh max-h-none w-72 max-w-[80vw] overflow-hidden border-0 bg-transparent p-0 shadow-xl backdrop:bg-foreground/20 md:hidden"
      >
        <div className="h-full bg-sidebar shadow-lg">
          <SidebarNav activeSection={activeSection} onNavigate={navigateTo} />
        </div>
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border/80 px-4 py-2.5 md:hidden">
          <Button
            ref={mobileTriggerRef}
            variant="ghost"
            size="icon-sm"
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            aria-haspopup="dialog"
            aria-controls="mobile-navigation-dialog"
            className="size-11"
            onClick={() => {
              mobileCloseFocusRef.current = "trigger"
              setMobileNavOpen(true)
            }}
          >
            <PanelLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium">Retention Intelligence</span>
        </div>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:gap-5 lg:px-8 lg:py-5">
            <DashboardHeader metadata={payload?.metadata ?? null} />

            {status === "loading" ? <KpiGridSkeleton /> : null}
            {status === "error" && error ? (
              <DashboardErrorState message={error} onRetry={reload} />
            ) : null}
            {status === "empty" ? <DashboardEmptyState /> : null}
            {status === "ready" && payload ? (
              <>
                <div id="executive-overview" className="scroll-mt-6">
                  <KpiGrid payload={payload} />
                </div>
                <GlobalFilters
                  dimensions={payload.filter_dimensions}
                  disabled={false}
                />
                <AnalyticalViews payload={payload} />
                {import.meta.env.DEV ? <CopilotPanel /> : null}
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
