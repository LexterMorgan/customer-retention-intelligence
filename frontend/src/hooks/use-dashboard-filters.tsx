/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import {
  EMPTY_FILTERS,
  type DashboardFilters,
  type PrimaryFilterKey,
} from "@/types/dashboard"

type DashboardFiltersContextValue = {
  filters: DashboardFilters
  setFilter: (key: PrimaryFilterKey, value: string | null) => void
  clearFilters: () => void
  hasActiveFilters: boolean
}

const DashboardFiltersContext =
  createContext<DashboardFiltersContextValue | null>(null)

export function DashboardFiltersProvider({
  children,
}: {
  children: ReactNode
}) {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS)

  const setFilter = useCallback((key: PrimaryFilterKey, value: string | null) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS)
  }, [])

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((value) => value !== null),
    [filters]
  )

  const value = useMemo(
    () => ({
      filters,
      setFilter,
      clearFilters,
      hasActiveFilters,
    }),
    [filters, setFilter, clearFilters, hasActiveFilters]
  )

  return (
    <DashboardFiltersContext.Provider value={value}>
      {children}
    </DashboardFiltersContext.Provider>
  )
}

export function useDashboardFilters(): DashboardFiltersContextValue {
  const context = useContext(DashboardFiltersContext)

  if (!context) {
    throw new Error(
      "useDashboardFilters must be used within DashboardFiltersProvider"
    )
  }

  return context
}
