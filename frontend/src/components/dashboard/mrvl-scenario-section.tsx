import { SectionCard } from "@/components/dashboard/section-card"
import {
  dashboardTableCellClass,
  dashboardTableHeadClass,
  dashboardTableWrapClass,
} from "@/components/dashboard/table-styles"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatInteger, formatPercent } from "@/lib/format"
import type { DashboardPayload } from "@/types/dashboard"

type MrvlScenarioSectionProps = {
  mrvl: DashboardPayload["mrvl"]
  scenario: DashboardPayload["scenario"]
}

export function MrvlScenarioSection({
  mrvl,
  scenario,
}: MrvlScenarioSectionProps) {
  return (
    <SectionCard
      id="mrvl-scenario"
      title="MRVL & illustrative retention scenario"
      description="Monthly recurring value lost and the static hypothetical retention scenario."
      actions={
        <Badge variant="outline">
          {scenario.illustrative_only ? "Illustrative what-if" : "Scenario"}
        </Badge>
      }
      footnote="Illustrative scenario only — not a forecast or causal estimate."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Card size="sm" className="gap-0 py-0 shadow-none ring-border/60">
          <CardHeader className="gap-1.5 px-4 pt-3.5 pb-2">
            <CardDescription className="dashboard-label normal-case tracking-normal">
              Monthly Recurring Value Lost
            </CardDescription>
            <CardTitle className="dashboard-kpi-value text-destructive">
              {formatCurrency(mrvl.mrvl)}
            </CardTitle>
          </CardHeader>
          <CardContent className="gap-1 px-4 pt-0 pb-3.5 text-[11px] leading-relaxed text-muted-foreground">
            <p>{mrvl.definition}</p>
            <p>
              Churned: {formatInteger(mrvl.churned_customers)} · Avg charge:{" "}
              {formatCurrency(mrvl.avg_monthly_charge_churned)}
            </p>
          </CardContent>
        </Card>

        <Card
          size="sm"
          className="gap-0 py-0 shadow-none ring-destructive/20"
        >
          <CardHeader className="gap-1.5 px-4 pt-3.5 pb-2">
            <CardDescription className="dashboard-label normal-case tracking-normal">
              Scenario
            </CardDescription>
            <CardTitle className="text-[0.95rem] leading-snug font-semibold text-balance">
              {scenario.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="gap-1 px-4 pt-0 pb-3.5 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              Segment: {scenario.segment}. Assumption: retain{" "}
              {formatPercent(scenario.retention_assumption_pct)} of churned in
              segment.
            </p>
            <p className="font-medium text-destructive">
              Illustrative only — not a forecast.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className={dashboardTableWrapClass()}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={dashboardTableHeadClass}>
                Scenario output
              </TableHead>
              <TableHead className={`${dashboardTableHeadClass} text-right`}>
                Validated value
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="hover:bg-muted/40">
              <TableCell className={dashboardTableCellClass}>
                Observed churned in segment
              </TableCell>
              <TableCell
                className={`${dashboardTableCellClass} text-right font-medium tabular-nums`}
              >
                {formatInteger(scenario.churned_in_segment)}
              </TableCell>
            </TableRow>
            <TableRow className="hover:bg-muted/40">
              <TableCell className={dashboardTableCellClass}>
                Potentially retained (illustrative)
              </TableCell>
              <TableCell
                className={`${dashboardTableCellClass} text-right font-medium tabular-nums text-positive`}
              >
                {formatInteger(scenario.scenario_retained_customers)}
              </TableCell>
            </TableRow>
            <TableRow className="hover:bg-muted/40">
              <TableCell className={dashboardTableCellClass}>
                Segment monthly value lost (observed)
              </TableCell>
              <TableCell
                className={`${dashboardTableCellClass} text-right tabular-nums`}
              >
                {formatCurrency(scenario.segment_monthly_lost)}
              </TableCell>
            </TableRow>
            <TableRow className="hover:bg-muted/40">
              <TableCell className={dashboardTableCellClass}>
                Monthly value potentially preserved
              </TableCell>
              <TableCell
                className={`${dashboardTableCellClass} text-right font-medium tabular-nums text-positive`}
              >
                {formatCurrency(scenario.scenario_monthly_preserved)}
              </TableCell>
            </TableRow>
            <TableRow className="hover:bg-muted/40">
              <TableCell className={dashboardTableCellClass}>
                Annualized value potentially preserved
              </TableCell>
              <TableCell
                className={`${dashboardTableCellClass} text-right font-medium tabular-nums text-positive`}
              >
                {formatCurrency(scenario.scenario_annual_preserved)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  )
}
