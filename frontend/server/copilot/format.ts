/**
 * Deterministic answer construction from verified evidence only.
 *
 * The model never supplies answer text or values: every label, value, unit,
 * definition, and citation comes from the resolved EvidenceEnvelope. Formatting
 * uses its own Intl formatters so existing display helpers (which may abbreviate
 * or discard precision) stay untouched.
 */
import type {
  DefinitionEvidence,
  EvidenceEnvelope,
  EvidenceFact,
} from "../evidence/index.ts"

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

export function formatFactValue(fact: EvidenceFact): string {
  const unit = fact.unit
  switch (unit.kind) {
    case "count":
      return countFormatter.format(fact.value)
    case "percentage":
      // Values are already percentage points on the 0-100 scale.
      return `${percentFormatter.format(fact.value)}%`
    case "currency": {
      const amount = currencyFormatter.format(fact.value)
      return unit.period === "month" ? `${amount} per month` : amount
    }
  }
}

function describeFacts(facts: readonly EvidenceFact[]): string {
  return facts
    .map((fact) => `${fact.metric.label} ${formatFactValue(fact)}`)
    .join("; ")
}

function definitionSourceText(definition: DefinitionEvidence): string {
  const source = definition.source
  if (source.kind === "repository_document") {
    return `repository document ${source.path} (${source.section}), versioned separately from the dashboard payload`
  }
  return `dashboard payload field ${source.section}.${source.field} (artifact sha256 ${source.artifactSha256})`
}

function definitionText(definition: DefinitionEvidence): string {
  return `${definition.title}: ${definition.text} Source: ${definitionSourceText(definition)}.`
}

/**
 * Build the complete deterministic answer text for a resolved envelope. Each
 * operation has one fixed rendering; comparisons never derive deltas and the
 * highest-churn rendering states ties explicitly from the evidence selection.
 */
export function formatAnswer(evidence: EvidenceEnvelope): string {
  const request = evidence.request
  const snapshot = evidence.snapshot

  switch (request.operation) {
    case "get_kpi": {
      const fact = evidence.facts[0]
      const main = `${fact.metric.label} for the ${snapshot} full snapshot: ${formatFactValue(fact)}.`
      return `${main} Population/denominator: ${fact.population.definition}`
    }

    case "get_contract_metrics": {
      const contract = request.contract
      const facts = evidence.facts
      const rate = facts.find((fact) => fact.metric.id === "churn_rate_pct")
      const suffix =
        rate === undefined
          ? ""
          : ` Rate denominator: ${rate.population.definition}`
      return `${contract} contract in the ${snapshot} full snapshot: ${describeFacts(facts)}.${suffix}`
    }

    case "compare_contracts": {
      const [first, second] = request.contracts
      const blocks = [first, second].map((contract) => {
        const facts = evidence.facts.filter(
          (fact) =>
            fact.scope.kind === "contract" && fact.scope.contract === contract
        )
        const rate = facts.find((fact) => fact.metric.id === "churn_rate_pct")
        const suffix =
          rate === undefined
            ? ""
            : ` Rate denominator: ${rate.population.definition}`
        return `${contract} contract in the ${snapshot} full snapshot: ${describeFacts(facts)}.${suffix}`
      })
      return blocks.join("\n")
    }

    case "highest_churn_contract": {
      const selection = evidence.selection
      const facts = evidence.facts
      const entries = facts
        .map((fact) => {
          const contract =
            fact.scope.kind === "contract" ? fact.scope.contract : "unknown"
          return `${contract} ${formatFactValue(fact)}`
        })
        .join("; ")
      const tiePrefix =
        selection !== undefined && selection.tie
          ? "Tie for the highest churn rate"
          : "Highest churn rate"
      const rate = facts[0]
      const denominator =
        rate === undefined
          ? ""
          : ` Rate denominator: ${rate.population.definition}`
      return `${tiePrefix} in the ${snapshot} full snapshot: ${entries}.${denominator}`
    }

    case "get_definition": {
      const definitions = evidence.definitions
      return definitions.map(definitionText).join("\n")
    }
  }
}
