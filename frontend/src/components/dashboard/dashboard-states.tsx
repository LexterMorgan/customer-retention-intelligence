import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type DashboardErrorStateProps = {
  message: string
  onRetry: () => void
}

export function DashboardErrorState({
  message,
  onRetry,
}: DashboardErrorStateProps) {
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Unable to load dashboard data</CardTitle>
        <CardDescription>
          The KPI layer depends on{" "}
          <code className="text-xs">data/processed/dashboard_payload.json</code>
          . No analytics are recomputed in the browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        <p className="text-sm text-destructive">{message}</p>
        <Button onClick={onRetry} variant="outline">
          Retry
        </Button>
      </CardContent>
    </Card>
  )
}

export function DashboardEmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No KPI values available</CardTitle>
        <CardDescription>
          The payload loaded successfully, but the primary KPI fields are empty.
          Regenerate the dashboard payload from the analysis pipeline.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
