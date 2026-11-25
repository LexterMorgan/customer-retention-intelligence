import { cn } from "@/lib/utils"

export type ReportSectionId = "executive-overview" | "drivers" | "risk-segments"

const NAV_ITEMS: readonly {
  readonly id: ReportSectionId
  readonly label: string
}[] = [
  { id: "executive-overview", label: "Overview" },
  { id: "drivers", label: "Drivers" },
  { id: "risk-segments", label: "Risk & Segments" },
]

type ReportNavProps = {
  readonly activeSection: string
  readonly onNavigate: (sectionId: string) => void
}

export function ReportNav({ activeSection, onNavigate }: ReportNavProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 border-b border-border/70 bg-background px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <nav aria-label="Report sections" className="mx-auto max-w-[1200px]">
        <ul className="flex items-stretch gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.id
            return (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-11 items-center px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none sm:px-4",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-destructive transition-opacity",
                      active ? "opacity-100" : "opacity-0"
                    )}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
