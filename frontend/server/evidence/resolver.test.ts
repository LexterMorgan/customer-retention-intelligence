import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"
import { fileURLToPath } from "node:url"

import { loadEvidence } from "./payload.ts"
import { createEvidenceResolver } from "./resolver.ts"
import type {
  ContractMetricId,
  DefinitionEvidence,
  DefinitionId,
  EvidenceEnvelope,
  EvidenceError,
  EvidenceFact,
  EvidenceRequest,
  EvidenceResult,
  FactUnit,
  KpiMetricId,
  SupportedContract,
} from "./types.ts"

type Resolve = (request: unknown) => EvidenceResult

type RealService = {
  readonly artifact: { readonly source: string; readonly sha256: string }
  readonly resolve: Resolve
}

const ARTIFACT_SHA_A = "a".repeat(64)
const ARTIFACT_SHA_B = "b".repeat(64)
const SNAPSHOT = "Q2 2022"
const MRVL_DEFINITION_TEXT =
  "SUM(Monthly Charge) WHERE Customer Status = 'Churned'"
const REAL_PAYLOAD_PATH = fileURLToPath(
  new URL("../../../data/processed/dashboard_payload.json", import.meta.url)
)

function readRealPayload(): Record<string, unknown> {
  const text = readFileSync(REAL_PAYLOAD_PATH, "utf8")
  return JSON.parse(text) as Record<string, unknown>
}

const CONTRACT_ORDER: readonly SupportedContract[] = [
  "Month-to-Month",
  "One Year",
  "Two Year",
]

const KPI_IDS: readonly KpiMetricId[] = [
  "total_customers",
  "existing_customers",
  "churned_customers",
  "retained_customers",
  "joined_customers",
  "churn_rate_pct",
  "retention_rate_pct",
  "mrvl",
]

const CONTRACT_METRIC_ORDER: readonly ContractMetricId[] = [
  "existing_customers",
  "churned_customers",
  "retained_customers",
  "churn_rate_pct",
  "pct_of_total_churn",
]

const DEFINITION_IDS: readonly DefinitionId[] = [
  "churn_rate",
  "retention_rate",
  "existing_customers",
  "mrvl",
]

/** Exact own-property set of an evidence fact; no delta/lift fields exist. */
const FACT_KEYS = [
  "citation",
  "id",
  "locator",
  "metric",
  "population",
  "scope",
  "unit",
  "value",
]

const KPI_VALUES: Record<KpiMetricId, number> = {
  total_customers: 7043,
  existing_customers: 6589,
  churned_customers: 1869,
  retained_customers: 4720,
  joined_customers: 454,
  churn_rate_pct: 28.37,
  retention_rate_pct: 71.63,
  mrvl: 137086.65,
}

const KPI_UNITS: Record<KpiMetricId, FactUnit> = {
  total_customers: { kind: "count" },
  existing_customers: { kind: "count" },
  churned_customers: { kind: "count" },
  retained_customers: { kind: "count" },
  joined_customers: { kind: "count" },
  churn_rate_pct: { kind: "percentage" },
  retention_rate_pct: { kind: "percentage" },
  mrvl: { kind: "currency", currency: "USD", period: "month" },
}

const CONTRACT_VALUES: Record<
  SupportedContract,
  Record<ContractMetricId, number>
> = {
  "Month-to-Month": {
    existing_customers: 3202,
    churned_customers: 1655,
    retained_customers: 1547,
    churn_rate_pct: 51.69,
    pct_of_total_churn: 88.55,
  },
  "One Year": {
    existing_customers: 1526,
    churned_customers: 166,
    retained_customers: 1360,
    churn_rate_pct: 10.88,
    pct_of_total_churn: 8.88,
  },
  "Two Year": {
    existing_customers: 1861,
    churned_customers: 48,
    retained_customers: 1813,
    churn_rate_pct: 2.58,
    pct_of_total_churn: 2.57,
  },
}

const CONTRACT_UNITS: Record<ContractMetricId, FactUnit> = {
  existing_customers: { kind: "count" },
  churned_customers: { kind: "count" },
  retained_customers: { kind: "count" },
  churn_rate_pct: { kind: "percentage" },
  pct_of_total_churn: { kind: "percentage" },
}

type FixtureRow = { category: SupportedContract } & Record<
  ContractMetricId,
  number
>

type FixturePayload = {
  metadata: { snapshot: string }
  kpis: Record<KpiMetricId, number>
  by_contract: FixtureRow[]
  mrvl: { definition: string }
}

type FixtureOptions = {
  snapshot?: string
  contracts?: readonly SupportedContract[]
  kpiOverrides?: Partial<Record<KpiMetricId, number>>
  contractOverrides?: Partial<
    Record<SupportedContract, Partial<Record<ContractMetricId, number>>>
  >
}

function buildFixture(options: FixtureOptions = {}): FixturePayload {
  const contracts = options.contracts ?? CONTRACT_ORDER
  return {
    metadata: { snapshot: options.snapshot ?? SNAPSHOT },
    kpis: { ...KPI_VALUES, ...options.kpiOverrides },
    by_contract: contracts.map((category) => ({
      category,
      ...CONTRACT_VALUES[category],
      ...(options.contractOverrides?.[category] ?? {}),
    })),
    mrvl: { definition: MRVL_DEFINITION_TEXT },
  }
}

function createResolver(
  payload: unknown,
  artifactSha256: string = ARTIFACT_SHA_A
): Resolve {
  const created = createEvidenceResolver({ payload, artifactSha256 })
  if (!created.ok) {
    assert.fail(
      `expected a valid resolver, received ${JSON.stringify(created.error)}`
    )
  }
  return created.resolve
}

function loadReal(): RealService {
  const loaded = loadEvidence()
  if (!loaded.ok) {
    assert.fail(`loadEvidence() failed: ${JSON.stringify(loaded.error)}`)
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

function singleFact(resolve: Resolve, request: EvidenceRequest): EvidenceFact {
  const envelope = resolveEnvelope(resolve, request)
  assert.equal(envelope.facts.length, 1, "expected exactly one fact")
  return envelope.facts[0]
}

function expectError(result: EvidenceResult): EvidenceError {
  if (result.ok) {
    assert.fail(
      `expected an error result, received ${result.envelope.facts.length} fact(s)`
    )
  }
  return result.error
}

function contractOf(fact: EvidenceFact): SupportedContract {
  const scope = fact.scope
  if (scope.kind !== "contract") {
    assert.fail(`expected contract scope, received ${scope.kind}`)
  }
  return scope.contract
}

function resolveDefinition(
  resolve: Resolve,
  id: DefinitionId
): DefinitionEvidence {
  const envelope = resolveEnvelope(resolve, {
    operation: "get_definition",
    definition: id,
  })
  assert.equal(envelope.facts.length, 0)
  assert.equal(envelope.definitions.length, 1)
  const definition = envelope.definitions[0]
  assert.equal(definition.id, id)
  return definition
}

function expectRepositoryDocument(definition: DefinitionEvidence) {
  const source = definition.source
  if (source.kind !== "repository_document") {
    assert.fail(
      `expected a repository_document source for ${definition.id}, received ${source.kind}`
    )
  }
  return source
}

function expectPayloadFieldSource(
  definition: DefinitionEvidence,
  artifactSha256: string
) {
  const source = definition.source
  if (source.kind !== "payload_field") {
    assert.fail(
      `expected a payload_field source for ${definition.id}, received ${source.kind}`
    )
  }
  assert.equal(source.artifactSha256, artifactSha256)
  assert.equal(source.versioning, "payload")
  return source
}

function caveatContaining(caveats: readonly string[], needle: string): string {
  const match = caveats.find((caveat) => caveat.includes(needle))
  if (match === undefined) {
    assert.fail(
      `expected a caveat containing ${JSON.stringify(needle)} in ${JSON.stringify(caveats)}`
    )
  }
  return match
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as unknown as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}

function clonePayload(): Record<string, unknown> {
  return structuredClone(buildFixture()) as unknown as Record<string, unknown>
}

function payloadWithKpi(metric: KpiMetricId, value: unknown): unknown {
  const clone = clonePayload()
  const kpis = clone["kpis"] as Record<string, unknown>
  kpis[metric] = value
  return clone
}

function payloadWithoutKpi(metric: KpiMetricId): unknown {
  const clone = clonePayload()
  const kpis = clone["kpis"] as Record<string, unknown>
  delete kpis[metric]
  return clone
}

function payloadWithRows(mutate: (rows: unknown[]) => void): unknown {
  const clone = clonePayload()
  mutate(clone["by_contract"] as unknown[])
  return clone
}

function payloadWithoutRows(): unknown {
  const clone = clonePayload()
  delete clone["by_contract"]
  return clone
}

function payloadWithSnapshot(snapshot: unknown): unknown {
  const clone = clonePayload()
  const metadata = clone["metadata"] as Record<string, unknown>
  metadata["snapshot"] = snapshot
  return clone
}

function payloadWithoutSnapshot(): unknown {
  const clone = clonePayload()
  const metadata = clone["metadata"] as Record<string, unknown>
  delete metadata["snapshot"]
  return clone
}

function payloadWithMrvlDefinition(definition: unknown): unknown {
  const clone = clonePayload()
  const mrvl = clone["mrvl"] as Record<string, unknown>
  mrvl["definition"] = definition
  return clone
}

function payloadWithoutMrvlDefinition(): unknown {
  const clone = clonePayload()
  const mrvl = clone["mrvl"] as Record<string, unknown>
  delete mrvl["definition"]
  return clone
}

function payloadWithoutMrvlSection(): unknown {
  const clone = clonePayload()
  delete clone["mrvl"]
  return clone
}

const INVALID_PAYLOAD_CASES: ReadonlyArray<{
  readonly name: string
  readonly payload: () => unknown
}> = [
  {
    name: "a NaN KPI value",
    payload: () => payloadWithKpi("churn_rate_pct", Number.NaN),
  },
  {
    name: "an infinite KPI value",
    payload: () => payloadWithKpi("mrvl", Number.POSITIVE_INFINITY),
  },
  {
    name: "a string KPI value",
    payload: () => payloadWithKpi("total_customers", "7043"),
  },
  {
    name: "a missing KPI field",
    payload: () => payloadWithoutKpi("retained_customers"),
  },
  {
    name: "a duplicate contract category",
    payload: () =>
      payloadWithRows((rows) => {
        const first = rows[0] as Record<string, unknown>
        rows.push({ ...first })
      }),
  },
  {
    name: "an unknown contract category",
    payload: () =>
      payloadWithRows((rows) => {
        const first = rows[0] as Record<string, unknown>
        first["category"] = "Three Year"
      }),
  },
  {
    name: "a missing by_contract section",
    payload: () => payloadWithoutRows(),
  },
  {
    name: "a non-object contract row",
    payload: () => payloadWithRows((rows) => rows.push(42)),
  },
  {
    name: "an empty snapshot label",
    payload: () => payloadWithSnapshot(""),
  },
  {
    name: "a whitespace-only snapshot label",
    payload: () => payloadWithSnapshot("   "),
  },
  {
    name: "a missing snapshot label",
    payload: () => payloadWithoutSnapshot(),
  },
]

describe("real dashboard payload integration", () => {
  test("loadEvidence() reads the fixed artifact with the Q2 2022 snapshot", () => {
    const service = loadReal()
    assert.equal(
      service.artifact.source,
      "data/processed/dashboard_payload.json"
    )
    assert.match(service.artifact.sha256, /^[a-f0-9]{64}$/)
    const envelope = resolveEnvelope(service.resolve, {
      operation: "highest_churn_contract",
    })
    assert.equal(envelope.snapshot, SNAPSHOT)
    assert.equal(envelope.artifact.source, service.artifact.source)
    assert.equal(envelope.artifact.sha256, service.artifact.sha256)
  })

  test("resolves every KPI with its exact value, unit, locator, and citation", () => {
    const service = loadReal()
    for (const metric of KPI_IDS) {
      const envelope = resolveEnvelope(service.resolve, {
        operation: "get_kpi",
        metric,
      })
      assert.equal(envelope.facts.length, 1, `${metric}: one fact expected`)
      const fact = envelope.facts[0]
      assert.equal(fact.metric.id, metric)
      assert.equal(fact.value, KPI_VALUES[metric], `${metric}: value`)
      assert.deepEqual(fact.unit, KPI_UNITS[metric], `${metric}: unit`)
      assert.deepEqual(fact.scope, { kind: "overall" }, `${metric}: scope`)
      assert.deepEqual(
        fact.locator,
        { section: "kpis", field: metric },
        `${metric}: locator`
      )
      assert.equal(fact.citation.id, `payload:kpis.${metric}`)
      assert.equal(fact.citation.artifactSha256, service.artifact.sha256)
      assert.equal(fact.id, `kpi:${metric}`)
      assert.equal(fact.population.id.length > 0, true)
    }
  })

  test("keeps percentage values on the raw 0-100 scale", () => {
    const service = loadReal()
    const churn = singleFact(service.resolve, {
      operation: "get_kpi",
      metric: "churn_rate_pct",
    })
    assert.equal(churn.value, 28.37)
    assert.equal(churn.unit.kind, "percentage")
    assert.notEqual(churn.value, 2837)
    assert.notEqual(churn.value, 0.2837)
    const retention = singleFact(service.resolve, {
      operation: "get_kpi",
      metric: "retention_rate_pct",
    })
    assert.equal(retention.value, 71.63)
    assert.equal(retention.unit.kind, "percentage")
  })

  test("reports MRVL as a monthly USD currency amount", () => {
    const service = loadReal()
    const mrvl = singleFact(service.resolve, {
      operation: "get_kpi",
      metric: "mrvl",
    })
    assert.equal(mrvl.value, 137086.65)
    assert.deepEqual(mrvl.unit, {
      kind: "currency",
      currency: "USD",
      period: "month",
    })
  })
})

describe("contract metrics", () => {
  test("returns the five Month-to-Month metrics with exact values and units", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "get_contract_metrics",
      contract: "Month-to-Month",
    })
    assert.equal(envelope.facts.length, 5)
    assert.deepEqual(
      envelope.facts.map((fact) => fact.metric.id),
      [...CONTRACT_METRIC_ORDER]
    )
    for (const metric of CONTRACT_METRIC_ORDER) {
      const fact = envelope.facts.find(
        (candidate) => candidate.metric.id === metric
      )
      assert.ok(fact, `Month-to-Month is missing ${metric}`)
      assert.equal(fact.value, CONTRACT_VALUES["Month-to-Month"][metric])
      assert.deepEqual(fact.unit, CONTRACT_UNITS[metric])
      assert.equal(contractOf(fact), "Month-to-Month")
    }
  })

  test("uses semantic by_contract locators, citation ids, and contract scope", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "get_contract_metrics",
      contract: "Month-to-Month",
    })
    for (const metric of CONTRACT_METRIC_ORDER) {
      const fact = envelope.facts.find(
        (candidate) => candidate.metric.id === metric
      )
      assert.ok(fact, `Month-to-Month is missing ${metric}`)
      assert.deepEqual(fact.locator, {
        section: "by_contract",
        key: { category: "Month-to-Month" },
        field: metric,
      })
      assert.equal(
        fact.citation.id,
        `payload:by_contract[category="Month-to-Month"].${metric}`
      )
      assert.equal(fact.id, `contract:Month-to-Month:${metric}`)
      assert.deepEqual(fact.scope, {
        kind: "contract",
        contract: "Month-to-Month",
      })
    }
  })
})

describe("contract comparison", () => {
  test("compares One Year and Two Year in ten facts across both scopes", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "compare_contracts",
      contracts: ["One Year", "Two Year"],
    })
    assert.equal(envelope.facts.length, 10)
    assert.deepEqual(envelope.request, {
      operation: "compare_contracts",
      contracts: ["One Year", "Two Year"],
    })
    for (const contract of ["One Year", "Two Year"] as const) {
      const facts = envelope.facts.filter(
        (fact) =>
          fact.scope.kind === "contract" && fact.scope.contract === contract
      )
      assert.equal(facts.length, 5, `${contract}: five facts expected`)
      for (const metric of CONTRACT_METRIC_ORDER) {
        const fact = facts.find((candidate) => candidate.metric.id === metric)
        assert.ok(fact, `${contract} is missing ${metric}`)
        assert.equal(fact.value, CONTRACT_VALUES[contract][metric])
        assert.deepEqual(fact.unit, CONTRACT_UNITS[metric])
        assert.deepEqual(fact.scope, { kind: "contract", contract })
      }
    }
  })

  test("adds no difference, delta, or lift fields to compared facts", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "compare_contracts",
      contracts: ["One Year", "Two Year"],
    })
    assert.equal(envelope.facts.length, 10)
    for (const fact of envelope.facts) {
      assert.deepEqual(Object.keys(fact).sort(), FACT_KEYS)
      assert.deepEqual(Object.keys(fact.metric).sort(), ["id", "label"])
      const serialized = JSON.stringify(fact).toLowerCase()
      for (const forbidden of ["difference", "delta", "lift"]) {
        assert.equal(
          serialized.includes(forbidden),
          false,
          `unexpected '${forbidden}' in ${fact.id}`
        )
      }
    }
  })
})

describe("highest churn contract", () => {
  test("selects Month-to-Month from the real payload without a tie", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "highest_churn_contract",
    })
    assert.equal(envelope.facts.length, 1)
    const fact = envelope.facts[0]
    assert.equal(fact.metric.id, "churn_rate_pct")
    assert.equal(fact.value, 51.69)
    assert.equal(contractOf(fact), "Month-to-Month")
    const selection = envelope.selection
    assert.ok(selection, "expected a highest-churn selection")
    assert.equal(selection.metric, "churn_rate_pct")
    assert.deepEqual([...selection.contracts], ["Month-to-Month"])
    assert.equal(selection.tie, false)
  })

  test("returns tied contracts in canonical contract order", () => {
    const fixture = buildFixture({
      contracts: ["Two Year", "Month-to-Month", "One Year"],
      contractOverrides: {
        "Month-to-Month": { churn_rate_pct: 12 },
        "One Year": { churn_rate_pct: 40 },
        "Two Year": { churn_rate_pct: 40 },
      },
    })
    const resolve = createResolver(fixture)
    const envelope = resolveEnvelope(resolve, {
      operation: "highest_churn_contract",
    })
    assert.equal(envelope.facts.length, 2)
    assert.deepEqual(
      envelope.facts.map((fact) => contractOf(fact)),
      ["One Year", "Two Year"]
    )
    for (const fact of envelope.facts) {
      assert.equal(fact.metric.id, "churn_rate_pct")
      assert.equal(fact.value, 40)
    }
    const selection = envelope.selection
    assert.ok(selection, "expected a highest-churn selection")
    assert.equal(selection.tie, true)
    assert.deepEqual([...selection.contracts], ["One Year", "Two Year"])
  })

  test("requires every supported contract category before selecting a winner", () => {
    const fixture = buildFixture({ contracts: ["One Year", "Two Year"] })
    const result = createResolver(fixture)({
      operation: "highest_churn_contract",
    })
    const error = expectError(result)
    assert.equal(error.kind, "evidence")
    assert.equal(error.code, "unavailable_evidence")
    assert.deepEqual(error.details?.missing, ["Month-to-Month"])
    assert.equal("envelope" in result, false)
  })

  test("reports every missing contract category", () => {
    const fixture = buildFixture({ contracts: ["Two Year"] })
    const error = expectError(
      createResolver(fixture)({ operation: "highest_churn_contract" })
    )
    assert.equal(error.code, "unavailable_evidence")
    assert.deepEqual(error.details?.missing, ["Month-to-Month", "One Year"])
  })

  test("individual contract lookups still work when a category is missing", () => {
    const fixture = buildFixture({ contracts: ["One Year", "Two Year"] })
    const resolve = createResolver(fixture)
    const envelope = resolveEnvelope(resolve, {
      operation: "get_contract_metrics",
      contract: "One Year",
    })
    assert.equal(envelope.facts.length, 5)
    const missing = expectError(
      resolve({ operation: "get_contract_metrics", contract: "Month-to-Month" })
    )
    assert.equal(missing.kind, "evidence")
    assert.equal(missing.code, "unavailable_evidence")
  })
})

describe("stable evidence identity", () => {
  test("reordering by_contract rows leaves every resolved envelope unchanged", () => {
    const fixture = buildFixture()
    const requests: EvidenceRequest[] = [
      { operation: "get_contract_metrics", contract: "Month-to-Month" },
      { operation: "get_contract_metrics", contract: "Two Year" },
      {
        operation: "compare_contracts",
        contracts: ["Month-to-Month", "Two Year"],
      },
      { operation: "highest_churn_contract" },
    ]
    const before = requests.map((request) =>
      resolveEnvelope(createResolver(fixture), request)
    )
    const reordered: FixturePayload = {
      ...fixture,
      by_contract: [...fixture.by_contract].reverse(),
    }
    assert.notDeepEqual(reordered.by_contract, fixture.by_contract)
    const after = requests.map((request) =>
      resolveEnvelope(createResolver(reordered), request)
    )
    assert.deepEqual(after, before)
    for (const envelope of after) {
      assert.equal(JSON.stringify(envelope).includes("by_contract["), true)
      assert.equal(JSON.stringify(envelope).includes("by_contract[0]"), false)
    }
  })

  test("binds artifact SHA-256 to the envelope and every fact citation", () => {
    const fixture = buildFixture()
    const request: EvidenceRequest = {
      operation: "get_contract_metrics",
      contract: "One Year",
    }
    const envelopeA = resolveEnvelope(
      createResolver(fixture, ARTIFACT_SHA_A),
      request
    )
    const envelopeB = resolveEnvelope(
      createResolver(fixture, ARTIFACT_SHA_B),
      request
    )
    assert.equal(envelopeA.artifact.sha256, ARTIFACT_SHA_A)
    assert.equal(envelopeB.artifact.sha256, ARTIFACT_SHA_B)
    assert.equal(envelopeA.artifact.source, envelopeB.artifact.source)
    assert.equal(envelopeA.facts.length, envelopeB.facts.length)
    envelopeA.facts.forEach((factA, index) => {
      const factB = envelopeB.facts[index]
      assert.equal(factA.citation.artifactSha256, ARTIFACT_SHA_A)
      assert.equal(factB.citation.artifactSha256, ARTIFACT_SHA_B)
      assert.equal(factA.citation.id, factB.citation.id)
      assert.equal(factA.id, factB.id)
      assert.equal(factA.value, factB.value)
      assert.deepEqual(factA.locator, factB.locator)
      assert.deepEqual(factA.unit, factB.unit)
    })
  })

  test("repeated resolution of one request is deterministic", () => {
    const resolve = createResolver(buildFixture())
    const request: EvidenceRequest = {
      operation: "get_contract_metrics",
      contract: "Month-to-Month",
    }
    const first = resolveEnvelope(resolve, request)
    const second = resolveEnvelope(resolve, request)
    assert.deepEqual(second, first)
    assert.deepEqual(
      second.facts.map((fact) => fact.id),
      first.facts.map((fact) => fact.id)
    )
    assert.deepEqual(
      second.facts.map((fact) => fact.citation.id),
      first.facts.map((fact) => fact.citation.id)
    )
    const fresh = resolveEnvelope(createResolver(buildFixture()), request)
    assert.deepEqual(fresh, first)
  })
})

describe("scope and caveats", () => {
  test("declares full-snapshot scope", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "get_kpi",
      metric: "total_customers",
    })
    assert.equal(envelope.scope.kind, "full_snapshot")
    assert.equal(envelope.snapshot, SNAPSHOT)
    assert.equal(envelope.scope.description.includes(`Full ${SNAPSHOT}`), true)
    assert.equal(envelope.scope.description.includes("all customers"), true)
  })

  test("includes the snapshot and joined-exclusion caveats", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "get_kpi",
      metric: "churn_rate_pct",
    })
    caveatContaining(envelope.caveats, "historical snapshot")
    caveatContaining(envelope.caveats, "not live customer data")
    const joined = caveatContaining(envelope.caveats, "454")
    assert.equal(joined.includes("Joined customers are excluded"), true)
  })

  test("includes the MRVL caveat for MRVL requests", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "get_kpi",
      metric: "mrvl",
    })
    const caveat = caveatContaining(envelope.caveats, "not historical revenue")
    assert.equal(caveat.toLowerCase().includes("mrvl"), true)
  })

  test("includes the total-includes-Joined caveat for total_customers", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "get_kpi",
      metric: "total_customers",
    })
    const caveat = caveatContaining(
      envelope.caveats,
      "Total customers includes"
    )
    assert.equal(caveat.includes("454"), true)
  })

  test("includes the share-of-churn caveat for pct_of_total_churn", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "get_contract_metrics",
      contract: "Month-to-Month",
    })
    const caveat = caveatContaining(envelope.caveats, "Share of churn")
    assert.equal(caveat.includes("1,869"), true)
  })
})

describe("canonical definitions", () => {
  test("resolves all four definitions", () => {
    const service = loadReal()
    for (const id of DEFINITION_IDS) {
      const definition = resolveDefinition(service.resolve, id)
      assert.equal(definition.id, id)
      assert.equal(definition.title.length > 0, true)
      assert.equal(definition.text.length > 0, true)
      assert.equal(definition.caveats.length > 0, true)
    }
  })

  test("versions document definitions separately from the payload", () => {
    const service = loadReal()
    for (const id of [
      "churn_rate",
      "retention_rate",
      "existing_customers",
    ] as const) {
      const definition = resolveDefinition(service.resolve, id)
      const source = expectRepositoryDocument(definition)
      assert.equal(source.versioning, "separate_from_payload")
      assert.equal(Object.hasOwn(source, "artifactSha256"), false)
      assert.equal(source.path.includes("churn_definition.md"), true)
      assert.equal(source.section.length > 0, true)
    }
  })

  test("binds the MRVL definition to the payload artifact", () => {
    const service = loadReal()
    const definition = resolveDefinition(service.resolve, "mrvl")
    const source = expectPayloadFieldSource(definition, service.artifact.sha256)
    assert.equal(source.section, "mrvl")
    assert.equal(source.field, "definition")
  })

  test("returns canonical formula text for each definition", () => {
    const service = loadReal()
    const texts: Record<DefinitionId, string> = {
      churn_rate: resolveDefinition(service.resolve, "churn_rate").text,
      retention_rate: resolveDefinition(service.resolve, "retention_rate").text,
      existing_customers: resolveDefinition(
        service.resolve,
        "existing_customers"
      ).text,
      mrvl: resolveDefinition(service.resolve, "mrvl").text,
    }
    assert.equal(
      texts.churn_rate.includes("Churned / (Churned + Stayed)"),
      true
    )
    assert.equal(
      texts.churn_rate.includes(
        "Joined customers are excluded from the denominator"
      ),
      true
    )
    assert.equal(
      texts.retention_rate.includes("Stayed / (Churned + Stayed)"),
      true
    )
    assert.equal(
      texts.existing_customers.includes(
        "Existing customers = Churned + Stayed"
      ),
      true
    )
    assert.equal(texts.mrvl.includes("SUM(Monthly Charge)"), true)
    assert.equal(texts.mrvl.includes("'Churned'"), true)
  })
})

describe("payload-cited MRVL definition provenance", () => {
  test("returns the exact text stored in payload.mrvl.definition", () => {
    const service = loadReal()
    const definition = resolveDefinition(service.resolve, "mrvl")
    const payload = readRealPayload()
    const mrvl = payload["mrvl"] as Record<string, unknown>
    assert.equal(definition.text, mrvl["definition"])
    expectPayloadFieldSource(definition, service.artifact.sha256)
  })

  test("changing the payload source text changes the returned definition", () => {
    const customText = "CUSTOM MRVL FORMULA FROM THE PAYLOAD"
    const resolve = createResolver(payloadWithMrvlDefinition(customText))
    const definition = resolveDefinition(resolve, "mrvl")
    assert.equal(definition.text, customText)
    assert.notEqual(definition.text, MRVL_DEFINITION_TEXT)
  })

  test("deleting the payload source cannot produce a successful citation", () => {
    const payloads = [
      payloadWithoutMrvlDefinition(),
      payloadWithoutMrvlSection(),
    ]
    const requests: unknown[] = [
      { operation: "get_definition", definition: "mrvl" },
      { operation: "get_kpi", metric: "mrvl" },
    ]
    for (const payload of payloads) {
      const resolve = createResolver(payload)
      for (const request of requests) {
        const result = resolve(request)
        const error = expectError(result)
        assert.equal(error.kind, "evidence")
        assert.equal(error.code, "unavailable_evidence")
        assert.equal(error.details?.field, "mrvl.definition")
        assert.equal("envelope" in result, false)
      }
    }
  })

  test("blank or non-string payload source text is invalid evidence", () => {
    for (const value of [
      "",
      "   ",
      42,
      null,
      { text: "SUM(Monthly Charge)" },
    ]) {
      const resolve = createResolver(payloadWithMrvlDefinition(value))
      const result = resolve({
        operation: "get_definition",
        definition: "mrvl",
      })
      const error = expectError(result)
      assert.equal(error.kind, "evidence")
      assert.equal(error.code, "invalid_evidence")
      assert.equal(error.details?.field, "mrvl.definition")
      assert.equal("envelope" in result, false)
    }
  })

  test("keeps explanatory caveats separate from the cited source text", () => {
    const service = loadReal()
    const envelope = resolveEnvelope(service.resolve, {
      operation: "get_definition",
      definition: "mrvl",
    })
    const definition = envelope.definitions[0]
    assert.equal(definition.text, MRVL_DEFINITION_TEXT)
    assert.ok(definition.caveats.length > 0)
    for (const caveat of definition.caveats) {
      assert.notEqual(caveat, definition.text)
      assert.equal(caveat.includes(definition.text), false)
    }
    for (const caveat of envelope.caveats) {
      assert.notEqual(caveat, definition.text)
    }
    assert.equal(
      definition.caveats.some((caveat) =>
        caveat.includes("not historical revenue")
      ),
      true
    )
  })
})

describe("no metric fallback", () => {
  test("get_kpi returns exactly the requested metric", () => {
    const service = loadReal()
    for (const metric of KPI_IDS) {
      const envelope = resolveEnvelope(service.resolve, {
        operation: "get_kpi",
        metric,
      })
      assert.equal(envelope.facts.length, 1)
      const fact = envelope.facts[0]
      assert.equal(fact.metric.id, metric)
      assert.equal(fact.value, KPI_VALUES[metric])
      assert.equal(
        envelope.facts.some((candidate) => candidate.metric.id !== metric),
        false
      )
    }
    const mrvl = singleFact(service.resolve, {
      operation: "get_kpi",
      metric: "mrvl",
    })
    assert.equal(mrvl.metric.id, "mrvl")
    assert.equal(mrvl.value, 137086.65)
  })

  test("rejects an unsupported metric without an envelope", () => {
    const service = loadReal()
    const result = service.resolve({
      operation: "get_kpi",
      metric: "average_tenure",
    })
    const error = expectError(result)
    assert.equal(error.kind, "request")
    assert.equal(error.code, "unsupported_metric")
    assert.equal("envelope" in result, false)
  })
})

describe("invalid evidence", () => {
  for (const invalidCase of INVALID_PAYLOAD_CASES) {
    test(`rejects ${invalidCase.name} with invalid_evidence`, () => {
      const created = createEvidenceResolver({
        payload: invalidCase.payload(),
        artifactSha256: ARTIFACT_SHA_A,
      })
      if (created.ok) {
        assert.fail(`expected invalid evidence for ${invalidCase.name}`)
      }
      assert.equal(created.error.kind, "evidence")
      assert.equal(created.error.code, "invalid_evidence")
    })
  }

  test("rejects malformed artifact SHA-256 values", () => {
    const payload = buildFixture()
    const malformed = [
      "abc",
      "a".repeat(63),
      "a".repeat(65),
      "A".repeat(64),
      "g".repeat(64),
    ]
    for (const artifactSha256 of malformed) {
      const created = createEvidenceResolver({ payload, artifactSha256 })
      if (created.ok) {
        assert.fail(`expected SHA-256 ${artifactSha256} to be rejected`)
      }
      assert.equal(created.error.kind, "evidence")
      assert.equal(created.error.code, "invalid_evidence")
    }
  })

  test("reports a structurally absent contract as unavailable evidence", () => {
    const fixture = buildFixture({
      contracts: ["Month-to-Month", "One Year"],
    })
    const resolve = createResolver(fixture)
    const available = resolveEnvelope(resolve, {
      operation: "get_contract_metrics",
      contract: "Month-to-Month",
    })
    assert.equal(available.facts.length, 5)
    const single = expectError(
      resolve({ operation: "get_contract_metrics", contract: "Two Year" })
    )
    assert.equal(single.kind, "evidence")
    assert.equal(single.code, "unavailable_evidence")
    assert.notEqual(single.code, "invalid_evidence")
    const comparison = expectError(
      resolve({
        operation: "compare_contracts",
        contracts: ["One Year", "Two Year"],
      })
    )
    assert.equal(comparison.kind, "evidence")
    assert.equal(comparison.code, "unavailable_evidence")
  })
})

describe("input purity", () => {
  test("does not mutate a frozen payload or a frozen request", () => {
    const payload = deepFreeze(buildFixture())
    const request = deepFreeze({
      operation: "compare_contracts",
      contracts: ["One Year", "Two Year"],
    } as const)
    const payloadBefore = JSON.stringify(payload)
    const requestBefore = JSON.stringify(request)
    const resolve = createResolver(payload)
    const envelope = resolveEnvelope(resolve, request)
    assert.equal(envelope.facts.length, 10)
    assert.equal(JSON.stringify(payload), payloadBefore)
    assert.equal(JSON.stringify(request), requestBefore)
    assert.equal(Object.isFrozen(payload), true)
    assert.equal(Object.isFrozen(request), true)
  })
})
