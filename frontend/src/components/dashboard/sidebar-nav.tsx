import {
  BarChart3,
  LayoutDashboard,
  PanelLeft,
  ShieldAlert,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  {
    id: "executive-overview",
    label: "Executive Overview",
    description: "KPIs, insights & evidence",
    icon: LayoutDashboard,
  },
  {
    id: "drivers",
    label: "Drivers",
    description: "Offer, billing, reasons",
    icon: BarChart3,
  },
  {
    id: "risk-segments",
    label: "Risk & Segments",
    description: "Tiers, segments, scenario",
    icon: ShieldAlert,
  },
] as const

type SidebarNavProps = {
  className?: string
  collapsed?: boolean
  onToggle?: () => void
  activeSection?: string
  onNavigate?: (sectionId: string) => void
}

export function SidebarNav({
  className,
  collapsed = false,
  onToggle,
  activeSection = "executive-overview",
  onNavigate,
}: SidebarNavProps) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        collapsed ? "w-[4.25rem]" : "w-60",
        className
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2.5 border-b border-sidebar-border px-3",
          collapsed && "justify-center px-2"
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <LayoutDashboard className="size-3.5" />
        </div>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold tracking-tight">
              Retention Intelligence
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              Executive dashboard
            </p>
          </div>
        ) : null}
        {onToggle ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              collapsed && "hidden md:inline-flex"
            )}
          >
            <PanelLeft className="size-4" />
          </Button>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2.5" aria-label="Dashboard">
        {NAV_ITEMS.map((item) => {
          const active = activeSection === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate?.(item.id)}
              className={cn(
                "group relative flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                collapsed && "items-center justify-center px-2"
              )}
              title={item.label}
            >
              <span
                className={cn(
                  "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary transition-opacity",
                  active ? "opacity-100" : "opacity-0"
                )}
                aria-hidden
              />
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  active ? "text-sidebar-primary" : "text-muted-foreground"
                )}
              />
              {collapsed ? null : (
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium leading-tight">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {item.description}
                  </span>
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {!collapsed ? (
        <div className="border-t border-sidebar-border px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Validated payload · Q2 2022
        </div>
      ) : null}
    </aside>
  )
}
