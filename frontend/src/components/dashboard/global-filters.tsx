import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDashboardFilters } from "@/hooks/use-dashboard-filters"
import { cn } from "@/lib/utils"
import type { FilterDimensions, PrimaryFilterKey } from "@/types/dashboard"
import { PRIMARY_FILTER_KEYS } from "@/types/dashboard"

const FILTER_LABELS: Record<PrimaryFilterKey, string> = {
  contract: "Contract",
  tenure_band: "Tenure Band",
  internet_type: "Internet Type",
}

const ALL_VALUE = "__all__"

const ALL_LABELS: Record<PrimaryFilterKey, string> = {
  contract: "All contract types",
  tenure_band: "All tenure bands",
  internet_type: "All internet types",
}

type GlobalFiltersProps = {
  dimensions: FilterDimensions | null
  disabled?: boolean
}

export function GlobalFilters({ dimensions, disabled = false }: GlobalFiltersProps) {
  const { filters, setFilter, clearFilters, hasActiveFilters } =
    useDashboardFilters()
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false)
  const activeCount = PRIMARY_FILTER_KEYS.filter(
    (key) => filters[key] !== null
  ).length
  const statusLabel =
    activeCount === 0
      ? "No highlights active"
      : `${activeCount} highlight${activeCount === 1 ? "" : "s"} active`

  return (
    <section
      id="highlight-charts"
      aria-label="Highlight charts"
      className="dashboard-panel scroll-mt-6 rounded-xl px-4 py-3"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="hidden text-sm font-semibold tracking-tight md:block">
            Highlight charts
          </h2>
          <button
            type="button"
            onClick={() => setMobileControlsOpen((value) => !value)}
            aria-expanded={mobileControlsOpen}
            aria-controls="highlight-controls-body"
            className="flex min-h-11 w-full items-center justify-between gap-2 text-left md:hidden"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight">
                Highlight charts
              </span>
              <span className="block text-xs text-muted-foreground">
                {statusLabel}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                mobileControlsOpen && "rotate-180"
              )}
              aria-hidden
            />
          </button>
          <p className="hidden text-xs text-muted-foreground md:block">
            Highlights matching rows below. KPI totals do not change.
          </p>
        </div>
        <Button
          variant={hasActiveFilters ? "secondary" : "ghost"}
          size="sm"
          onClick={clearFilters}
          disabled={disabled || !hasActiveFilters}
          className="h-11 shrink-0 px-3 md:h-8"
        >
          Clear highlights
        </Button>
      </div>

      <div
        id="highlight-controls-body"
        className={cn(
          "gap-3 sm:grid-cols-2 lg:grid-cols-3",
          mobileControlsOpen ? "grid" : "hidden",
          "md:grid"
        )}
      >
        {PRIMARY_FILTER_KEYS.map((key) => {
          const options = dimensions?.[key] ?? []
          const selected = filters[key]
          const selectValue = selected ?? ALL_VALUE

          return (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="dashboard-label normal-case tracking-normal">
                {FILTER_LABELS[key]}
              </span>
              <Select
                items={[
                  { value: ALL_VALUE, label: ALL_LABELS[key] },
                  ...options.map((option) => ({
                    value: option,
                    label: option,
                  })),
                ]}
                value={selectValue}
                onValueChange={(value) => {
                  if (value == null || value === ALL_VALUE) {
                    setFilter(key, null)
                    return
                  }
                  setFilter(key, value)
                }}
                disabled={disabled || options.length === 0}
              >
                <SelectTrigger className="w-full bg-background/70 data-[size=default]:h-11 md:data-[size=default]:h-9">
                  <SelectValue placeholder={ALL_LABELS[key]}>
                    {selected ?? ALL_LABELS[key]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectItem value={ALL_VALUE}>{ALL_LABELS[key]}</SelectItem>
                  {options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )
        })}
      </div>

    </section>
  )
}
