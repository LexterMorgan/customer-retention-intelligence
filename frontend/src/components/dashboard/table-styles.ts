import { cn } from "@/lib/utils"

export const dashboardTableHeadClass =
  "h-9 bg-muted/30 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"

export const dashboardTableCellClass = "px-3 py-2.5"

export function dashboardTableWrapClass(className?: string) {
  return cn("dashboard-table-wrap", className)
}
