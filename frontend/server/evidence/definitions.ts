/**
 * Canonical definition text and scope caveats for the evidence layer.
 *
 * Text here must agree with the repository's canonical definitions in
 * `docs/churn_definition.md`. It is intentionally a small curated index rather
 * than an ingestion of README or findings documents: only the four supported
 * definitions are exposed, and document-sourced text is explicitly versioned
 * separately from the payload artifact.
 */
import type { DefinitionId } from "./types.ts"

export type RepositoryDocumentSource = {
  readonly kind: "repository_document"
  readonly path: string
  readonly section: string
  readonly versioning: "separate_from_payload"
}

export type PayloadFieldSource = {
  readonly kind: "payload_field"
  readonly section: "mrvl"
  readonly field: "definition"
  readonly versioning: "payload"
}

export type DefinitionTemplate = {
  readonly id: DefinitionId
  readonly title: string
  /** Cited definition text, or null when the text must be read from the payload. */
  readonly text: string | null
  readonly source: RepositoryDocumentSource | PayloadFieldSource
  readonly caveats: readonly string[]
}

export const DEFINITIONS: Record<DefinitionId, DefinitionTemplate> = {
  churn_rate: {
    id: "churn_rate",
    title: "Churn Rate",
    text: "Churn Rate = Churned / (Churned + Stayed). Joined customers are excluded from the denominator.",
    source: {
      kind: "repository_document",
      path: "docs/churn_definition.md",
      section: "Canonical Formulas → Churn Rate",
      versioning: "separate_from_payload",
    },
    caveats: [
      "Rates describe the Q2 2022 snapshot only; they are not a time series or a forecast.",
    ],
  },
  retention_rate: {
    id: "retention_rate",
    title: "Retention Rate",
    text: "Retention Rate = Stayed / (Churned + Stayed). Equivalently, Retention Rate = 1 - Churn Rate.",
    source: {
      kind: "repository_document",
      path: "docs/churn_definition.md",
      section: "Canonical Formulas → Retention Rate",
      versioning: "separate_from_payload",
    },
    caveats: [
      "Rates describe the Q2 2022 snapshot only; they are not a time series or a forecast.",
    ],
  },
  existing_customers: {
    id: "existing_customers",
    title: "Existing Customers",
    text: "Existing customers = Churned + Stayed. Joined customers are kept in the dataset but excluded from churn and retention rate calculations.",
    source: {
      kind: "repository_document",
      path: "docs/churn_definition.md",
      section: "Customer Status Values → Definitions",
      versioning: "separate_from_payload",
    },
    caveats: [
      "Total customers is larger than existing customers because it includes Joined customers.",
    ],
  },
  mrvl: {
    id: "mrvl",
    title: "Monthly Recurring Value Lost (MRVL)",
    // Cited text is not duplicated here: it is read from payload.mrvl.definition.
    text: null,
    source: {
      kind: "payload_field",
      section: "mrvl",
      field: "definition",
      versioning: "payload",
    },
    caveats: [
      "Net of preserved negative monthly charges (credits); values are not corrected upward.",
      "A monthly value measure over churned customers, not historical revenue and not guaranteed recoverable revenue.",
    ],
  },
}

export const CAVEATS = {
  snapshot:
    "Q2 2022 historical snapshot of an analyzed customer base; this is not live customer data.",
  scope:
    "Full-snapshot portfolio scope. Dashboard filter selections are highlight-only and are not accepted or applied as aggregate scope.",
  association:
    "Descriptive/associational analysis only; not predictive and not causal. Descriptive risk tiers are rule-based, not probabilities.",
  unsupported:
    "Supported evidence is limited to overall KPIs, contract-type metrics, contract comparisons, highest-churn contract selection, and four canonical definitions. Arbitrary intersections, filtered aggregates, time trends, and customer-level data are not available.",
} as const

export function joinedDenominatorCaveat(joinedCustomers: number): string {
  return `Rate denominators use existing customers (Churned + Stayed); the ${formatCount(joinedCustomers)} Joined customers are excluded.`
}

export function totalIncludesJoinedCaveat(joinedCustomers: number): string {
  return `Total customers includes the ${formatCount(joinedCustomers)} Joined customers, which are excluded from rate denominators.`
}

export const MRVL_CAVEAT =
  "MRVL is a monthly value measure over churned customers, net of preserved negative charges. It is not historical revenue and not guaranteed recoverable revenue."

export function shareOfChurnCaveat(churnedCustomers: number): string {
  return `Share of churn uses all ${formatCount(churnedCustomers)} existing churned customers as the portfolio denominator, not a per-contract denominator.`
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US")
}
