import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts"

import { SectionCard } from "@/components/dashboard/section-card"
import {
  dashboardTableCellClass,
  dashboardTableHeadClass,
  dashboardTableWrapClass,
} from "@/components/dashboard/table-styles"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatInteger, formatPercent } from "@/lib/format"
import type { ChurnReasonCategory, ChurnReasonRow } from "@/types/dashboard"

type ChurnReasonsSectionProps = {
  totalChurned: number
  categories: ChurnReasonCategory[]
  topReasons: ChurnReasonRow[]
}

const categoryConfig = {
  churner_count: {
    label: "Churned customers",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

const paretoConfig = {
  churner_count: {
    label: "Churned customers",
    color: "var(--chart-1)",
  },
  cumulative_pct_of_churners: {
    label: "Cumulative % of churners",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig

export function ChurnReasonsSection({
  totalChurned,
  categories,
  topReasons,
}: ChurnReasonsSectionProps) {
  const categoryData = useMemo(
    () =>
      categories.map((row) => ({
        label: row.category,
        churner_count: row.churner_count,
        pct_of_churners: row.pct_of_churners,
      })),
    [categories]
  )

  const paretoData = useMemo(
    () =>
      topReasons.map((row) => ({
        label: row.reason,
        churner_count: row.churner_count,
        pct_of_churners: row.pct_of_churners,
        cumulative_pct_of_churners: row.cumulative_pct_of_churners,
        rank: row.rank,
      })),
    [topReasons]
  )

  return (
    <SectionCard
      id="churn-reasons"
      title="Churn reasons / Pareto"
      description="Self-reported exit themes among churned customers."
      footnote={`Denominator: ${formatInteger(totalChurned)} churned. Stated exit reasons are not verified causes.`}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Churn category
          </h3>
          <ChartContainer
            config={categoryConfig}
            className="aspect-auto h-[240px] w-full [&_.recharts-cartesian-axis-tick_text]:text-[11px]"
          >
            <BarChart
              accessibilityLayer
              data={categoryData}
              layout="vertical"
              margin={{ left: 4, right: 8, top: 4, bottom: 4 }}
              barCategoryGap="18%"
            >
              <CartesianGrid
                horizontal={false}
                vertical={false}
                strokeDasharray="3 3"
              />
              <YAxis
                dataKey="label"
                type="category"
                width={108}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
              />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                content={
                  <ChartTooltipContent
                    formatter={(value, _name, item) => (
                      <div className="flex w-full flex-col gap-1">
                        <div className="flex justify-between gap-6">
                          <span className="text-muted-foreground">Count</span>
                          <span className="font-medium tabular-nums">
                            {formatInteger(Number(value))}
                          </span>
                        </div>
                        <div className="flex justify-between gap-6">
                          <span className="text-muted-foreground">
                            % of churners
                          </span>
                          <span className="tabular-nums">
                            {formatPercent(
                              Number(
                                (item.payload as { pct_of_churners: number })
                                  .pct_of_churners
                              )
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  />
                }
              />
              <Bar
                dataKey="churner_count"
                fill="var(--color-churner_count)"
                radius={3}
                maxBarSize={28}
              />
            </BarChart>
          </ChartContainer>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Top reasons (Pareto)
          </h3>
          <ChartContainer
            config={paretoConfig}
            className="aspect-auto h-[240px] w-full [&_.recharts-cartesian-axis-tick_text]:text-[11px]"
          >
            <ComposedChart
              accessibilityLayer
              data={paretoData}
              margin={{ left: 4, right: 8, top: 4, bottom: 8 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={54}
                tickFormatter={(value: string) =>
                  value.length > 16 ? `${value.slice(0, 15)}…` : value
                }
              />
              <YAxis
                yAxisId="count"
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(value: number) => formatInteger(value)}
              />
              <YAxis
                yAxisId="cumulative"
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={48}
                domain={[0, 100]}
                tickFormatter={(value: number) => formatPercent(value)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <div className="flex w-full justify-between gap-6">
                        <span className="text-muted-foreground">
                          {String(name)}
                        </span>
                        <span className="font-medium tabular-nums">
                          {String(name).includes("cumulative") ||
                          String(name).includes("%")
                            ? formatPercent(Number(value))
                            : formatInteger(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                yAxisId="count"
                dataKey="churner_count"
                fill="var(--color-churner_count)"
                radius={3}
                maxBarSize={28}
                name="Churned customers"
              />
              <Line
                yAxisId="cumulative"
                type="monotone"
                dataKey="cumulative_pct_of_churners"
                stroke="var(--color-cumulative_pct_of_churners)"
                strokeWidth={2}
                dot={{ r: 2.5 }}
                name="Cumulative % of churners"
              />
            </ComposedChart>
          </ChartContainer>
        </div>
      </div>

      <div className={dashboardTableWrapClass()}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={dashboardTableHeadClass}>Rank</TableHead>
              <TableHead className={dashboardTableHeadClass}>Reason</TableHead>
              <TableHead className={`${dashboardTableHeadClass} text-right`}>
                Churned
              </TableHead>
              <TableHead className={`${dashboardTableHeadClass} text-right`}>
                % of churners
              </TableHead>
              <TableHead className={`${dashboardTableHeadClass} text-right`}>
                Cumulative %
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topReasons.map((row) => (
              <TableRow key={row.rank} className="hover:bg-muted/40">
                <TableCell
                  className={`${dashboardTableCellClass} tabular-nums text-muted-foreground`}
                >
                  {row.rank}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} font-medium whitespace-normal`}
                >
                  {row.reason}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right font-medium tabular-nums text-destructive`}
                >
                  {formatInteger(row.churner_count)}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right tabular-nums`}
                >
                  {formatPercent(row.pct_of_churners)}
                </TableCell>
                <TableCell
                  className={`${dashboardTableCellClass} text-right tabular-nums text-muted-foreground`}
                >
                  {formatPercent(row.cumulative_pct_of_churners)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  )
}
