import { useMemo } from "react"

import { SectionCard } from "@/components/dashboard/section-card"
import {
  dashboardTableCellClass,
  dashboardTableHeadClass,
  dashboardTableWrapClass,
} from "@/components/dashboard/table-styles"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatInteger, formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  CONTRACT_ORDER,
  TENURE_ORDER,
  type ContractTenureCell,
} from "@/types/dashboard"

type ContractTenureSectionProps = {
  matrix: ContractTenureCell[]
  highlightContract?: string | null
  highlightTenure?: string | null
}

function heatClass(rate: number): string {
  if (rate >= 60) {
    return "bg-destructive/30 text-foreground"
  }
  if (rate >= 40) {
    return "bg-destructive/20 text-foreground"
  }
  if (rate >= 20) {
    return "bg-destructive/12 text-foreground"
  }
  if (rate > 0) {
    return "bg-destructive/6 text-foreground"
  }
  return "bg-muted/35 text-muted-foreground"
}

export function ContractTenureSection({
  matrix,
  highlightContract = null,
  highlightTenure = null,
}: ContractTenureSectionProps) {
  const lookup = useMemo(() => {
    const map = new Map<string, ContractTenureCell>()
    for (const cell of matrix) {
      map.set(`${cell.contract}||${cell.tenure_band}`, cell)
    }
    return map
  }, [matrix])

  return (
    <SectionCard
      id="contract-tenure-matrix"
      title="Contract × Tenure analysis"
      description="Churn-rate concentration across Contract and Tenure Band. Color encodes payload churn rate only."
      footnote="Pre-aggregated matrix values. Filters highlight matching rows/columns without recomputing rates."
      actions={<Badge variant="outline">Heatmap</Badge>}
    >
      <div className={dashboardTableWrapClass("min-w-0")}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                className={`${dashboardTableHeadClass} min-w-28 sticky left-0 z-10`}
              >
                Tenure band
              </TableHead>
              {CONTRACT_ORDER.map((contract) => (
                <TableHead
                  key={contract}
                  className={cn(
                    `${dashboardTableHeadClass} min-w-32 text-center`,
                    highlightContract === contract && "bg-sidebar-accent/50"
                  )}
                >
                  {contract}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {TENURE_ORDER.map((tenure) => (
              <TableRow
                key={tenure}
                className={cn(
                  "hover:bg-muted/30",
                  highlightTenure === tenure && "bg-muted/25"
                )}
              >
                <TableCell
                  className={cn(
                    `${dashboardTableCellClass} sticky left-0 z-10 bg-card font-medium`,
                    highlightTenure === tenure && "bg-muted/40"
                  )}
                >
                  {tenure}
                </TableCell>
                {CONTRACT_ORDER.map((contract) => {
                  const cell = lookup.get(`${contract}||${tenure}`)
                  const active =
                    (highlightContract == null ||
                      highlightContract === contract) &&
                    (highlightTenure == null || highlightTenure === tenure)
                  const dimmed =
                    (highlightContract != null || highlightTenure != null) &&
                    !active

                  if (!cell) {
                    return (
                      <TableCell
                        key={contract}
                        className={`${dashboardTableCellClass} text-center text-muted-foreground`}
                      >
                        —
                      </TableCell>
                    )
                  }

                  return (
                    <TableCell
                      key={contract}
                      className={cn("p-1.5", dimmed && "opacity-35")}
                    >
                      <div
                        className={cn(
                          "rounded-md px-2 py-1.5 text-center transition-opacity",
                          heatClass(cell.churn_rate_pct)
                        )}
                      >
                        <div className="text-sm font-semibold tabular-nums">
                          {formatPercent(cell.churn_rate_pct)}
                        </div>
                        <div className="text-[10px] tabular-nums opacity-80">
                          {formatInteger(cell.churned_customers)} /{" "}
                          {formatInteger(cell.existing_customers)}
                        </div>
                      </div>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  )
}
