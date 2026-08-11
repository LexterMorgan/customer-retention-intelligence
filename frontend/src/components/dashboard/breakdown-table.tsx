import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  dashboardTableCellClass,
  dashboardTableHeadClass,
  dashboardTableWrapClass,
} from "@/components/dashboard/table-styles"
import { formatCurrency, formatInteger, formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { BreakdownRow } from "@/types/dashboard"

type BreakdownTableProps = {
  rows: BreakdownRow[]
  categoryLabel?: string
  highlightCategory?: string | null
  showAvgCharge?: boolean
  avgChargeByCategory?: Record<string, number>
}

export function BreakdownTable({
  rows,
  categoryLabel = "Category",
  highlightCategory = null,
  showAvgCharge = false,
  avgChargeByCategory,
}: BreakdownTableProps) {
  return (
    <div className={dashboardTableWrapClass()}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={dashboardTableHeadClass}>
              {categoryLabel}
            </TableHead>
            <TableHead className={`${dashboardTableHeadClass} text-right`}>
              Existing
            </TableHead>
            <TableHead className={`${dashboardTableHeadClass} text-right`}>
              Churned
            </TableHead>
            <TableHead className={`${dashboardTableHeadClass} text-right`}>
              Retained
            </TableHead>
            <TableHead className={`${dashboardTableHeadClass} text-right`}>
              Churn rate
            </TableHead>
            <TableHead className={`${dashboardTableHeadClass} text-right`}>
              Share of churn
            </TableHead>
            {showAvgCharge ? (
              <TableHead className={`${dashboardTableHeadClass} text-right`}>
                Avg charge
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const highlighted =
              highlightCategory != null && row.category === highlightCategory
            return (
              <TableRow
                key={row.category}
                className={cn(
                  "hover:bg-muted/40",
                  highlighted && "bg-sidebar-accent/40"
                )}
                data-state={highlighted ? "selected" : undefined}
              >
                <TableCell
                  className={`${dashboardTableCellClass} font-medium whitespace-normal`}
                >
                  {row.category}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right tabular-nums text-muted-foreground`}
                >
                  {formatInteger(row.existing_customers)}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right font-medium tabular-nums text-destructive`}
                >
                  {formatInteger(row.churned_customers)}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right tabular-nums text-muted-foreground`}
                >
                  {formatInteger(row.retained_customers)}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right font-medium tabular-nums`}
                >
                  {formatPercent(row.churn_rate_pct)}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right tabular-nums text-muted-foreground`}
                >
                  {formatPercent(row.pct_of_total_churn)}
                </TableCell>
                {showAvgCharge ? (
                  <TableCell
                    className={`${dashboardTableCellClass} text-right tabular-nums text-muted-foreground`}
                  >
                    {avgChargeByCategory?.[row.category] != null
                      ? formatCurrency(avgChargeByCategory[row.category])
                      : "—"}
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
