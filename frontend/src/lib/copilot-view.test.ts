/// <reference types="node" />
/**
 * Offline tests for the pure copilot presentation helpers.
 *
 * Fixtures use the browser contract types directly so formatting, row
 * association, and definition source wording can be asserted without React.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type {
  CopilotDefinition,
  CopilotEvidence,
  CopilotFact,
  CopilotResult,
  CopilotUnit,
} from "./copilot-contract.ts"
import {
  artifactHashFull,
  artifactHashShort,
  describeOperation,
  describeScope,
  evidenceRows,
  formatFactValue,
  isAnswered,
  isError,
  isUnsupported,
  sanitizeCopilotMessage,
} from "./copilot-view.ts"

const ARTIFACT_SHA = "0123456789abcdef".repeat(4)

type FactOverrides = {
  readonly id?: string
  readonly citationId?: string
  readonly metric?: CopilotFact["metric"]
  readonly value?: number
  readonly unit?: CopilotUnit
  readonly scope?: CopilotFact["scope"]
}

function makeFact(overrides: FactOverrides = {}): CopilotFact {
  return {
    id: overrides.id ?? "fact-churn-rate",
    citation: {
      id: overrides.citationId ?? "cite-kpis-churn-rate",
      artifactSha256: ARTIFACT_SHA,
    },
    metric: overrides.metric ?? { id: "churn_rate_pct", label: "Churn Rate" },
    value: overrides.value ?? 28.37,
    unit: overrides.unit ?? { kind: "percentage" },
    scope: overrides.scope ?? { kind: "overall" },
    population: { id: "existing_customers", definition: "Churned + Stayed" },
    locator: { section: "kpis", field: "churn_rate_pct" },
  }
}

type EvidenceOverrides = {
  readonly request?: CopilotEvidence["request"]
  readonly facts?: readonly CopilotFact[]
  readonly definitions?: readonly CopilotDefinition[]
  readonly caveats?: readonly string[]
}

function makeEvidence(overrides: EvidenceOverrides = {}): CopilotEvidence {
  return {
    snapshot: "Q2 2022",
    scope: {
      kind: "full_snapshot",
      description: "Full Q2 2022 snapshot across all customers.",
    },
    artifact: {
      source: "data/processed/dashboard_payload.json",
      sha256: ARTIFACT_SHA,
    },
    request: overrides.request ?? {
      operation: "get_kpi",
      metric: "churn_rate_pct",
    },
    facts: overrides.facts ?? [],
    definitions: overrides.definitions ?? [],
    caveats: overrides.caveats ?? [],
  }
}

const REPOSITORY_DEFINITION: CopilotDefinition = {
  id: "churn_rate",
  title: "Churn Rate",
  text: "Churn Rate = Churned / (Churned + Stayed).",
  source: {
    kind: "repository_document",
    path: "docs/churn_definition.md",
    section: "Canonical Formulas → Churn Rate",
    versioning: "separate_from_payload",
  },
  caveats: ["Rates describe the Q2 2022 snapshot only."],
}

const PAYLOAD_DEFINITION: CopilotDefinition = {
  id: "mrvl",
  title: "Monthly Recurring Value Lost (MRVL)",
  text: "SUM(Monthly Charge) WHERE Customer Status = 'Churned'",
  source: {
    kind: "payload_field",
    section: "mrvl",
    field: "definition",
    versioning: "payload",
    artifactSha256: ARTIFACT_SHA,
  },
  caveats: ["A monthly value measure over churned customers."],
}

test("formats counts with grouping", () => {
  const fact = makeFact({
    value: 3202,
    unit: { kind: "count" },
    metric: { id: "churned_customers", label: "Churned Customers" },
  })

  assert.equal(formatFactValue(fact), "3,202")
})

test("formats percentages as-is with a percent sign", () => {
  assert.equal(formatFactValue(makeFact({ value: 28.37 })), "28.37%")
  assert.equal(formatFactValue(makeFact({ value: 50 })), "50.00%")
})

test("formats monthly USD currency with grouping and period", () => {
  const fact = makeFact({
    value: 137086.65,
    unit: { kind: "currency", currency: "USD", period: "month" },
    metric: { id: "mrvl", label: "MRVL" },
  })

  assert.equal(formatFactValue(fact), "$137,086.65 per month")
})

test("associates contract scopes with their own values in comparison rows", () => {
  const evidence = makeEvidence({
    request: {
      operation: "compare_contracts",
      contracts: ["One Year", "Two Year"],
    },
    facts: [
      makeFact({
        id: "fact-one-year-churn",
        citationId: "cite-by-contract-one-year",
        scope: { kind: "contract", contract: "One Year" },
        value: 25.11,
      }),
      makeFact({
        id: "fact-two-year-churn",
        citationId: "cite-by-contract-two-year",
        scope: { kind: "contract", contract: "Two Year" },
        value: 2.83,
      }),
    ],
  })

  const rows = evidenceRows(evidence)

  assert.equal(rows.facts.length, 2)
  assert.deepEqual(rows.definitions, [])

  const oneYear = rows.facts[0]
  if (oneYear === undefined) {
    assert.fail("expected the One Year row")
  }
  assert.equal(oneYear.metric, "Churn Rate")
  assert.equal(oneYear.scope, "One Year")
  assert.equal(oneYear.value, "25.11%")
  assert.equal(oneYear.unit, "percentage points")
  assert.equal(oneYear.citationId, "cite-by-contract-one-year")

  const twoYear = rows.facts[1]
  if (twoYear === undefined) {
    assert.fail("expected the Two Year row")
  }
  assert.equal(twoYear.scope, "Two Year")
  assert.equal(twoYear.value, "2.83%")
  assert.equal(twoYear.citationId, "cite-by-contract-two-year")
})

test("labels overall scope and keeps citations on fact rows", () => {
  const rows = evidenceRows(
    makeEvidence({
      facts: [makeFact({ value: 3202, unit: { kind: "count" } })],
    })
  )

  const row = rows.facts[0]
  if (row === undefined) {
    assert.fail("expected one fact row")
  }
  assert.equal(row.scope, "Overall")
  assert.equal(row.value, "3,202")
  assert.equal(row.unit, "count")
  assert.equal(row.citationId, "cite-kpis-churn-rate")
})

test("definition rows distinguish repository documents from payload fields", () => {
  const rows = evidenceRows(
    makeEvidence({
      request: { operation: "get_definition", definition: "mrvl" },
      definitions: [REPOSITORY_DEFINITION, PAYLOAD_DEFINITION],
    })
  )

  assert.deepEqual(rows.facts, [])
  assert.equal(rows.definitions.length, 2)

  const documentRow = rows.definitions[0]
  if (documentRow === undefined) {
    assert.fail("expected the repository document row")
  }
  assert.equal(documentRow.title, "Churn Rate")
  assert.match(documentRow.source, /docs\/churn_definition\.md/)
  assert.match(documentRow.source, /Canonical Formulas → Churn Rate/)
  assert.match(documentRow.source, /versioned separately from the payload/)

  const payloadRow = rows.definitions[1]
  if (payloadRow === undefined) {
    assert.fail("expected the payload field row")
  }
  assert.equal(payloadRow.title, "Monthly Recurring Value Lost (MRVL)")
  assert.match(payloadRow.source, /mrvl\.definition/)
  assert.match(payloadRow.source, new RegExp(ARTIFACT_SHA))
  assert.notEqual(documentRow.source, payloadRow.source)
})

test("describes each supported operation in readable terms", () => {
  assert.equal(
    describeOperation({ operation: "get_kpi", metric: "churn_rate_pct" }),
    "Overall KPI: Churn Rate"
  )
  assert.equal(
    describeOperation({
      operation: "get_contract_metrics",
      contract: "One Year",
    }),
    "Contract metrics: One Year"
  )
  assert.equal(
    describeOperation({
      operation: "compare_contracts",
      contracts: ["One Year", "Two Year"],
    }),
    "Contract comparison: One Year vs Two Year"
  )
  assert.equal(
    describeOperation({ operation: "highest_churn_contract" }),
    "Highest churn-rate contract"
  )
  assert.equal(
    describeOperation({ operation: "get_definition", definition: "mrvl" }),
    "Definition: Monthly Recurring Value Lost (MRVL)"
  )
})

test("describes the full-snapshot scope from the evidence", () => {
  const evidence = makeEvidence()
  assert.equal(
    describeScope(evidence.scope),
    "Full Q2 2022 snapshot across all customers."
  )
})

test("shortens artifact hashes without changing the full hash", () => {
  assert.equal(artifactHashShort(ARTIFACT_SHA), ARTIFACT_SHA.slice(0, 12))
  assert.equal(artifactHashShort(ARTIFACT_SHA).length, 12)
  assert.equal(artifactHashFull(ARTIFACT_SHA), ARTIFACT_SHA)
})

test("narrows result kinds", () => {
  const answered = { kind: "answered" } as unknown as CopilotResult
  const unsupported = { kind: "unsupported" } as unknown as CopilotResult
  const error = { kind: "error" } as unknown as CopilotResult

  assert.equal(isAnswered(answered), true)
  assert.equal(isAnswered(unsupported), false)
  assert.equal(isUnsupported(unsupported), true)
  assert.equal(isUnsupported(error), false)
  assert.equal(isError(error), true)
  assert.equal(isError(answered), false)
  assert.equal(isAnswered(undefined), false)
  assert.equal(isError(null), false)
})

test("formats evidence without recomputing or mutating the source value", () => {
  const fact = makeFact({ value: 28.37 })
  const evidence = makeEvidence({ facts: [fact] })

  const rows = evidenceRows(evidence)

  assert.equal(fact.value, 28.37)
  assert.equal(rows.facts[0]?.value, "28.37%")
})

test("sanitizes untrusted error text", () => {
  assert.equal(
    sanitizeCopilotMessage("  <b>Busy</b>\n\n try   later  "),
    "Busy try later"
  )
  assert.equal(
    sanitizeCopilotMessage("<script></script>"),
    "The retention analyst request failed."
  )
  assert.equal(sanitizeCopilotMessage("a".repeat(600)).length <= 400, true)
})
