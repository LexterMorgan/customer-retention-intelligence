/**
 * Pure presentation helpers for retention copilot results.
 *
 * Every function here only formats or describes evidence supplied by
 * `copilot-contract.ts`. Values are never recomputed, re-derived, or redefined;
 * the only number formatting applied is deterministic Intl display formatting.
 */
import type {
  CopilotDefinitionSource,
  CopilotEvidence,
  CopilotFact,
  CopilotRequest,
  CopilotResult,
  CopilotUnit,
} from "./copilot-contract.ts"

const countFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const SHORT_HASH_LENGTH = 12

const MAX_SANITIZED_MESSAGE_LENGTH = 400

const METRIC_LABELS: Readonly<Record<string, string>> = {
  total_customers: "Total Customers",
  existing_customers: "Existing Customers",
  churned_customers: "Churned Customers",
  retained_customers: "Retained Customers",
  joined_customers: "Joined Customers",
  churn_rate_pct: "Churn Rate",
  retention_rate_pct: "Retention Rate",
  mrvl: "MRVL",
  pct_of_total_churn: "Share of Total Churn",
}

const DEFINITION_LABELS: Readonly<Record<string, string>> = {
  churn_rate: "Churn Rate",
  retention_rate: "Retention Rate",
  existing_customers: "Existing Customers",
  mrvl: "Monthly Recurring Value Lost (MRVL)",
}

/** Canonical display value for one evidence fact; never derived from other facts. */
export function formatFactValue(fact: CopilotFact): string {
  const unit = fact.unit
  switch (unit.kind) {
    case "count":
      return countFormatter.format(fact.value)
    case "percentage":
      // Evidence values are already percentage points on the 0-100 scale.
      return `${percentFormatter.format(fact.value)}%`
    case "currency": {
      const amount = currencyFormatter.format(fact.value)
      return unit.period === "month" ? `${amount} per month` : amount
    }
  }
}

/** Short human label for the unit column next to the formatted value. */
export function describeUnit(unit: CopilotUnit): string {
  switch (unit.kind) {
    case "count":
      return "count"
    case "percentage":
      return "percentage points"
    case "currency":
      return unit.period === "month" ? "USD per month" : "USD"
  }
}

/** Readable contract/overall label for one fact scope. */
export function describeFactScope(fact: CopilotFact): string {
  return fact.scope.kind === "contract" ? fact.scope.contract : "Overall"
}

function humanizeIdentifier(value: string): string {
  const words = value.split(/[_\s]+/).filter((word) => word.length > 0)
  if (words.length === 0) {
    return value
  }
  return words
    .map((word, index) => {
      if (index === 0) {
        return `${word.charAt(0).toUpperCase()}${word.slice(1)}`
      }
      return word
    })
    .join(" ")
}

function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? humanizeIdentifier(metric)
}

function definitionLabel(definition: string): string {
  return DEFINITION_LABELS[definition] ?? humanizeIdentifier(definition)
}

/** Readable interpretation of the validated model request. */
export function describeOperation(request: CopilotRequest): string {
  switch (request.operation) {
    case "get_kpi":
      return `Overall KPI: ${metricLabel(request.metric)}`
    case "get_contract_metrics":
      return `Contract metrics: ${request.contract}`
    case "compare_contracts":
      return `Contract comparison: ${request.contracts[0]} vs ${request.contracts[1]}`
    case "highest_churn_contract":
      return "Highest churn-rate contract"
    case "get_definition":
      return `Definition: ${definitionLabel(request.definition)}`
  }
}

/** Readable full-snapshot scope statement carried by the evidence. */
export function describeScope(scope: CopilotEvidence["scope"]): string {
  return scope.description
}

function describeDefinitionSource(source: CopilotDefinitionSource): string {
  if (source.kind === "repository_document") {
    return `Repository document ${source.path} · ${source.section} (versioned separately from the payload)`
  }
  return `Dashboard payload field ${source.section}.${source.field} · artifact sha256 ${source.artifactSha256}`
}

export type CopilotFactRow = {
  readonly kind: "fact"
  readonly id: string
  readonly metric: string
  readonly scope: string
  readonly value: string
  readonly unit: string
  readonly citationId: string
}

export type CopilotDefinitionRow = {
  readonly kind: "definition"
  readonly id: string
  readonly title: string
  readonly text: string
  readonly source: string
}

export type CopilotEvidenceRows = {
  readonly facts: readonly CopilotFactRow[]
  readonly definitions: readonly CopilotDefinitionRow[]
}

/**
 * Group evidence into render-ready rows. Facts keep their original value,
 * scope, unit, and citation association; definitions keep their source wording
 * so repository documents and payload fields stay distinguishable.
 */
export function evidenceRows(evidence: CopilotEvidence): CopilotEvidenceRows {
  return {
    facts: evidence.facts.map((fact) => ({
      kind: "fact",
      id: fact.id,
      metric: fact.metric.label,
      scope: describeFactScope(fact),
      value: formatFactValue(fact),
      unit: describeUnit(fact.unit),
      citationId: fact.citation.id,
    })),
    definitions: evidence.definitions.map((definition) => ({
      kind: "definition",
      id: definition.id,
      title: definition.title,
      text: definition.text,
      source: describeDefinitionSource(definition.source),
    })),
  }
}

/** First characters of an artifact digest for compact display. */
export function artifactHashShort(sha256: string): string {
  return sha256.slice(0, SHORT_HASH_LENGTH)
}

/** Complete artifact digest for the expandable provenance detail. */
export function artifactHashFull(sha256: string): string {
  return sha256
}

export function isAnswered(
  result: CopilotResult | null | undefined
): result is Extract<CopilotResult, { kind: "answered" }> {
  return result?.kind === "answered"
}

export function isUnsupported(
  result: CopilotResult | null | undefined
): result is Extract<CopilotResult, { kind: "unsupported" }> {
  return result?.kind === "unsupported"
}

export function isError(
  result: CopilotResult | null | undefined
): result is Extract<CopilotResult, { kind: "error" }> {
  return result?.kind === "error"
}

function collapseWhitespace(value: string): string {
  let collapsed = ""
  let previousWasWhitespace = false
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    const isWhitespace = codePoint <= 32 || codePoint === 127
    if (isWhitespace) {
      if (!previousWasWhitespace && collapsed.length > 0) {
        collapsed += " "
      }
      previousWasWhitespace = true
      continue
    }
    collapsed += character
    previousWasWhitespace = false
  }
  return collapsed.trim()
}

/**
 * Convert untrusted error text into one safe display line: markup is dropped,
 * control characters and repeated whitespace collapse, and the result is
 * capped. The fallback text is used when nothing readable remains.
 */
export function sanitizeCopilotMessage(value: string): string {
  const withoutMarkup = value.replace(/<[^>]*>/g, " ")
  const collapsed = collapseWhitespace(withoutMarkup)
  if (collapsed.length === 0) {
    return "The retention analyst request failed."
  }
  if (collapsed.length <= MAX_SANITIZED_MESSAGE_LENGTH) {
    return collapsed
  }
  return `${collapsed.slice(0, MAX_SANITIZED_MESSAGE_LENGTH - 1).trimEnd()}…`
}
