import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatInteger, formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

export type RateVolumePoint = {
  label: string
  churn_rate_pct: number
  churned_customers: number
  existing_customers?: number
  pct_of_total_churn?: number
  highlighted?: boolean
}

const rateConfig = {
  churn_rate_pct: {
    label: "Churn rate",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

const volumeConfig = {
  churned_customers: {
    label: "Churned customers",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

type RateVolumeBarChartProps = {
  data: RateVolumePoint[]
  mode?: "rate" | "volume"
  className?: string
  layout?: "horizontal" | "vertical"
  heightClassName?: string
}

function truncateLabel(value: string, max = 22) {
  if (value.length <= max) {
    return value
  }
  return `${value.slice(0, max - 1)}…`
}

export function RateVolumeBarChart({
  data,
  mode = "rate",
  className,
  layout = "horizontal",
  heightClassName,
}: RateVolumeBarChartProps) {
  const dataKey = mode === "rate" ? "churn_rate_pct" : "churned_customers"
  const config = mode === "rate" ? rateConfig : volumeConfig
  const isHorizontal = layout === "horizontal"

  const yAxisWidth = useMemo(() => {
    const longest = data.reduce(
      (max, point) => Math.max(max, point.label.length),
      0
    )
    return Math.min(168, Math.max(96, longest * 6.4))
  }, [data])

  const chartHeightPx = useMemo(() => {
    if (!isHorizontal) {
      return 240
    }
    const rows = Math.max(data.length, 3)
    return Math.min(360, 64 + rows * 34)
  }, [data.length, isHorizontal])

  return (
    <ChartContainer
      config={config}
      className={cn(
        "w-full [&_.recharts-cartesian-axis-tick_text]:text-[11px]",
        heightClassName ?? "aspect-auto",
        className
      )}
      style={heightClassName ? undefined : { height: chartHeightPx }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout={isHorizontal ? "vertical" : "horizontal"}
        margin={{
          left: 4,
          right: 8,
          top: 4,
          bottom: isHorizontal ? 4 : data.length > 5 ? 8 : 4,
        }}
        barCategoryGap="18%"
      >
        <CartesianGrid
          horizontal={!isHorizontal}
          vertical={false}
          strokeDasharray="3 3"
          className="stroke-border/60"
        />
        {isHorizontal ? (
          <>
            <YAxis
              dataKey="label"
              type="category"
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              tickMargin={6}
              tickFormatter={(value: string) => truncateLabel(value)}
            />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tickFormatter={(value: number) =>
                mode === "rate" ? formatPercent(value) : formatInteger(value)
              }
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              angle={data.length > 4 ? -20 : 0}
              textAnchor={data.length > 4 ? "end" : "middle"}
              height={data.length > 4 ? 56 : 28}
              tickFormatter={(value: string) => truncateLabel(value, 14)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tickMargin={6}
              tickFormatter={(value: number) =>
                mode === "rate" ? formatPercent(value) : formatInteger(value)
              }
            />
          </>
        )}
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.35 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const point = payload?.[0]?.payload as RateVolumePoint | undefined
                return point?.label ?? ""
              }}
              formatter={(value, _name, item) => {
                const point = item.payload as RateVolumePoint
                const formatted =
                  mode === "rate"
                    ? formatPercent(Number(value))
                    : formatInteger(Number(value))
                return (
                  <div className="flex w-full flex-col gap-1">
                    <div className="flex items-center justify-between gap-6">
                      <span className="text-muted-foreground">
                        {mode === "rate" ? "Churn rate" : "Churned"}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatted}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <span className="text-muted-foreground">Churned</span>
                      <span className="tabular-nums">
                        {formatInteger(point.churned_customers)}
                      </span>
                    </div>
                    {point.existing_customers != null ? (
                      <div className="flex items-center justify-between gap-6">
                        <span className="text-muted-foreground">Existing</span>
                        <span className="tabular-nums">
                          {formatInteger(point.existing_customers)}
                        </span>
                      </div>
                    ) : null}
                    {point.pct_of_total_churn != null ? (
                      <div className="flex items-center justify-between gap-6">
                        <span className="text-muted-foreground">
                          Share of churn
                        </span>
                        <span className="tabular-nums">
                          {formatPercent(point.pct_of_total_churn)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                )
              }}
            />
          }
        />
        <Bar
          dataKey={dataKey}
          radius={[3, 3, 3, 3]}
          fill={`var(--color-${dataKey})`}
          maxBarSize={28}
        >
          {data.map((point) => (
            <Cell
              key={point.label}
              fill={
                point.highlighted
                  ? "var(--chart-1)"
                  : `var(--color-${dataKey})`
              }
              fillOpacity={point.highlighted === false ? 0.28 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
