/**
 * Offline contract tests for the server-side retention copilot service.
 *
 * Every test injects a fake model transport, so nothing here touches a gateway.
 * Flow tests use the production evidence loader, which only reads the fixed
 * local aggregate artifact, while tie and failure seams use the in-memory byte
 * loader.
 * The service module must not perform network or filesystem work at import time.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { loadEvidenceFromBytes } from "../evidence/index.ts"
import type { LoadEvidenceResult } from "../evidence/index.ts"
import { createCopilotService, UNSUPPORTED_SCOPE_MESSAGE } from "./service.ts"
import type { CopilotService } from "./service.ts"
import type {
  CopilotAnswered,
  CopilotError,
  CopilotErrorCode,
  CopilotResult,
  CopilotUnsupported,
  ModelCallResult,
  ModelFailureCategory,
  ModelTransport,
} from "./types.ts"

const CREDENTIAL = "offline-test-credential"
const PAYLOAD_SOURCE = "data/processed/dashboard_payload.json"
const SNAPSHOT = "Q2 2022"
const QUESTION = "What is the overall churn rate?"

const CHURN_KPI_CONTENT = JSON.stringify({
  kind: "supported",
  request: { operation: "get_kpi", metric: "churn_rate_pct" },
})

type TransportSpy = {
  readonly transport: ModelTransport
  readonly callCount: () => number
  readonly questions: () => readonly string[]
}

type LoaderSpy = {
  readonly loader: () => LoadEvidenceResult
  readonly callCount: () => number
}

type SuccessOptions = {
  readonly status?: number
  readonly gatewayModel?: string | null
  readonly usage?: Readonly<Record<string, number>> | null
}

type ServiceOptions = {
  readonly loader?: LoaderSpy
  readonly credential?: string
  readonly now?: () => number
}

function fakeTransport(result: ModelCallResult): TransportSpy {
  const questions: string[] = []
  return {
    transport: async (question: string): Promise<ModelCallResult> => {
      questions.push(question)
      return result
    },
    callCount: () => questions.length,
    questions: () => questions,
  }
}

function fakeLoader(inner: () => LoadEvidenceResult): LoaderSpy {
  let calls = 0
  return {
    loader: () => {
      calls += 1
      return inner()
    },
    callCount: () => calls,
  }
}

function modelSuccess(
  content: string,
  options: SuccessOptions = {}
): ModelCallResult {
  return {
    ok: true,
    status: options.status ?? 200,
    content,
    usage: options.usage ?? null,
    gatewayModel: options.gatewayModel ?? null,
  }
}

function modelFailure(
  category: ModelFailureCategory,
  status: number | null = null
): ModelCallResult {
  return { ok: false, status, category, usage: null, gatewayModel: null }
}

function serviceWith(
  model: ModelCallResult,
  options: ServiceOptions = {}
): {
  readonly service: CopilotService
  readonly transport: TransportSpy
} {
  const transport = fakeTransport(model)
  const service = createCopilotService({
    credential: options.credential ?? CREDENTIAL,
    transport: transport.transport,
    loadEvidenceImpl: options.loader?.loader,
    now: options.now,
  })
  return { service, transport }
}

function expectError(
  result: CopilotResult,
  code: CopilotErrorCode
): CopilotError {
  if (result.kind !== "error") {
    assert.fail(`expected an error result, received ${result.kind}`)
  }
  assert.equal(result.code, code)
  assert.ok(result.message.length > 0)
  assert.equal(Object.hasOwn(result, "evidence"), false)
  return result
}

function expectAnswered(result: CopilotResult): CopilotAnswered {
  if (result.kind !== "answered") {
    assert.fail(`expected an answered result, received ${result.kind}`)
  }
  return result
}

function expectUnsupported(result: CopilotResult): CopilotUnsupported {
  if (result.kind !== "unsupported") {
    assert.fail(`expected an unsupported result, received ${result.kind}`)
  }
  return result
}

/**
 * Every fact citation must resolve to the semantic payload locator recorded on
 * that fact, and must be bound to the same artifact digest the envelope
 * reports. Payload-sourced definitions carry that digest on their source.
 */
function assertVerifiedCitations(result: CopilotAnswered): void {
  const artifact = result.evidence.artifact
  assert.equal(artifact.source, PAYLOAD_SOURCE)
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/)
  assert.equal(result.evidence.snapshot, SNAPSHOT)

  const citations = new Set<string>()
  for (const fact of result.evidence.facts) {
    assert.equal(fact.citation.artifactSha256, artifact.sha256)
    assert.equal(fact.citation.id.endsWith(`.${fact.metric.id}`), true)
    assert.equal(citations.has(fact.citation.id), false)
    citations.add(fact.citation.id)

    const locator = fact.locator
    const expected =
      locator.section === "kpis"
        ? `payload:kpis.${locator.field}`
        : `payload:by_contract[category="${locator.key.category}"].${locator.field}`
    assert.equal(fact.citation.id, expected)
  }

  for (const definition of result.evidence.definitions) {
    if (definition.source.kind === "payload_field") {
      assert.equal(definition.source.artifactSha256, artifact.sha256)
    }
  }
}

function contractRow(
  category: "Month-to-Month" | "One Year" | "Two Year",
  ratePct: number
): Record<string, string | number> {
  return {
    category,
    existing_customers: 100,
    churned_customers: 50,
    retained_customers: 50,
    churn_rate_pct: ratePct,
    pct_of_total_churn: 50,
  }
}

/** Complete minimal payload whose two highest churn rates are equal. */
function tiePayload(): unknown {
  return {
    metadata: { snapshot: SNAPSHOT },
    kpis: {
      total_customers: 300,
      existing_customers: 250,
      churned_customers: 50,
      retained_customers: 200,
      joined_customers: 50,
      churn_rate_pct: 50,
      retention_rate_pct: 50,
      mrvl: 1000,
    },
    by_contract: [
      contractRow("Month-to-Month", 10),
      contractRow("One Year", 50),
      contractRow("Two Year", 50),
    ],
  }
}

function payloadBytes(payload: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload))
}

test("rejects invalid question input before transport or evidence loading", async () => {
  const loader = fakeLoader(() => loadEvidenceFromBytes(null))
  const { service, transport } = serviceWith(modelSuccess(CHURN_KPI_CONTENT), {
    loader,
  })

  const invalidInputs: readonly unknown[] = [
    {},
    { question: "" },
    { question: "   " },
    { question: 5 },
    { question: "x".repeat(401) },
    { question: "a", filter: {} },
    null,
    "text",
  ]

  for (const input of invalidInputs) {
    expectError(await service.ask(input), "invalid_question")
  }

  assert.equal(transport.callCount(), 0)
  assert.equal(loader.callCount(), 0)

  const missingCredential = serviceWith(modelSuccess(CHURN_KPI_CONTENT), {
    credential: "",
    loader,
  })
  expectError(await missingCredential.service.ask({}), "invalid_question")
  assert.equal(missingCredential.transport.callCount(), 0)
  assert.equal(loader.callCount(), 0)
})

test("rejects a blank credential before any transport or evidence work", async () => {
  for (const credential of ["", "   ", "\t\n"]) {
    const loader = fakeLoader(() => loadEvidenceFromBytes(null))
    const { service, transport } = serviceWith(
      modelSuccess(CHURN_KPI_CONTENT),
      {
        credential,
        loader,
      }
    )

    expectError(await service.ask({ question: QUESTION }), "missing_credential")
    assert.equal(transport.callCount(), 0)
    assert.equal(loader.callCount(), 0)
  }
})

test("answers a supported churn-rate question from verified evidence", async () => {
  const usage = { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }
  const timestamps = [1_000, 1_042]
  let clockIndex = 0
  const { service, transport } = serviceWith(
    modelSuccess(CHURN_KPI_CONTENT, {
      gatewayModel: "free-churn-model",
      usage,
    }),
    {
      now: () => {
        const value = timestamps[clockIndex]
        clockIndex += 1
        return value
      },
    }
  )

  const answered = expectAnswered(
    await service.ask({ question: `  ${QUESTION}  ` })
  )

  assert.equal(answered.question, QUESTION)
  assert.deepEqual(answered.request, {
    operation: "get_kpi",
    metric: "churn_rate_pct",
  })
  assert.equal(answered.evidence.facts.length, 1)
  const fact = answered.evidence.facts[0]
  assert.ok(fact)
  assert.equal(fact.value, 28.37)
  assert.equal(fact.unit.kind, "percentage")

  assert.match(answered.answerText, /28\.37%/)
  assert.equal(answered.answerText.includes("2837"), false)
  assert.equal(answered.answerText.includes("0.2837"), false)
  assert.equal(answered.answerText.includes("IGNORE_ME"), false)

  assert.equal(answered.model.provider, "9router")
  assert.equal(answered.model.configuredRoute, "free-models")
  assert.equal(answered.model.gatewayReportedModel, "free-churn-model")
  assert.equal(answered.model.status, 200)
  assert.deepEqual(answered.model.usage, usage)
  assert.equal(answered.elapsedMs, 42)
  assert.equal(clockIndex, 2)

  assert.equal(transport.callCount(), 1)
  assert.deepEqual(transport.questions(), [QUESTION])
  assertVerifiedCitations(answered)
})

test("renders every Month-to-Month contract metric in the answer text", async () => {
  const content = JSON.stringify({
    kind: "supported",
    request: { operation: "get_contract_metrics", contract: "Month-to-Month" },
  })
  const { service, transport } = serviceWith(modelSuccess(content))

  const answered = expectAnswered(
    await service.ask({ question: "Show Month-to-Month contract metrics." })
  )

  assert.deepEqual(answered.request, {
    operation: "get_contract_metrics",
    contract: "Month-to-Month",
  })
  assert.equal(answered.evidence.facts.length, 5)

  const text = answered.answerText
  assert.equal(
    text.includes("Month-to-Month contract in the Q2 2022 full snapshot:"),
    true
  )
  assert.equal(text.includes("Existing Customers 3,202"), true)
  assert.equal(text.includes("Churned Customers 1,655"), true)
  assert.equal(text.includes("Retained Customers 1,547"), true)
  assert.equal(text.includes("Churn Rate 51.69%"), true)
  assert.equal(text.includes("Share of All Churn 88.55%"), true)

  assert.equal(transport.callCount(), 1)
  assertVerifiedCitations(answered)
})

test("compares One Year and Two Year without deriving a difference", async () => {
  const content = JSON.stringify({
    kind: "supported",
    request: {
      operation: "compare_contracts",
      contracts: ["One Year", "Two Year"],
    },
  })
  const { service, transport } = serviceWith(modelSuccess(content))

  const answered = expectAnswered(
    await service.ask({ question: "Compare One Year and Two Year churn." })
  )

  assert.deepEqual(answered.request, {
    operation: "compare_contracts",
    contracts: ["One Year", "Two Year"],
  })
  assert.equal(answered.evidence.facts.length, 10)

  const text = answered.answerText
  const lowered = text.toLowerCase()
  assert.equal(
    text.includes("One Year contract in the Q2 2022 full snapshot:"),
    true
  )
  assert.equal(
    text.includes("Two Year contract in the Q2 2022 full snapshot:"),
    true
  )
  assert.equal(text.includes("Existing Customers 1,526"), true)
  assert.equal(text.includes("Existing Customers 1,861"), true)
  assert.equal(text.includes("Churn Rate 10.88%"), true)
  assert.equal(text.includes("Churn Rate 2.58%"), true)
  assert.equal(lowered.includes("difference"), false)
  assert.equal(lowered.includes("delta"), false)

  const expectedValues: Readonly<
    Record<string, Readonly<Record<string, number>>>
  > = {
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
  for (const fact of answered.evidence.facts) {
    if (fact.scope.kind !== "contract") {
      assert.fail(`expected a contract-scoped fact, received ${fact.id}`)
    }
    const expected = expectedValues[fact.scope.contract]
    assert.ok(expected, `unexpected contract ${fact.scope.contract}`)
    assert.equal(fact.value, expected[fact.metric.id])
    assert.equal(fact.id, `contract:${fact.scope.contract}:${fact.metric.id}`)
  }

  assert.equal(transport.callCount(), 1)
  assertVerifiedCitations(answered)
})

test("selects Month-to-Month as the highest-churn contract", async () => {
  const { service, transport } = serviceWith(
    modelSuccess(
      JSON.stringify({
        kind: "supported",
        request: { operation: "highest_churn_contract" },
      })
    )
  )

  const answered = expectAnswered(
    await service.ask({ question: "Which contract has the highest churn?" })
  )

  assert.deepEqual(answered.request, { operation: "highest_churn_contract" })
  assert.equal(answered.evidence.facts.length, 1)
  const selection = answered.evidence.selection
  assert.ok(selection)
  assert.equal(selection.tie, false)
  assert.deepEqual(selection.contracts, ["Month-to-Month"])

  const text = answered.answerText
  assert.equal(
    text.includes("Highest churn rate in the Q2 2022 full snapshot:"),
    true
  )
  assert.equal(text.includes("Month-to-Month 51.69%"), true)
  assert.equal(text.includes("Tie"), false)

  assert.equal(transport.callCount(), 1)
  assertVerifiedCitations(answered)
})

test("reports a tie for the highest churn rate from an in-memory payload", async () => {
  const loader = fakeLoader(() =>
    loadEvidenceFromBytes(payloadBytes(tiePayload()))
  )
  const { service, transport } = serviceWith(
    modelSuccess(
      JSON.stringify({
        kind: "supported",
        request: { operation: "highest_churn_contract" },
      })
    ),
    { loader }
  )

  const answered = expectAnswered(
    await service.ask({
      question: "Which contract has the highest churn rate?",
    })
  )

  assert.equal(loader.callCount(), 1)
  assert.equal(answered.evidence.facts.length, 2)
  const selection = answered.evidence.selection
  assert.ok(selection)
  assert.equal(selection.tie, true)
  assert.deepEqual(selection.contracts, ["One Year", "Two Year"])

  const text = answered.answerText
  assert.equal(text.includes("Tie for the highest churn rate"), true)
  assert.equal(text.includes("One Year 50.00%"), true)
  assert.equal(text.includes("Two Year 50.00%"), true)
  assert.equal(text.includes("Month-to-Month"), false)

  assert.equal(transport.callCount(), 1)
  assertVerifiedCitations(answered)
})

test("returns the MRVL definition with its payload provenance", async () => {
  const content = JSON.stringify({
    kind: "supported",
    request: { operation: "get_definition", definition: "mrvl" },
  })
  const { service, transport } = serviceWith(modelSuccess(content))

  const answered = expectAnswered(
    await service.ask({ question: "What does MRVL mean?" })
  )

  assert.deepEqual(answered.request, {
    operation: "get_definition",
    definition: "mrvl",
  })
  assert.equal(answered.evidence.facts.length, 0)
  assert.equal(answered.evidence.definitions.length, 1)
  const definition = answered.evidence.definitions[0]
  assert.ok(definition)
  assert.equal(definition.id, "mrvl")
  assert.equal(definition.source.kind, "payload_field")

  const text = answered.answerText
  assert.equal(text.includes("Monthly Recurring Value Lost (MRVL)"), true)
  assert.equal(
    text.includes("SUM(Monthly Charge) WHERE Customer Status = 'Churned'"),
    true
  )
  assert.equal(text.includes("dashboard payload field mrvl.definition"), true)
  assert.equal(text.includes("artifact sha256"), true)
  assert.equal(text.includes("repository document"), false)

  assert.equal(transport.callCount(), 1)
  assertVerifiedCitations(answered)
})

test("returns the fixed unsupported-scope result without evidence", async () => {
  const { service, transport } = serviceWith(
    modelSuccess(
      JSON.stringify({ kind: "unsupported", reason: "unsupported_scope" })
    )
  )

  const unsupported = expectUnsupported(
    await service.ask({ question: "Will churn increase next quarter?" })
  )

  assert.equal(unsupported.reason, "unsupported_scope")
  assert.equal(unsupported.message, UNSUPPORTED_SCOPE_MESSAGE)
  assert.equal(Object.hasOwn(unsupported, "evidence"), false)
  assert.equal(Object.hasOwn(unsupported, "answerText"), false)
  assert.equal(unsupported.model.provider, "9router")
  assert.equal(unsupported.model.configuredRoute, "free-models")
  assert.equal(unsupported.model.status, 200)
  assert.equal(transport.callCount(), 1)
})

test("rejects malformed or non-envelope model output", async () => {
  const validRequest = { operation: "get_kpi", metric: "churn_rate_pct" }
  const cases: readonly string[] = [
    JSON.stringify({ kind: "supported", request: validRequest, extra: 1 }),
    JSON.stringify({
      kind: "supported",
      request: validRequest,
      reason: "unsupported_scope",
    }),
    JSON.stringify({ kind: "maybe" }),
    JSON.stringify({ kind: "unsupported", reason: "unsupported" }),
    "not json",
    "",
    "[]",
  ]

  for (const content of cases) {
    const { service, transport } = serviceWith(modelSuccess(content))
    expectError(
      await service.ask({ question: QUESTION }),
      "invalid_model_output"
    )
    assert.equal(transport.callCount(), 1)
  }
})

test("rejects a valid envelope carrying an invalid nested request", async () => {
  const cases: readonly string[] = [
    JSON.stringify({
      kind: "supported",
      request: { operation: "get_kpi", metric: "revenue" },
    }),
    JSON.stringify({
      kind: "supported",
      request: {
        operation: "get_kpi",
        metric: "churn_rate_pct",
        filter: {},
      },
    }),
  ]

  for (const content of cases) {
    const { service, transport } = serviceWith(modelSuccess(content))
    expectError(await service.ask({ question: QUESTION }), "invalid_request")
    assert.equal(transport.callCount(), 1)
  }
})

test("maps every transport failure category to its sanitized error code", async () => {
  const failureCases: readonly (readonly [
    ModelFailureCategory,
    number | null,
    CopilotErrorCode,
  ])[] = [
    ["connectivity", null, "model_connectivity"],
    ["timeout", null, "model_timeout"],
    ["aborted", null, "model_timeout"],
    ["redirect_rejected", 302, "model_redirect"],
    ["rate_limit", 429, "model_rate_limit"],
    ["http_error", 503, "model_http_error"],
    ["invalid_provider_response", 200, "model_response"],
    ["body_read_failed", 200, "model_response"],
    ["truncated_completion", null, "model_truncated"],
    ["empty_content", null, "model_empty"],
    ["response_too_large", null, "model_response_too_large"],
  ]

  for (const [category, status, expectedCode] of failureCases) {
    const { service, transport } = serviceWith(modelFailure(category, status))
    const error = expectError(
      await service.ask({ question: QUESTION }),
      expectedCode
    )
    assert.equal(transport.callCount(), 1)
    assert.equal(JSON.stringify(error).includes("secret"), false)
    if (status === null) {
      assert.equal(Object.hasOwn(error, "details"), false)
    } else {
      assert.deepEqual(error.details, { status })
    }
  }
})

test("maps a transport-level response size cap to model_response_too_large", async () => {
  const { service, transport } = serviceWith(
    modelFailure("response_too_large", null)
  )

  const error = expectError(
    await service.ask({ question: QUESTION }),
    "model_response_too_large"
  )
  assert.equal(transport.callCount(), 1)
  assert.equal(Object.hasOwn(error, "details"), false)
})

test("reports unavailable evidence before calling the transport", async () => {
  const loader = fakeLoader(() => loadEvidenceFromBytes(null))
  const { service, transport } = serviceWith(modelSuccess(CHURN_KPI_CONTENT), {
    loader,
  })

  const error = expectError(
    await service.ask({ question: QUESTION }),
    "evidence_unavailable"
  )
  assert.equal(loader.callCount(), 1)
  assert.equal(transport.callCount(), 0)
  assert.equal(error.details?.evidenceCode, "unavailable_evidence")
  assert.equal(Object.hasOwn(error, "evidence"), false)
})

test("reports invalid evidence payloads before calling the transport", async () => {
  const invalidPayloads: readonly Uint8Array[] = [
    new TextEncoder().encode("{}"),
    new TextEncoder().encode("not json{"),
  ]

  for (const bytes of invalidPayloads) {
    const loader = fakeLoader(() => loadEvidenceFromBytes(bytes))
    const { service, transport } = serviceWith(
      modelSuccess(CHURN_KPI_CONTENT),
      {
        loader,
      }
    )

    const error = expectError(
      await service.ask({ question: QUESTION }),
      "evidence_invalid"
    )
    assert.equal(loader.callCount(), 1)
    assert.equal(transport.callCount(), 0)
    assert.equal(error.details?.evidenceCode, "invalid_evidence")
    assert.equal(Object.hasOwn(error, "evidence"), false)
  }
})

test("binds citations to the verified artifact for every answered operation", async () => {
  const contents: readonly string[] = [
    CHURN_KPI_CONTENT,
    JSON.stringify({
      kind: "supported",
      request: { operation: "get_contract_metrics", contract: "One Year" },
    }),
    JSON.stringify({
      kind: "supported",
      request: {
        operation: "compare_contracts",
        contracts: ["One Year", "Two Year"],
      },
    }),
    JSON.stringify({
      kind: "supported",
      request: { operation: "highest_churn_contract" },
    }),
    JSON.stringify({
      kind: "supported",
      request: { operation: "get_definition", definition: "mrvl" },
    }),
  ]

  for (const content of contents) {
    const { service } = serviceWith(modelSuccess(content))
    const answered = expectAnswered(await service.ask({ question: QUESTION }))
    assertVerifiedCitations(answered)
  }
})

test("keeps configured provenance regardless of the gateway-reported model", async () => {
  const usage = { total_tokens: 5 }
  const { service } = serviceWith(
    modelSuccess(CHURN_KPI_CONTENT, {
      gatewayModel: "evil-model",
      usage,
    })
  )

  const answered = expectAnswered(await service.ask({ question: QUESTION }))

  assert.equal(answered.model.provider, "9router")
  assert.equal(answered.model.configuredRoute, "free-models")
  assert.equal(answered.model.gatewayReportedModel, "evil-model")
  assert.equal(answered.model.status, 200)
  assert.deepEqual(answered.model.usage, usage)
  assert.equal(answered.answerText.includes("evil-model"), false)
  assert.equal(answered.question.includes("evil-model"), false)
  assert.deepEqual(answered.request, {
    operation: "get_kpi",
    metric: "churn_rate_pct",
  })
})

test("importing the service module performs no network activity", async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = () => {
    fetchCalls += 1
    throw new Error("network access attempted during import")
  }

  try {
    const moduleUrl = new URL("./service.ts?import-probe", import.meta.url).href
    const imported: unknown = await import(moduleUrl)
    assert.ok(imported)
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(fetchCalls, 0)
  assert.equal(globalThis.fetch, originalFetch)
})
