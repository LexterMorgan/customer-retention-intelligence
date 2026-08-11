import type { DashboardPayload } from "@/types/dashboard"

export const DASHBOARD_PAYLOAD_URL = "/data/dashboard_payload.json"

export class DashboardPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DashboardPayloadError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasNumberKeys(
  record: Record<string, unknown>,
  keys: string[]
): boolean {
  return keys.every((key) => typeof record[key] === "number")
}

/**
 * Structural check only — does not recompute or redefine metrics.
 */
export function parseDashboardPayload(data: unknown): DashboardPayload {
  if (!isRecord(data)) {
    throw new DashboardPayloadError("Dashboard payload must be a JSON object.")
  }

  if (!isRecord(data.kpis)) {
    throw new DashboardPayloadError("Dashboard payload is missing kpis.")
  }

  if (!isRecord(data.metadata)) {
    throw new DashboardPayloadError("Dashboard payload is missing metadata.")
  }

  if (!isRecord(data.filter_dimensions)) {
    throw new DashboardPayloadError(
      "Dashboard payload is missing filter_dimensions."
    )
  }

  if (!isRecord(data.mrvl)) {
    throw new DashboardPayloadError("Dashboard payload is missing mrvl.")
  }

  const requiredKpiKeys = [
    "total_customers",
    "existing_customers",
    "churned_customers",
    "retained_customers",
    "churn_rate_pct",
    "retention_rate_pct",
    "mrvl",
    "joined_customers",
  ]

  if (!hasNumberKeys(data.kpis, requiredKpiKeys)) {
    throw new DashboardPayloadError(
      "Dashboard payload kpis are incomplete or malformed."
    )
  }

  const requiredSections = [
    "by_contract",
    "by_tenure",
    "by_internet",
    "by_offer",
    "by_billing",
    "by_demographics",
    "churn_reasons",
    "risk_tiers",
    "segments",
    "contract_tenure_matrix",
    "scenario",
  ]

  for (const key of requiredSections) {
    if (!(key in data)) {
      throw new DashboardPayloadError(
        `Dashboard payload is missing section: ${key}.`
      )
    }
  }

  const primaryFilterKeys = ["contract", "tenure_band", "internet_type"]
  for (const key of primaryFilterKeys) {
    if (!Array.isArray(data.filter_dimensions[key])) {
      throw new DashboardPayloadError(
        `filter_dimensions.${key} must be an array.`
      )
    }
  }

  return data as DashboardPayload
}

export async function loadDashboardPayload(
  url: string = DASHBOARD_PAYLOAD_URL
): Promise<DashboardPayload> {
  let response: Response

  try {
    response = await fetch(url)
  } catch {
    throw new DashboardPayloadError(
      "Unable to reach the dashboard payload. Check that the data artifact is available."
    )
  }

  if (!response.ok) {
    throw new DashboardPayloadError(
      `Failed to load dashboard payload (${response.status} ${response.statusText}).`
    )
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new DashboardPayloadError(
      "Dashboard payload is not valid JSON."
    )
  }

  return parseDashboardPayload(json)
}

export function isKpiLayerEmpty(payload: DashboardPayload): boolean {
  const { kpis } = payload
  return (
    kpis.total_customers === 0 &&
    kpis.existing_customers === 0 &&
    kpis.churned_customers === 0 &&
    kpis.retained_customers === 0
  )
}
