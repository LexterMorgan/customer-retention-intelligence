/**
 * Deterministic evidence contract for the retention copilot (Milestone 1).
 *
 * This module describes typed, runtime-validated evidence derived only from the
 * fixed aggregate dashboard payload. It performs no model calls, no UI work, no
 * network access, and no analytics. Every numeric fact binds its source value,
 * unit, scope, denominator definition, and a semantic source locator.
 *
 * The payload field shapes are reused from the existing dashboard types so the
 * evidence layer cannot silently drift into a second definition of the payload.
 */
import type { DashboardPayload } from "../../src/types/dashboard.ts"

/** Fixed repository-relative source of the aggregate artifact. */
export const DEFAULT_ARTIFACT_SOURCE = "data/processed/dashboard_payload.json"

/** Contract categories that the existing payload contract supports. */
export const SUPPORTED_CONTRACTS = [
  "Month-to-Month",
  "One Year",
  "Two Year",
] as const

export type SupportedContract = (typeof SUPPORTED_CONTRACTS)[number]

/** Overall KPI fields already present in `payload.kpis`. */
export const KPI_METRIC_IDS = [
  "total_customers",
  "existing_customers",
  "churned_customers",
  "retained_customers",
  "joined_customers",
  "churn_rate_pct",
  "retention_rate_pct",
  "mrvl",
] as const

export type KpiMetricId = (typeof KPI_METRIC_IDS)[number]

/** Per-contract metric fields already present in `payload.by_contract`. */
export const CONTRACT_METRIC_IDS = [
  "existing_customers",
  "churned_customers",
  "retained_customers",
  "churn_rate_pct",
  "pct_of_total_churn",
] as const

export type ContractMetricId = (typeof CONTRACT_METRIC_IDS)[number]

/** Canonical definitions this milestone is allowed to return. */
export const DEFINITION_IDS = [
  "churn_rate",
  "retention_rate",
  "existing_customers",
  "mrvl",
] as const

export type DefinitionId = (typeof DEFINITION_IDS)[number]

/** The complete supported request surface. No arbitrary sections or paths. */
export type EvidenceRequest =
  | { readonly operation: "get_kpi"; readonly metric: KpiMetricId }
  | {
      readonly operation: "get_contract_metrics"
      readonly contract: SupportedContract
    }
  | {
      readonly operation: "compare_contracts"
      readonly contracts: readonly [SupportedContract, SupportedContract]
    }
  | { readonly operation: "highest_churn_contract" }
  | { readonly operation: "get_definition"; readonly definition: DefinitionId }

export type PopulationId =
  | "all_customers"
  | "existing_customers"
  | "churned_customers"
  | "retained_customers"
  | "joined_customers"
  | "all_churn"

export type FactUnit =
  | { readonly kind: "count" }
  | { readonly kind: "percentage" }
  | {
      readonly kind: "currency"
      readonly currency: "USD"
      readonly period: "month"
    }

export type FactScope =
  | { readonly kind: "overall" }
  | { readonly kind: "contract"; readonly contract: SupportedContract }

export type FactPopulation = {
  readonly id: PopulationId
  readonly definition: string
}

/**
 * Semantic source locator. Array positions are deliberately absent so that
 * reordering payload rows cannot change evidence identity.
 */
export type FactLocator =
  | { readonly section: "kpis"; readonly field: KpiMetricId }
  | {
      readonly section: "by_contract"
      readonly key: { readonly category: SupportedContract }
      readonly field: ContractMetricId
    }

export type Citation = {
  /** Deterministic semantic citation id, e.g. `payload:by_contract[...]`. */
  readonly id: string
  /** SHA-256 of the exact payload bytes this value was read from. */
  readonly artifactSha256: string
}

export type EvidenceFact = {
  readonly id: string
  readonly citation: Citation
  readonly metric: {
    readonly id: KpiMetricId | ContractMetricId
    readonly label: string
  }
  /** Exact source value, never recomputed, re-derived, or rounded by this layer. */
  readonly value: number
  readonly unit: FactUnit
  readonly scope: FactScope
  readonly population: FactPopulation
  readonly locator: FactLocator
}

export type DefinitionSource =
  | {
      readonly kind: "repository_document"
      readonly path: string
      readonly section: string
      /** Definition text is maintained separately from the payload artifact. */
      readonly versioning: "separate_from_payload"
    }
  | {
      readonly kind: "payload_field"
      readonly section: string
      readonly field: string
      readonly versioning: "payload"
      readonly artifactSha256: string
    }

export type DefinitionEvidence = {
  readonly id: DefinitionId
  readonly title: string
  readonly text: string
  readonly source: DefinitionSource
  readonly caveats: readonly string[]
}

export type HighestChurnSelection = {
  readonly metric: "churn_rate_pct"
  /** Contracts sharing the highest churn rate, in canonical contract order. */
  readonly contracts: readonly SupportedContract[]
  /** True when more than one contract shares the highest churn rate. */
  readonly tie: boolean
}

export type EvidenceEnvelope = {
  /** Snapshot label taken from `payload.metadata.snapshot`. */
  readonly snapshot: string
  readonly scope: {
    readonly kind: "full_snapshot"
    readonly description: string
  }
  readonly artifact: {
    readonly source: string
    readonly sha256: string
  }
  /** Normalized request that produced this envelope. */
  readonly request: EvidenceRequest
  readonly facts: readonly EvidenceFact[]
  readonly definitions: readonly DefinitionEvidence[]
  readonly caveats: readonly string[]
  readonly selection?: HighestChurnSelection
}

/**
 * Availability of the payload-cited MRVL definition text. The evidence layer
 * reads this field from the artifact; it never substitutes its own copy.
 */
export type MrvlDefinitionState =
  | { readonly kind: "present"; readonly text: string }
  | { readonly kind: "missing" }
  | { readonly kind: "malformed" }

export type EvidenceErrorKind = "request" | "evidence"

export type EvidenceErrorCode =
  | "invalid_request"
  | "unsupported_operation"
  | "unsupported_metric"
  | "unsupported_contract"
  | "unsupported_definition"
  | "identical_contracts"
  | "unavailable_evidence"
  | "invalid_evidence"

export type EvidenceError = {
  readonly kind: EvidenceErrorKind
  readonly code: EvidenceErrorCode
  readonly message: string
  readonly details?: Readonly<Record<string, unknown>>
}

export type EvidenceResult =
  | { readonly ok: true; readonly envelope: EvidenceEnvelope }
  | { readonly ok: false; readonly error: EvidenceError }

/**
 * Normalized, runtime-validated view of the aggregate payload. Field shapes are
 * picked from the existing dashboard types rather than re-declared.
 */
export type EvidencePayload = {
  readonly metadata: Pick<DashboardPayload["metadata"], "snapshot">
  readonly kpis: Pick<DashboardPayload["kpis"], KpiMetricId>
  readonly byContract: readonly EvidenceContractRow[]
  readonly mrvlDefinition: MrvlDefinitionState
}

export type EvidenceContractRow = {
  readonly category: SupportedContract
} & Pick<DashboardPayload["by_contract"][number], ContractMetricId>
