import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDashboardFilters } from "@/hooks/use-dashboard-filters"
import type { FilterDimensions, PrimaryFilterKey } from "@/types/dashboard"
import { PRIMARY_FILTER_KEYS } from "@/types/dashboard"

const FILTER_LABELS: Record<PrimaryFilterKey, string> = {
  contract: "Contract",
  tenure_band: "Tenure Band",
  internet_type: "Internet Type",
}

const ALL_VALUE = "__all__"

type GlobalFiltersProps = {
  dimensions: FilterDimensions | null
  disabled?: boolean
}

export function GlobalFilters({ dimensions, disabled = false }: GlobalFiltersProps) {
  const { filters, setFilter, clearFilters, hasActiveFilters } =
    useDashboardFilters()

  return (
    <section
      aria-label="Global filters"
      className="dashboard-panel rounded-xl px-4 py-3.5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-sm font-semibold tracking-tight">Filters</h2>
          <p className="text-xs text-muted-foreground">
            Context for highlighting views. KPI cards stay on the portfolio
            baseline.
          </p>
        </div>
        <Button
          variant={hasActiveFilters ? "secondary" : "ghost"}
          size="sm"
          onClick={clearFilters}
          disabled={disabled || !hasActiveFilters}
          className="shrink-0"
        >
          Clear filters
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                <SelectTrigger className="h-9 w-full bg-background/70">
                  <SelectValue placeholder={`All ${FILTER_LABELS[key]}`} />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectItem value={ALL_VALUE}>All</SelectItem>
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

      {hasActiveFilters ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-3">
          <span className="text-[11px] text-muted-foreground">Active:</span>
          {PRIMARY_FILTER_KEYS.map((key) => {
            const value = filters[key]
            if (!value) {
              return null
            }
            return (
              <Badge key={key} variant="secondary" className="font-normal">
                {FILTER_LABELS[key]}: {value}
              </Badge>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
