/**
 * Offline contract tests for deterministic copilot answer formatting.
 *
 * Envelopes are resolved through the existing evidence layer: the real fixed
 * payload is read via loadEvidence() (local file only, no network), and the
 * tie case uses the in-memory byte seam. formatAnswer() must render verified
 * evidence values exactly, never derive deltas, and never mirror raw values
 * without their unit.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { loadEvidence, loadEvidenceFromBytes } from "../evidence/index.ts"
import type {
  EvidenceEnvelope,
  EvidenceFact,
  EvidenceRequest,
  EvidenceService,
  SupportedContract,
} from "../evidence/index.ts"
import { formatAnswer, formatFactValue } from "./format.ts"

const SNAPSHOT = "Q2 2022"
const MRVL_DEFINITION_TEXT =
  "SUM(Monthly Charge) WHERE Customer Status = 'Churned'"
const DENOMINATOR = "Churned + Stayed"
const TIED_RATE_PCT = 50

type Resolve = EvidenceService["resolve"]

function loadRealService(): EvidenceService {
  const loaded = loadEvidence()
  if (!loaded.ok) {
    assert.fail(`loadEvidence() failed: ${JSON.stringify(loaded.error)}`)
  }
  return loaded.service
}

function loadSyntheticService(payload: unknown): EvidenceService {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const loaded = loadEvidenceFromBytes(bytes)
  if (!loaded.ok) {
    assert.fail(
      `loadEvidenceFromBytes() failed: ${JSON.stringify(loaded.error)}`
    )
  }
  return loaded.service
}

function resolveEnvelope(
  resolve: Resolve,
  request: EvidenceRequest
): EvidenceEnvelope {
  const result = resolve(request)
  if (!result.ok) {
    assert.fail(
      `expected evidence for ${JSON.stringify(request)}, received ${JSON.stringify(result.error)}`
    )
  }
  return result.envelope
}

function factByMetric(
  envelope: EvidenceEnvelope,
  metricId: EvidenceFact["metric"]["id"]
): EvidenceFact {
  const fact = envelope.facts.find(
    (candidate) => candidate.metric.id === metricId
  )
  if (fact === undefined) {
    assert.fail(`envelope is missing metric ${metricId}`)
  }
  return fact
}

function contractRow(
  category: SupportedContract,
  churnRatePct: number
): Readonly<Record<string, number | string>> {
  return {
    category,
    existing_customers: 100,
    churned_customers: 50,
    retained_customers: 50,
    churn_rate_pct: churnRatePct,
    pct_of_total_churn: 50,
  }
}

/** Complete synthetic payload whose One Year and Two Year rates tie highest. */
function tiePayload(): unknown {
  return {
    metadata: { snapshot: SNAPSHOT },
    kpis: {
      total_customers: 300,
      existing_customers: 250,
      churned_customers: 50,
      retained_customers: 200,
      joined_customers: 50,
      churn_rate_pct: 20,
      retention_rate_pct: 80,
      mrvl: 1000,
    },
    by_contract: [
      contractRow("Month-to-Month", 10),
      contractRow("One Year", TIED_RATE_PCT),
      contractRow("Two Year", TIED_RATE_PCT),
    ],
    mrvl: { definition: "SYNTHETIC MRVL TEXT" },
  }
}

const realService = loadRealService()

test("formats the overall churn rate as percentage points with its denominator", () => {
  const envelope = resolveEnvelope(realService.resolve, {
    operation: "get_kpi",
    metric: "churn_rate_pct",
  })
  const text = formatAnswer(envelope)

  assert.ok(text.includes("28.37%"))
  assert.equal(text.includes("2837"), false)
  assert.equal(text.includes("0.2837"), false)
  assert.ok(text.includes(DENOMINATOR))
  assert.ok(text.includes("Population/denominator:"))
})

test("formats MRVL as a per-month dollar amount and not a bare number", () => {
  const envelope = resolveEnvelope(realService.resolve, {
    operation: "get_kpi",
    metric: "mrvl",
  })
  const text = formatAnswer(envelope)

  assert.ok(text.includes("$137,086.65 per month"))
  assert.equal(text.includes("$137086.65"), false)
  assert.ok(text.includes("Monthly Recurring Value Lost"))
})

test("attaches every Month-to-Month metric to its contract label", () => {
  const envelope = resolveEnvelope(realService.resolve, {
    operation: "get_contract_metrics",
    contract: "Month-to-Month",
  })
  const text = formatAnswer(envelope)

  assert.ok(
    text.startsWith("Month-to-Month contract in the Q2 2022 full snapshot:")
  )
  assert.ok(text.includes("Existing Customers 3,202"))
  assert.ok(text.includes("Churned Customers 1,655"))
  assert.ok(text.includes("Retained Customers 1,547"))
  assert.ok(text.includes("Churn Rate 51.69%"))
  assert.ok(text.includes("Share of All Churn 88.55%"))
  assert.ok(text.includes("Rate denominator:"))
  assert.ok(text.includes(DENOMINATOR))
  assert.equal(text.includes("One Year"), false)
  assert.equal(text.includes("Two Year"), false)
})

test("renders two contract blocks on one newline with no derived delta", () => {
  const envelope = resolveEnvelope(realService.resolve, {
    operation: "compare_contracts",
    contracts: ["One Year", "Two Year"],
  })
  const text = formatAnswer(envelope)
  const blocks = text.split("\n")

  assert.equal(blocks.length, 2, "expected exactly one newline between blocks")
  const [oneYear, twoYear] = blocks

  assert.ok(
    oneYear.startsWith("One Year contract in the Q2 2022 full snapshot:")
  )
  assert.ok(oneYear.includes("1,526"))
  assert.ok(oneYear.includes("10.88%"))
  assert.equal(oneYear.includes("1,861"), false)
  assert.equal(oneYear.includes("2.58%"), false)

  assert.ok(
    twoYear.startsWith("Two Year contract in the Q2 2022 full snapshot:")
  )
  assert.ok(twoYear.includes("1,861"))
  assert.ok(twoYear.includes("2.58%"))
  assert.equal(twoYear.includes("1,526"), false)
  assert.equal(twoYear.includes("10.88%"), false)

  const lower = text.toLowerCase()
  for (const word of ["difference", "delta", "lift"]) {
    assert.equal(
      lower.includes(word),
      false,
      `unexpected derived term: ${word}`
    )
  }
})

test("names the real highest-churn contract", () => {
  const envelope = resolveEnvelope(realService.resolve, {
    operation: "highest_churn_contract",
  })
  const text = formatAnswer(envelope)

  assert.ok(text.includes("Month-to-Month"))
  assert.ok(text.includes("51.69%"))
  assert.equal(text.includes("Tie for the highest churn rate"), false)
})

test("states a tie explicitly when the highest churn rate is shared", () => {
  const service = loadSyntheticService(tiePayload())
  const envelope = resolveEnvelope(service.resolve, {
    operation: "highest_churn_contract",
  })
  const text = formatAnswer(envelope)

  assert.ok(text.includes("Tie for the highest churn rate"))
  assert.ok(text.includes(`One Year ${TIED_RATE_PCT.toFixed(2)}%`))
  assert.ok(text.includes(`Two Year ${TIED_RATE_PCT.toFixed(2)}%`))
  assert.ok(text.includes(SNAPSHOT))
  assert.equal(text.includes("Month-to-Month"), false)
})

test("cites the payload MRVL definition text and artifact digest", () => {
  const envelope = resolveEnvelope(realService.resolve, {
    operation: "get_definition",
    definition: "mrvl",
  })
  assert.equal(envelope.facts.length, 0, "a definition needs no numeric fact")

  const text = formatAnswer(envelope)
  assert.ok(text.includes(MRVL_DEFINITION_TEXT))
  assert.ok(text.includes("dashboard payload field mrvl.definition"))
  assert.match(envelope.artifact.sha256, /^[a-f0-9]{64}$/)
  assert.ok(text.includes(envelope.artifact.sha256))
})

test("cites the repository document for the churn-rate definition", () => {
  const envelope = resolveEnvelope(realService.resolve, {
    operation: "get_definition",
    definition: "churn_rate",
  })
  assert.equal(envelope.facts.length, 0, "a definition needs no numeric fact")

  const text = formatAnswer(envelope)
  assert.ok(text.includes("repository document docs/churn_definition.md"))
  assert.ok(text.includes("versioned separately"))
  assert.ok(text.includes("Churn Rate = Churned / (Churned + Stayed)."))
})

test("formats count, percentage, and currency facts without losing precision", () => {
  const contractEnvelope = resolveEnvelope(realService.resolve, {
    operation: "get_contract_metrics",
    contract: "Month-to-Month",
  })
  assert.equal(
    formatFactValue(factByMetric(contractEnvelope, "existing_customers")),
    "3,202"
  )
  assert.equal(
    formatFactValue(factByMetric(contractEnvelope, "churn_rate_pct")),
    "51.69%"
  )

  const mrvlEnvelope = resolveEnvelope(realService.resolve, {
    operation: "get_kpi",
    metric: "mrvl",
  })
  const mrvlFact = mrvlEnvelope.facts[0]
  assert.equal(formatFactValue(mrvlFact), "$137,086.65 per month")

  const centsFact: EvidenceFact = { ...mrvlFact, value: 1234.5 }
  assert.equal(formatFactValue(centsFact), "$1,234.50 per month")
  assert.ok(formatFactValue(centsFact).includes("$1,234.50"))
})
