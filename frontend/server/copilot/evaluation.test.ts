/**
 * Offline tests for copilot evaluation scoring and summary aggregation.
 *
 * Every expected evidence envelope is resolved through the real fixed payload
 * via `loadEvidence()` (a local read only, no network, no model calls). Cases
 * are synthetic `EvaluationCase` objects so the scorer is tested independently
 * of the dataset agent. Negative fixtures are built by copying and mutating
 * real resolved envelopes, never by weakening the expectations.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { loadEvidence } from "../evidence/index.ts"
import type {
  EvidenceEnvelope,
  EvidenceRequest,
  EvidenceResolver,
  EvidenceService,
} from "../evidence/index.ts"
import { formatAnswer } from "./format.ts"
import {
  scoreCaseOutcome,
  summarizeEvaluation,
  unattemptedScore,
} from "./evaluation/scoring.ts"
import type { CaseScore } from "./evaluation/scoring.ts"
import type {
  EvaluationCase,
  EvaluationCategory,
  EvidenceLocator,
  ScoredClassification,
} from "./evaluation/types.ts"
import { CONFIGURED_PROVIDER, CONFIGURED_ROUTE } from "./types.ts"
import type {
  CopilotAnswered,
  CopilotError,
  CopilotErrorCode,
  CopilotUnsupported,
  ModelMetadata,
} from "./types.ts"

const QUESTION = "What is the overall churn rate for this synthetic case?"
const UNSUPPORTED_MESSAGE =
  "Supported scope covers KPIs, contract metrics, comparisons, highest churn, and definitions only."
const FIXTURE_USAGE = {
  prompt_tokens: 120,
  completion_tokens: 30,
  total_tokens: 150,
} as const

const CHURN_RATE_REQUEST: EvidenceRequest = {
  operation: "get_kpi",
  metric: "churn_rate_pct",
}
const ONE_YEAR_REQUEST: EvidenceRequest = {
  operation: "get_contract_metrics",
  contract: "One Year",
}
const COMPARISON_REQUEST: EvidenceRequest = {
  operation: "compare_contracts",
  contracts: ["One Year", "Two Year"],
}
const REVERSED_COMPARISON_REQUEST: EvidenceRequest = {
  operation: "compare_contracts",
  contracts: ["Two Year", "One Year"],
}

function loadService(): EvidenceService {
  const loaded = loadEvidence()
  if (!loaded.ok) {
    assert.fail(`loadEvidence() failed: ${JSON.stringify(loaded.error)}`)
  }
  return loaded.service
}

const service = loadService()
const resolver: EvidenceResolver = service.resolve

/** Any call means the scorer resolved evidence when it must not have. */
const throwingResolver: EvidenceResolver = () => {
  throw new Error("the scorer must not resolve evidence in this scenario")
}

function model(overrides: Partial<ModelMetadata> = {}): ModelMetadata {
  return {
    provider: CONFIGURED_PROVIDER,
    configuredRoute: CONFIGURED_ROUTE,
    status: 200,
    gatewayReportedModel: "gateway-alpha",
    usage: FIXTURE_USAGE,
    ...overrides,
  }
}

function resolveEnvelope(request: EvidenceRequest): EvidenceEnvelope {
  const result = service.resolve(request)
  if (!result.ok) {
    assert.fail(
      `expected evidence for ${JSON.stringify(request)}, received ${JSON.stringify(result.error)}`
    )
  }
  return result.envelope
}

function answeredFrom(
  evidence: EvidenceEnvelope,
  overrides: Partial<CopilotAnswered> = {}
): CopilotAnswered {
  return {
    kind: "answered",
    question: QUESTION,
    answerText: formatAnswer(evidence),
    request: evidence.request,
    evidence,
    model: model(),
    elapsedMs: 250,
    ...overrides,
  }
}

function answeredResult(
  request: EvidenceRequest,
  overrides: Partial<CopilotAnswered> = {}
): CopilotAnswered {
  return answeredFrom(resolveEnvelope(request), overrides)
}

function unsupportedResult(
  overrides: Partial<CopilotUnsupported> = {}
): CopilotUnsupported {
  return {
    kind: "unsupported",
    question: QUESTION,
    reason: "unsupported_scope",
    message: UNSUPPORTED_MESSAGE,
    model: model(),
    elapsedMs: 175,
    ...overrides,
  }
}

function errorResult(code: CopilotErrorCode): CopilotError {
  return {
    kind: "error",
    code,
    message: "The copilot failed before producing an answer.",
  }
}

function answeredCase(input: {
  readonly id: string
  readonly requests: readonly EvidenceRequest[]
  readonly category?: EvaluationCategory
  readonly assertions?: readonly EvidenceLocator[]
}): EvaluationCase {
  return {
    id: input.id,
    category: input.category ?? "supported_paraphrase",
    question: `${QUESTION} (${input.id})`,
    expectedDisposition: "answered",
    acceptableRequests: input.requests,
    evidenceAssertions: input.assertions ?? [],
    rationale: "Synthetic fixture exercising the offline scorer.",
    origin: "new_evaluation_example",
  }
}

function unsupportedCase(id: string): EvaluationCase {
  return {
    id,
    category: "unsupported_scope",
    question: `${QUESTION} (${id})`,
    expectedDisposition: "unsupported",
    acceptableRequests: [],
    evidenceAssertions: [],
    rationale: "Synthetic unsupported-scope fixture.",
    origin: "new_evaluation_example",
  }
}

/** Build a score through the real scorer and require that it passes. */
function passingScore(
  id: string,
  request: EvidenceRequest,
  overrides: Partial<CopilotAnswered> = {}
): CaseScore {
  const score = scoreCaseOutcome({
    testCase: answeredCase({ id, requests: [request] }),
    result: answeredResult(request, overrides),
    resolver,
  })
  assert.equal(score.classification, "correct", `${id} fixture must pass`)
  return score
}

test("scores a correct answered case against the real expected evidence", () => {
  const testCase = answeredCase({
    id: "answered-kpi-churn-rate",
    requests: [CHURN_RATE_REQUEST],
    assertions: [{ section: "kpis", field: "churn_rate_pct" }],
  })
  const result = answeredResult(CHURN_RATE_REQUEST)
  const score = scoreCaseOutcome({ testCase, result, resolver })

  assert.equal(score.caseId, "answered-kpi-churn-rate")
  assert.equal(score.category, "supported_paraphrase")
  assert.equal(score.expectedDisposition, "answered")
  assert.equal(score.actualDisposition, "answered")
  assert.equal(score.classification, "correct")
  assert.equal(score.passed, true)
  assert.deepEqual(score.request, CHURN_RATE_REQUEST)
  assert.equal(score.elapsedMs, 250)
  assert.equal(score.gatewayModel, "gateway-alpha")
  assert.deepEqual(score.usage, FIXTURE_USAGE)
  assert.equal(score.answerText, formatAnswer(result.evidence))
  assert.ok(score.answerText?.includes("28.37%"))
  assert.deepEqual(score.citations, ["payload:kpis.churn_rate_pct"])
  assert.equal(score.artifactSha256, service.artifact.sha256)
  assert.match(score.detail, /verified the deterministic evidence/)
})

test("fails a schema-valid but wrong request as a routing failure", () => {
  const testCase = answeredCase({
    id: "routing-failure",
    requests: [CHURN_RATE_REQUEST],
    assertions: [{ section: "kpis", field: "churn_rate_pct" }],
  })
  const wrong = answeredResult({ operation: "highest_churn_contract" })
  const score = scoreCaseOutcome({
    testCase,
    result: wrong,
    resolver: throwingResolver,
  })

  assert.equal(score.classification, "semantic_routing_failure")
  assert.equal(score.passed, false)
  assert.equal(score.actualDisposition, "answered")
  assert.deepEqual(score.request, { operation: "highest_churn_contract" })
  assert.equal(score.answerText, wrong.answerText)
})

test("fails when the right request carries values from the wrong contract", () => {
  const testCase = answeredCase({
    id: "cross-wired-values",
    requests: [ONE_YEAR_REQUEST],
  })
  const expected = resolveEnvelope(ONE_YEAR_REQUEST)
  const twoYear = resolveEnvelope({
    operation: "get_contract_metrics",
    contract: "Two Year",
  })
  const twoYearRateFact = twoYear.facts.find(
    (fact) => fact.metric.id === "churn_rate_pct"
  )
  if (twoYearRateFact === undefined) {
    assert.fail("the Two Year envelope is missing its churn rate fact")
  }
  const wrongEvidence: EvidenceEnvelope = {
    ...expected,
    facts: expected.facts.map((fact) =>
      fact.metric.id === "churn_rate_pct"
        ? { ...fact, value: twoYearRateFact.value }
        : fact
    ),
  }

  const score = scoreCaseOutcome({
    testCase,
    result: answeredFrom(wrongEvidence),
    resolver,
  })
  assert.equal(score.classification, "evidence_answer_mismatch")
  assert.equal(score.passed, false)
  assert.equal(score.actualDisposition, "answered")
})

test("fails on a wrong citation id or artifact sha256", () => {
  const testCase = answeredCase({
    id: "citation-integrity",
    requests: [CHURN_RATE_REQUEST],
  })
  const expected = resolveEnvelope(CHURN_RATE_REQUEST)

  const forgedCitation: EvidenceEnvelope = {
    ...expected,
    facts: expected.facts.map((fact) => ({
      ...fact,
      citation: { ...fact.citation, id: "payload:forged" },
    })),
  }
  const citationScore = scoreCaseOutcome({
    testCase,
    result: answeredFrom(forgedCitation),
    resolver,
  })
  assert.equal(citationScore.classification, "evidence_answer_mismatch")
  assert.equal(citationScore.passed, false)

  const forgedArtifact: EvidenceEnvelope = {
    ...expected,
    artifact: { ...expected.artifact, sha256: "f".repeat(64) },
  }
  const artifactScore = scoreCaseOutcome({
    testCase,
    result: answeredFrom(forgedArtifact),
    resolver,
  })
  assert.equal(artifactScore.classification, "evidence_answer_mismatch")

  const forgedCitationSha: EvidenceEnvelope = {
    ...expected,
    facts: expected.facts.map((fact) => ({
      ...fact,
      citation: { ...fact.citation, artifactSha256: "e".repeat(64) },
    })),
  }
  const citationShaScore = scoreCaseOutcome({
    testCase,
    result: answeredFrom(forgedCitationSha),
    resolver,
  })
  assert.equal(citationShaScore.classification, "evidence_answer_mismatch")
})

test("fails on a missing or extra fact", () => {
  const testCase = answeredCase({
    id: "fact-integrity",
    requests: [ONE_YEAR_REQUEST],
  })
  const expected = resolveEnvelope(ONE_YEAR_REQUEST)
  assert.equal(expected.facts.length, 5)

  const missingFact: EvidenceEnvelope = {
    ...expected,
    facts: expected.facts.slice(0, 4),
  }
  const missingScore = scoreCaseOutcome({
    testCase,
    result: answeredFrom(missingFact),
    resolver,
  })
  assert.equal(missingScore.classification, "evidence_answer_mismatch")
  assert.equal(missingScore.passed, false)

  const extraFact: EvidenceEnvelope = {
    ...expected,
    facts: [...expected.facts, expected.facts[0]],
  }
  const extraScore = scoreCaseOutcome({
    testCase,
    result: answeredFrom(extraFact),
    resolver,
  })
  assert.equal(extraScore.classification, "evidence_answer_mismatch")
})

test("passes a correct unsupported refusal for an expected-unsupported case", () => {
  const testCase = unsupportedCase("supported-refusal")
  const score = scoreCaseOutcome({
    testCase,
    result: unsupportedResult(),
    resolver: throwingResolver,
  })

  assert.equal(score.classification, "correct")
  assert.equal(score.passed, true)
  assert.equal(score.actualDisposition, "unsupported")
  assert.equal(score.request, null)
  assert.equal(score.elapsedMs, 175)
  assert.equal(score.gatewayModel, "gateway-alpha")
  assert.deepEqual(score.usage, FIXTURE_USAGE)
  assert.equal(score.answerText, null)
  assert.deepEqual(score.citations, [])
  assert.equal(score.artifactSha256, null)
})

test("fails an answered result for an expected-unsupported case", () => {
  const testCase = unsupportedCase("scope-acceptance")
  const score = scoreCaseOutcome({
    testCase,
    result: answeredResult(CHURN_RATE_REQUEST),
    resolver: throwingResolver,
  })

  assert.equal(score.classification, "unsupported_scope_acceptance")
  assert.equal(score.passed, false)
  assert.equal(score.actualDisposition, "answered")
  assert.equal(score.expectedDisposition, "unsupported")
})

test("fails an unsupported result for an expected-answered case as an incorrect refusal", () => {
  const testCase = answeredCase({
    id: "incorrect-refusal",
    requests: [CHURN_RATE_REQUEST],
  })
  const score = scoreCaseOutcome({
    testCase,
    result: unsupportedResult({ elapsedMs: 90 }),
    resolver: throwingResolver,
  })

  assert.equal(score.classification, "incorrect_refusal")
  assert.equal(score.passed, false)
  assert.equal(score.actualDisposition, "unsupported")
  assert.equal(score.request, null)
  assert.equal(score.elapsedMs, 90)
})

test("accepts a reversed compare_contracts order as equivalent", () => {
  const testCase = answeredCase({
    id: "comparison-order",
    category: "comparison_ranking",
    requests: [COMPARISON_REQUEST],
  })
  const score = scoreCaseOutcome({
    testCase,
    result: answeredResult(REVERSED_COMPARISON_REQUEST),
    resolver,
  })

  assert.equal(score.classification, "correct")
  assert.equal(score.passed, true)
  assert.deepEqual(score.request, REVERSED_COMPARISON_REQUEST)
})

test("does not pass an incomplete or blocked run", () => {
  const passingA = passingScore("full-a", CHURN_RATE_REQUEST)
  const passingB = passingScore("full-b", CHURN_RATE_REQUEST)

  const complete = summarizeEvaluation({
    scores: [passingA, passingB],
    planned: 2,
    mode: "live",
    stoppedReason: null,
  })
  assert.equal(complete.attempted, 2)
  assert.equal(complete.completed, 2)
  assert.equal(complete.correct, 2)
  assert.equal(complete.fullRun, true)
  assert.equal(complete.passed, true)
  assert.equal(complete.exitCode, 0)
  assert.equal(complete.strictPassRate, 1)
  assert.equal(complete.strictPassRateDenominator, "planned")
  assert.equal(complete.configuredRoute, CONFIGURED_ROUTE)

  const blocked = summarizeEvaluation({
    scores: [passingA, passingB],
    planned: 4,
    mode: "live",
    stoppedReason: "model_timeout",
  })
  assert.equal(blocked.attempted, 2)
  assert.equal(blocked.unattempted, 2)
  assert.equal(blocked.fullRun, false)
  assert.equal(blocked.passed, false)
  assert.equal(blocked.exitCode, 1)

  const failing = scoreCaseOutcome({
    testCase: answeredCase({
      id: "full-failure",
      requests: [CHURN_RATE_REQUEST],
    }),
    result: answeredResult({ operation: "highest_churn_contract" }),
    resolver: throwingResolver,
  })
  assert.equal(failing.classification, "semantic_routing_failure")
  const partial = summarizeEvaluation({
    scores: [passingA, failing],
    planned: 2,
    mode: "live",
    stoppedReason: null,
  })
  assert.equal(partial.fullRun, true)
  assert.equal(partial.correct, 1)
  assert.equal(partial.failed, 1)
  assert.equal(partial.passed, false)
  assert.equal(partial.exitCode, 1)
  assert.equal(partial.strictPassRate, 0.5)

  const offline = summarizeEvaluation({
    scores: [passingA],
    planned: 1,
    mode: "offline",
    stoppedReason: null,
    configuredRoute: "custom-route",
  })
  assert.equal(offline.mode, "offline")
  assert.equal(offline.configuredRoute, "custom-route")
  assert.equal(offline.exitCode, 0)
})

test("keeps operational and malformed errors in the attempted denominators", () => {
  const codes: readonly (readonly [CopilotErrorCode, ScoredClassification])[] =
    [
      ["missing_credential", "operational_error"],
      ["model_timeout", "operational_error"],
      ["evidence_unavailable", "operational_error"],
      ["invalid_model_output", "malformed_model_response"],
      ["invalid_request", "malformed_model_response"],
    ]
  const scores: CaseScore[] = []
  for (const [code, expectedClassification] of codes) {
    const testCase = answeredCase({
      id: `error-${code}`,
      requests: [CHURN_RATE_REQUEST],
    })
    const score = scoreCaseOutcome({
      testCase,
      result: errorResult(code),
      resolver: throwingResolver,
    })

    assert.equal(score.actualDisposition, "error")
    assert.equal(score.classification, expectedClassification)
    assert.equal(score.passed, false)
    assert.equal(score.request, null)
    assert.equal(score.elapsedMs, null)
    assert.equal(score.gatewayModel, null)
    assert.equal(score.usage, null)
    assert.equal(score.answerText, null)
    assert.deepEqual(score.citations, [])
    assert.equal(score.artifactSha256, null)
    scores.push(score)
  }

  const summary = summarizeEvaluation({
    scores,
    planned: scores.length,
    mode: "live",
    stoppedReason: null,
  })
  assert.equal(summary.attempted, 5)
  assert.equal(summary.unattempted, 0)
  assert.equal(summary.correct, 0)
  assert.equal(summary.failed, 5)
  assert.equal(summary.completed, 2)
  assert.equal(summary.invalidOutputCount, 2)
  assert.equal(summary.operationalErrorCount, 3)
  assert.equal(summary.supportedAttempted, 5)
  assert.equal(summary.supportedAccuracy, 0)
  assert.equal(summary.passed, false)
  assert.equal(summary.exitCode, 1)
})

test("keeps gateway model identity per case and counts its distribution", () => {
  const alpha = passingScore("model-alpha", CHURN_RATE_REQUEST, {
    model: model({ gatewayReportedModel: "gateway-alpha" }),
  })
  const beta = passingScore("model-beta", CHURN_RATE_REQUEST, {
    model: model({ gatewayReportedModel: "gateway-beta" }),
  })
  const unknown = passingScore("model-unknown", CHURN_RATE_REQUEST, {
    model: model({ gatewayReportedModel: null }),
  })

  assert.equal(alpha.gatewayModel, "gateway-alpha")
  assert.equal(beta.gatewayModel, "gateway-beta")
  assert.equal(unknown.gatewayModel, null)

  const summary = summarizeEvaluation({
    scores: [alpha, beta, unknown],
    planned: 3,
    mode: "live",
    stoppedReason: null,
  })
  assert.equal(summary.attempted, 3)
  assert.deepEqual(summary.modelDistribution, {
    "gateway-alpha": 1,
    "gateway-beta": 1,
    unknown: 1,
  })
})

test("computes latency, token, coverage, and category statistics", () => {
  const latencyScores = [
    passingScore("latency-1", CHURN_RATE_REQUEST, {
      elapsedMs: 10,
      model: model({
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    }),
    passingScore("latency-2", CHURN_RATE_REQUEST, {
      elapsedMs: 20,
      model: model({
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }),
    }),
    passingScore("latency-3", CHURN_RATE_REQUEST, {
      elapsedMs: 30,
      model: model({ usage: null }),
    }),
    passingScore("latency-4", CHURN_RATE_REQUEST, {
      elapsedMs: 40,
      model: model({ usage: null }),
    }),
  ]
  const unattempted = unattemptedScore(
    answeredCase({ id: "latency-unattempted", requests: [CHURN_RATE_REQUEST] })
  )
  assert.equal(unattempted.classification, "unattempted")
  assert.equal(unattempted.actualDisposition, "unattempted")
  assert.equal(unattempted.passed, false)
  assert.equal(unattempted.elapsedMs, null)

  const summary = summarizeEvaluation({
    scores: [...latencyScores, unattempted],
    planned: 5,
    mode: "live",
    stoppedReason: null,
  })

  assert.equal(summary.attempted, 4)
  assert.equal(summary.unattempted, 1)
  assert.equal(summary.fullRun, false)
  assert.equal(summary.exitCode, 1)
  assert.deepEqual(summary.latencyMs, {
    median: 25,
    p95: 40,
    sampleCount: 4,
    convention: "nearest-rank",
  })
  assert.deepEqual(summary.tokens, {
    prompt: 30,
    completion: 15,
    total: 45,
    usageCoverage: 0.5,
  })
  assert.equal(summary.correct, 4)
  assert.equal(summary.failed, 0)
  assert.equal(summary.strictPassRate, 0.8)
  assert.equal(summary.byCategory.supported_paraphrase.planned, 5)
  assert.equal(summary.byCategory.supported_paraphrase.attempted, 4)
  assert.equal(summary.byCategory.supported_paraphrase.correct, 4)
})

test("importing the scoring module performs no fetch", async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = () => {
    fetchCalls += 1
    throw new Error("network access attempted during module import")
  }

  try {
    const specifier = new URL(
      "./evaluation/scoring.ts?import-probe",
      import.meta.url
    ).href
    const imported: unknown = await import(specifier)
    assert.ok(imported)
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(globalThis.fetch, originalFetch)
})

type MutableEvidence = {
  facts: Array<{
    metric: { id: string; label: string }
    value: number
  }>
  definitions: Array<{ id: string; caveats: string[] }>
  caveats: string[]
  selection?: { metric: string; contracts: string[]; tie: boolean }
  [key: string]: unknown
}

function mutableEnvelope(evidence: EvidenceEnvelope): MutableEvidence {
  return JSON.parse(JSON.stringify(evidence)) as MutableEvidence
}

function corruptEnvelope(
  evidence: EvidenceEnvelope,
  mutate: (mutable: MutableEvidence) => void
): EvidenceEnvelope {
  const mutable = mutableEnvelope(evidence)
  mutate(mutable)
  return mutable as unknown as EvidenceEnvelope
}

test("fails a fact whose metric id was corrupted even with a regenerated answer", () => {
  const request: EvidenceRequest = { operation: "get_kpi", metric: "mrvl" }
  const expected = resolveEnvelope(request)
  const corrupted = corruptEnvelope(expected, (mutable) => {
    mutable.facts[0].metric.id = "churn_rate_pct"
  })
  const score = scoreCaseOutcome({
    testCase: answeredCase({ id: "corrupt-metric-id", requests: [request] }),
    result: answeredFrom(corrupted),
    resolver,
  })
  assert.equal(score.classification, "evidence_answer_mismatch")
  assert.equal(score.passed, false)
  assert.match(score.detail, /fact value differs/)
})

test("fails a fact whose metric label was corrupted even with a regenerated answer", () => {
  const expected = resolveEnvelope(CHURN_RATE_REQUEST)
  const corrupted = corruptEnvelope(expected, (mutable) => {
    mutable.facts[0].metric.label = "Retention Rate"
  })
  const score = scoreCaseOutcome({
    testCase: answeredCase({
      id: "corrupt-metric-label",
      requests: [CHURN_RATE_REQUEST],
    }),
    result: answeredFrom(corrupted),
    resolver,
  })
  assert.equal(score.classification, "evidence_answer_mismatch")
  assert.equal(score.passed, false)
  assert.match(score.detail, /fact value differs/)
})

test("fails when an envelope caveat is removed", () => {
  const expected = resolveEnvelope(CHURN_RATE_REQUEST)
  const corrupted = corruptEnvelope(expected, (mutable) => {
    mutable.caveats.pop()
  })
  const score = scoreCaseOutcome({
    testCase: answeredCase({
      id: "missing-envelope-caveat",
      requests: [CHURN_RATE_REQUEST],
    }),
    result: answeredFrom(corrupted),
    resolver,
  })
  assert.equal(score.classification, "evidence_answer_mismatch")
  assert.equal(score.passed, false)
  assert.match(score.detail, /envelope caveats count differs/)
})

test("fails when a definition caveat is removed", () => {
  const request: EvidenceRequest = {
    operation: "get_definition",
    definition: "churn_rate",
  }
  const expected = resolveEnvelope(request)
  const corrupted = corruptEnvelope(expected, (mutable) => {
    mutable.definitions[0].caveats.pop()
  })
  const score = scoreCaseOutcome({
    testCase: answeredCase({
      id: "missing-definition-caveat",
      requests: [request],
    }),
    result: answeredFrom(corrupted),
    resolver,
  })
  assert.equal(score.classification, "evidence_answer_mismatch")
  assert.equal(score.passed, false)
  assert.match(score.detail, /definition content differs/)
})

test("fails when the highest-churn selection names different contracts", () => {
  const request: EvidenceRequest = { operation: "highest_churn_contract" }
  const expected = resolveEnvelope(request)
  assert.ok(expected.selection)
  const corrupted = corruptEnvelope(expected, (mutable) => {
    if (mutable.selection === undefined) {
      throw new Error("expected a highest-churn selection")
    }
    mutable.selection.contracts = ["Two Year"]
  })
  const score = scoreCaseOutcome({
    testCase: answeredCase({
      id: "corrupt-selection-contracts",
      requests: [request],
    }),
    result: answeredFrom(corrupted),
    resolver,
  })
  assert.equal(score.classification, "evidence_answer_mismatch")
  assert.equal(score.passed, false)
  assert.match(score.detail, /selection contracts/)
})

test("fails when the highest-churn selection tie status changes", () => {
  const request: EvidenceRequest = { operation: "highest_churn_contract" }
  const expected = resolveEnvelope(request)
  assert.ok(expected.selection)
  const corrupted = corruptEnvelope(expected, (mutable) => {
    if (mutable.selection === undefined) {
      throw new Error("expected a highest-churn selection")
    }
    mutable.selection.tie = !mutable.selection.tie
  })
  const score = scoreCaseOutcome({
    testCase: answeredCase({
      id: "corrupt-selection-tie",
      requests: [request],
    }),
    result: answeredFrom(corrupted),
    resolver,
  })
  assert.equal(score.classification, "evidence_answer_mismatch")
  assert.equal(score.passed, false)
  assert.match(score.detail, /selection tie status/)
})

test("accepts a valid reversed two-contract comparison", () => {
  const testCase = answeredCase({
    id: "reversed-comparison",
    requests: [COMPARISON_REQUEST],
    category: "comparison_ranking",
  })
  const result = answeredFrom(resolveEnvelope(REVERSED_COMPARISON_REQUEST))
  const score = scoreCaseOutcome({ testCase, result, resolver })
  assert.equal(score.classification, "correct", score.detail)
  assert.equal(score.passed, true)
  assert.deepEqual(score.request, REVERSED_COMPARISON_REQUEST)
})
