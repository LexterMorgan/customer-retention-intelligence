/**
 * Pure scoring and summary aggregation for the retention-copilot evaluation.
 *
 * A case score judges one observed `CopilotResult` against a frozen
 * `EvaluationCase`. Expected answers must select an acceptable request, resolve
 * the trusted evidence envelope, and reproduce exactly the deterministic
 * formatter output; expected refusals must be clean `unsupported_scope` results
 * that expose no evidence. Correctness is never inferred from the model's
 * selected request: the matched expected request is resolved separately and the
 * observed envelope is compared against it semantically.
 *
 * The module is inert at import: no filesystem, network, model, credential, or
 * process access. Callers inject the evidence resolver and the formatter. Scores
 * and summaries contain only sanitized, application-derived values — never
 * credentials, provider bodies, request headers, or hidden reasoning.
 */
import type {
  EvidenceEnvelope,
  EvidenceRequest,
  EvidenceResolver,
} from "../../evidence/index.ts"
import { formatAnswer } from "../format.ts"
import { CONFIGURED_ROUTE, type CopilotResult } from "../types.ts"
import type {
  EvaluationCase,
  EvaluationCategory,
  EvaluationMode,
  ScoredClassification,
} from "./types.ts"

/** Error codes that mean the model produced output the service could not use. */
const MALFORMED_RESULT_CODES: ReadonlySet<string> = new Set([
  "invalid_model_output",
  "invalid_request",
])

/** Fields an expected-unsupported result must never carry. */
const REFUSAL_FORBIDDEN_FIELDS = [
  "answerText",
  "citations",
  "evidence",
  "facts",
] as const

/** Sanitized per-case score. Never contains secrets or raw provider bodies. */
export type CaseScore = {
  readonly caseId: string
  readonly category: EvaluationCategory
  readonly expectedDisposition: "answered" | "unsupported"
  readonly actualDisposition:
    "answered" | "unsupported" | "error" | "unattempted"
  readonly request: EvidenceRequest | null
  readonly classification: ScoredClassification
  readonly passed: boolean
  readonly elapsedMs: number | null
  readonly gatewayModel: string | null
  readonly usage: Readonly<Record<string, number>> | null
  readonly answerText: string | null
  readonly citations: readonly string[]
  readonly artifactSha256: string | null
  readonly detail: string
}

type ScoreFields = Omit<
  CaseScore,
  "caseId" | "category" | "expectedDisposition"
>

function makeScore(testCase: EvaluationCase, fields: ScoreFields): CaseScore {
  return {
    caseId: testCase.id,
    category: testCase.category,
    expectedDisposition: testCase.expectedDisposition,
    ...fields,
  }
}

function classifyErrorCode(code: string): ScoredClassification {
  return MALFORMED_RESULT_CODES.has(code)
    ? "malformed_model_response"
    : "operational_error"
}

function errorDetail(code: string): string {
  return MALFORMED_RESULT_CODES.has(code)
    ? `The copilot returned ${code}, which indicates a malformed model response.`
    : `The copilot returned ${code}, an operational failure.`
}

/**
 * Score one observed copilot result against one frozen case.
 *
 * `formatAnswerImpl` defaults to the production deterministic formatter; it is
 * injectable only so callers can pin the formatter without touching imports.
 */
export function scoreCaseOutcome(input: {
  readonly testCase: EvaluationCase
  readonly result: CopilotResult
  readonly resolver: EvidenceResolver
  readonly formatAnswerImpl?: (envelope: EvidenceEnvelope) => string
}): CaseScore {
  const testCase = input.testCase
  const result = input.result
  const resolver = input.resolver
  const format = input.formatAnswerImpl ?? formatAnswer

  if (result.kind === "error") {
    const classification = classifyErrorCode(result.code)
    return makeScore(testCase, {
      actualDisposition: "error",
      request: null,
      classification,
      passed: false,
      elapsedMs: null,
      gatewayModel: null,
      usage: null,
      answerText: null,
      citations: [],
      artifactSha256: null,
      detail: errorDetail(result.code),
    })
  }

  if (testCase.expectedDisposition === "unsupported") {
    return scoreUnsupportedExpectation(testCase, result)
  }

  return scoreAnsweredExpectation(testCase, result, resolver, format)
}

function scoreUnsupportedExpectation(
  testCase: EvaluationCase,
  result: Exclude<CopilotResult, { kind: "error" }>
): CaseScore {
  const model = result.model
  const elapsedMs = finiteOrNull(result.elapsedMs)
  const gatewayModel = model.gatewayReportedModel
  const usage = sanitizeUsage(model.usage)

  if (result.kind === "answered") {
    const evidence = result.evidence
    return makeScore(testCase, {
      actualDisposition: "answered",
      request: result.request,
      classification: "unsupported_scope_acceptance",
      passed: false,
      elapsedMs,
      gatewayModel,
      usage,
      answerText: result.answerText,
      citations: citationIds(evidence),
      artifactSha256: artifactSha256(evidence),
      detail:
        "An answered result was returned for a case that must be refused as unsupported scope.",
    })
  }

  // The result type only allows "unsupported_scope"; read it as a string so a
  // malformed runtime result is judged rather than assumed.
  const reason: string = result.reason
  const exposed = exposedRefusalField(result)
  const clean = reason === "unsupported_scope" && exposed === null
  return makeScore(testCase, {
    actualDisposition: "unsupported",
    request: null,
    classification: clean ? "correct" : "evidence_answer_mismatch",
    passed: clean,
    elapsedMs,
    gatewayModel,
    usage,
    answerText: null,
    citations: [],
    artifactSha256: null,
    detail: clean
      ? "Refused the question with the fixed unsupported_scope reason and no evidence."
      : refusalMismatchDetail(reason, exposed),
  })
}

function refusalMismatchDetail(reason: string, exposed: string | null): string {
  if (exposed !== null) {
    return `The unsupported result exposed ${exposed} instead of a clean refusal.`
  }
  return `The unsupported result used reason ${JSON.stringify(reason)} instead of "unsupported_scope".`
}

function scoreAnsweredExpectation(
  testCase: EvaluationCase,
  result: Exclude<CopilotResult, { kind: "error" }>,
  resolver: EvidenceResolver,
  format: (envelope: EvidenceEnvelope) => string
): CaseScore {
  const model = result.model
  const elapsedMs = finiteOrNull(result.elapsedMs)
  const gatewayModel = model.gatewayReportedModel
  const usage = sanitizeUsage(model.usage)

  if (result.kind === "unsupported") {
    return makeScore(testCase, {
      actualDisposition: "unsupported",
      request: null,
      classification: "incorrect_refusal",
      passed: false,
      elapsedMs,
      gatewayModel,
      usage,
      answerText: null,
      citations: [],
      artifactSha256: null,
      detail:
        "The question was refused even though the fixed payload answers it.",
    })
  }

  const actualEvidence = result.evidence
  const observed: ScoreFields = {
    actualDisposition: "answered",
    request: result.request,
    classification: "correct",
    passed: false,
    elapsedMs,
    gatewayModel,
    usage,
    answerText:
      typeof result.answerText === "string" ? result.answerText : null,
    citations: citationIds(actualEvidence),
    artifactSha256: artifactSha256(actualEvidence),
    detail: "",
  }

  const matchedRequest = testCase.acceptableRequests.find((candidate) =>
    requestsEquivalent(candidate, result.request)
  )
  if (matchedRequest === undefined) {
    return makeScore(testCase, {
      ...observed,
      classification: "semantic_routing_failure",
      detail:
        "The selected request does not match any acceptable request for this case.",
    })
  }

  // Resolve exactly the expected request. The model's request is only an
  // observation to compare against; it never defines the expected evidence.
  const resolution = resolveExpectedEvidence(resolver, matchedRequest)
  if (!resolution.ok) {
    return makeScore(testCase, {
      ...observed,
      classification: "operational_error",
      detail: `The expected evidence request could not be resolved (${resolution.reason}).`,
    })
  }
  const expectedEvidence = resolution.envelope

  let mismatch: string | null
  try {
    mismatch = compareEnvelopes(expectedEvidence, actualEvidence)
  } catch {
    mismatch = "the observed evidence could not be compared"
  }
  if (mismatch !== null) {
    return makeScore(testCase, {
      ...observed,
      classification: "evidence_answer_mismatch",
      detail: `The resolved evidence does not match the expected evidence (${mismatch}).`,
    })
  }

  let formatted: string
  try {
    formatted = format(actualEvidence)
  } catch {
    return makeScore(testCase, {
      ...observed,
      classification: "evidence_answer_mismatch",
      detail:
        "The answer text could not be reproduced by the deterministic formatter.",
    })
  }
  if (result.answerText !== formatted) {
    return makeScore(testCase, {
      ...observed,
      classification: "evidence_answer_mismatch",
      detail:
        "The answer text does not match the deterministic formatter output for the resolved evidence.",
    })
  }

  return makeScore(testCase, {
    ...observed,
    passed: true,
    detail:
      "Matched an acceptable request and verified the deterministic evidence and answer text.",
  })
}

/** Score for a planned case the run never reached. */
export function unattemptedScore(testCase: EvaluationCase): CaseScore {
  return makeScore(testCase, {
    actualDisposition: "unattempted",
    request: null,
    classification: "unattempted",
    passed: false,
    elapsedMs: null,
    gatewayModel: null,
    usage: null,
    answerText: null,
    citations: [],
    artifactSha256: null,
    detail: "The case was not attempted.",
  })
}

export type CategoryStats = {
  planned: number
  attempted: number
  correct: number
}

export type EvaluationSummary = {
  readonly mode: EvaluationMode
  readonly planned: number
  readonly attempted: number
  readonly completed: number
  readonly correct: number
  readonly failed: number
  readonly unattempted: number
  readonly fullRun: boolean
  readonly stoppedReason: string | null
  readonly strictPassRate: number
  readonly strictPassRateDenominator: "planned"
  readonly supportedAccuracy: number
  readonly supportedAttempted: number
  readonly unsupportedRefusalRate: number
  readonly unsupportedAttempted: number
  readonly byCategory: Readonly<Record<EvaluationCategory, CategoryStats>>
  readonly invalidOutputCount: number
  readonly operationalErrorCount: number
  readonly latencyMs: {
    readonly median: number | null
    readonly p95: number | null
    readonly sampleCount: number
    readonly convention: "nearest-rank"
  }
  readonly tokens: {
    readonly prompt: number
    readonly completion: number
    readonly total: number
    readonly usageCoverage: number
  }
  readonly modelDistribution: Readonly<Record<string, number>>
  readonly configuredRoute: string
  readonly passed: boolean
  readonly exitCode: 0 | 1
}

/**
 * Aggregate case scores into one run summary.
 *
 * Conventions:
 * - `unattempted` score records are excluded from every attempted denominator,
 *   so callers may pass either only attempted scores or attempted plus
 *   unattempted records.
 * - `byCategory.planned` counts the delivered score records per category; a
 *   summary cannot see planned cases for which no record was delivered.
 * - `correct` counts passed attempted cases; `completed` additionally excludes
 *   operational errors.
 * - `p95` uses the nearest-rank definition, index `ceil(0.95 * n) - 1`.
 * - A run passes only when it is a full run over a nonzero plan and every
 *   planned case passed. `mode` is recorded for context but does not gate
 *   pass/fail.
 */
export function summarizeEvaluation(input: {
  readonly scores: readonly CaseScore[]
  readonly planned: number
  readonly mode: EvaluationMode
  readonly stoppedReason: string | null
  readonly configuredRoute?: string
}): EvaluationSummary {
  const attemptedScores = input.scores.filter(
    (score) => score.classification !== "unattempted"
  )
  const attempted = attemptedScores.length
  const correct = attemptedScores.filter((score) => score.passed).length
  const failed = attempted - correct
  const operationalErrorCount = attemptedScores.filter(
    (score) => score.classification === "operational_error"
  ).length
  const invalidOutputCount = attemptedScores.filter(
    (score) => score.classification === "malformed_model_response"
  ).length
  const completed = attempted - operationalErrorCount
  const unattempted = Math.max(0, input.planned - attempted)
  const fullRun = attempted === input.planned && input.stoppedReason === null

  const supportedScores = attemptedScores.filter(
    (score) => score.expectedDisposition === "answered"
  )
  const supportedAttempted = supportedScores.length
  const supportedCorrect = supportedScores.filter(
    (score) => score.passed
  ).length
  const unsupportedScores = attemptedScores.filter(
    (score) => score.expectedDisposition === "unsupported"
  )
  const unsupportedAttempted = unsupportedScores.length
  const unsupportedCorrect = unsupportedScores.filter(
    (score) => score.passed
  ).length

  const byCategory: Record<EvaluationCategory, CategoryStats> = {
    supported_paraphrase: { planned: 0, attempted: 0, correct: 0 },
    comparison_ranking: { planned: 0, attempted: 0, correct: 0 },
    unsupported_scope: { planned: 0, attempted: 0, correct: 0 },
    ambiguous_compound: { planned: 0, attempted: 0, correct: 0 },
    adversarial: { planned: 0, attempted: 0, correct: 0 },
  }
  for (const score of input.scores) {
    const stats = byCategory[score.category]
    if (stats === undefined) {
      continue
    }
    stats.planned += 1
    if (score.classification !== "unattempted") {
      stats.attempted += 1
      if (score.passed) {
        stats.correct += 1
      }
    }
  }

  const latencies: number[] = []
  let usageCases = 0
  let promptTokens = 0
  let completionTokens = 0
  let totalTokens = 0
  const models = new Map<string, number>()
  for (const score of attemptedScores) {
    if (score.elapsedMs !== null && Number.isFinite(score.elapsedMs)) {
      latencies.push(score.elapsedMs)
    }
    if (score.usage !== null) {
      usageCases += 1
      promptTokens += usageNumber(score.usage, "prompt_tokens")
      completionTokens += usageNumber(score.usage, "completion_tokens")
      totalTokens += usageNumber(score.usage, "total_tokens")
    }
    const model = score.gatewayModel ?? "unknown"
    models.set(model, (models.get(model) ?? 0) + 1)
  }
  latencies.sort((left, right) => left - right)

  const modelDistribution: Record<string, number> = Object.fromEntries(
    [...models.entries()].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    )
  )

  const strictPassRate = input.planned > 0 ? correct / input.planned : 0
  const passed = input.planned > 0 && fullRun && correct === input.planned
  const exitCode: 0 | 1 = passed && fullRun && failed === 0 ? 0 : 1

  return {
    mode: input.mode,
    planned: input.planned,
    attempted,
    completed,
    correct,
    failed,
    unattempted,
    fullRun,
    stoppedReason: input.stoppedReason,
    strictPassRate,
    strictPassRateDenominator: "planned",
    supportedAccuracy:
      supportedAttempted > 0 ? supportedCorrect / supportedAttempted : 0,
    supportedAttempted,
    unsupportedRefusalRate:
      unsupportedAttempted > 0 ? unsupportedCorrect / unsupportedAttempted : 0,
    unsupportedAttempted,
    byCategory,
    invalidOutputCount,
    operationalErrorCount,
    latencyMs: {
      median: median(latencies),
      p95: nearestRankP95(latencies),
      sampleCount: latencies.length,
      convention: "nearest-rank",
    },
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      total: totalTokens,
      usageCoverage: attempted > 0 ? usageCases / attempted : 0,
    },
    modelDistribution,
    configuredRoute: input.configuredRoute ?? CONFIGURED_ROUTE,
    passed,
    exitCode,
  }
}

type ResolveOutcome =
  | { readonly ok: true; readonly envelope: EvidenceEnvelope }
  | { readonly ok: false; readonly reason: string }

function resolveExpectedEvidence(
  resolver: EvidenceResolver,
  request: EvidenceRequest
): ResolveOutcome {
  try {
    const result = resolver(request)
    if (!result.ok) {
      return { ok: false, reason: `resolver failed (${result.error.code})` }
    }
    return { ok: true, envelope: result.envelope }
  } catch {
    return { ok: false, reason: "resolver threw" }
  }
}

/**
 * Compare the observed envelope against the envelope resolved from the matched
 * expected request. Returns the first mismatch, or null when equivalent.
 *
 * Facts are compared as a semantic multiset keyed by locator plus scope, and
 * definitions as a multiset by id. Array order is never evidence identity.
 */
function compareEnvelopes(
  expected: EvidenceEnvelope,
  actual: unknown
): string | null {
  if (!isRecord(actual)) {
    return "the observed evidence is not an object"
  }

  const actualArtifact = actual["artifact"]
  if (!isRecord(actualArtifact)) {
    return "the observed artifact identity is missing"
  }
  if (actualArtifact["source"] !== expected.artifact.source) {
    return "the artifact source differs"
  }
  if (actualArtifact["sha256"] !== expected.artifact.sha256) {
    return "the artifact sha256 differs"
  }

  if (actual["snapshot"] !== expected.snapshot) {
    return "the snapshot label differs"
  }

  const actualScope = actual["scope"]
  if (!isRecord(actualScope)) {
    return "the observed scope is missing"
  }
  if (actualScope["kind"] !== expected.scope.kind) {
    return "the scope kind differs"
  }
  if (actualScope["description"] !== expected.scope.description) {
    return "the scope description differs"
  }

  if (!requestsEquivalent(expected.request, actual["request"])) {
    return "the evidence request semantics differ"
  }

  const caveatsMismatch = compareStringLists(
    expected.caveats,
    actual["caveats"],
    "envelope caveats"
  )
  if (caveatsMismatch !== null) {
    return caveatsMismatch
  }

  const factsMismatch = compareFactMultisets(expected.facts, actual["facts"])
  if (factsMismatch !== null) {
    return factsMismatch
  }

  const definitionsMismatch = compareDefinitionMultisets(
    expected.definitions,
    actual["definitions"]
  )
  if (definitionsMismatch !== null) {
    return definitionsMismatch
  }

  return compareSelection(expected.selection, actual["selection"])
}

function compareStringLists(
  expected: readonly string[],
  actual: unknown,
  label: string
): string | null {
  if (!Array.isArray(actual)) {
    return `the observed ${label} are missing`
  }
  if (actual.length !== expected.length) {
    return `the observed ${label} count differs`
  }
  for (const [index, value] of actual.entries()) {
    if (value !== expected[index]) {
      return `the observed ${label} differ`
    }
  }
  return null
}

/** The highest-churn selection must name the same contract(s) and tie state. */
function compareSelection(
  expected: EvidenceEnvelope["selection"],
  actual: unknown
): string | null {
  if (expected === undefined) {
    return actual === undefined || actual === null
      ? null
      : "the observed selection is unexpected"
  }
  if (!isRecord(actual)) {
    return "the observed selection is missing"
  }
  if (actual["metric"] !== expected.metric) {
    return "the observed selection metric differs"
  }
  const contracts = actual["contracts"]
  if (
    !Array.isArray(contracts) ||
    contracts.length !== expected.contracts.length ||
    contracts.some((contract, index) => contract !== expected.contracts[index])
  ) {
    return "the observed selection contracts differ"
  }
  if (actual["tie"] !== expected.tie) {
    return "the observed selection tie status differs"
  }
  return null
}

function compareFactMultisets(
  expectedFacts: readonly unknown[],
  actualFacts: unknown
): string | null {
  const expected = indexFacts(expectedFacts)
  if (expected === null) {
    return "the expected facts are malformed"
  }
  const actual = indexFacts(actualFacts)
  if (actual === null) {
    return "the observed facts are missing or malformed"
  }
  if (actual.size !== expected.size) {
    return "the observed fact count differs"
  }
  for (const [key, expectedSignatures] of expected) {
    const actualSignatures = actual.get(key)
    if (actualSignatures === undefined) {
      return `the observed facts are missing ${key}`
    }
    if (actualSignatures.length !== expectedSignatures.length) {
      return `the observed facts differ at ${key}`
    }
    for (const [index, expectedSignature] of expectedSignatures.entries()) {
      if (actualSignatures[index] !== expectedSignature) {
        return `the observed fact value differs at ${key}`
      }
    }
  }
  return null
}

function compareDefinitionMultisets(
  expectedDefinitions: readonly unknown[],
  actualDefinitions: unknown
): string | null {
  const expected = indexDefinitions(expectedDefinitions)
  if (expected === null) {
    return "the expected definitions are malformed"
  }
  const actual = indexDefinitions(actualDefinitions)
  if (actual === null) {
    return "the observed definitions are missing or malformed"
  }
  if (actual.size !== expected.size) {
    return "the observed definition count differs"
  }
  for (const [id, expectedSignatures] of expected) {
    const actualSignatures = actual.get(id)
    if (actualSignatures === undefined) {
      return `the observed definitions are missing ${id}`
    }
    if (actualSignatures.length !== expectedSignatures.length) {
      return `the observed definitions differ at ${id}`
    }
    for (const [index, expectedSignature] of expectedSignatures.entries()) {
      if (actualSignatures[index] !== expectedSignature) {
        return `the observed definition content differs at ${id}`
      }
    }
  }
  return null
}

function indexFacts(facts: unknown): Map<string, string[]> | null {
  if (!Array.isArray(facts)) {
    return null
  }
  const index = new Map<string, string[]>()
  for (const fact of facts) {
    const key = factKey(fact)
    const signature = factSignature(fact)
    if (key === null || signature === null) {
      return null
    }
    const bucket = index.get(key)
    if (bucket === undefined) {
      index.set(key, [signature])
    } else {
      bucket.push(signature)
    }
  }
  for (const bucket of index.values()) {
    bucket.sort()
  }
  return index
}

function indexDefinitions(definitions: unknown): Map<string, string[]> | null {
  if (!Array.isArray(definitions)) {
    return null
  }
  const index = new Map<string, string[]>()
  for (const definition of definitions) {
    const id = definitionId(definition)
    const signature = definitionSignature(definition)
    if (id === null || signature === null) {
      return null
    }
    const bucket = index.get(id)
    if (bucket === undefined) {
      index.set(id, [signature])
    } else {
      bucket.push(signature)
    }
  }
  for (const bucket of index.values()) {
    bucket.sort()
  }
  return index
}

/** Semantic fact key: locator identity plus scope identity. */
function factKey(fact: unknown): string | null {
  if (!isRecord(fact)) {
    return null
  }
  const locator = fact["locator"]
  const scope = fact["scope"]
  if (!isRecord(locator) || !isRecord(scope)) {
    return null
  }
  const locatorKey = locatorIdentity(locator)
  const scopeKey = scopeIdentity(scope)
  if (locatorKey === null || scopeKey === null) {
    return null
  }
  return `${locatorKey}|${scopeKey}`
}

function locatorIdentity(locator: Record<string, unknown>): string | null {
  const section = locator["section"]
  if (section === "kpis") {
    const field = locator["field"]
    return typeof field === "string" ? `kpis.${field}` : null
  }
  if (section === "by_contract") {
    const key = locator["key"]
    const field = locator["field"]
    if (!isRecord(key) || typeof field !== "string") {
      return null
    }
    const category = key["category"]
    return typeof category === "string"
      ? `by_contract[${category}].${field}`
      : null
  }
  return null
}

function scopeIdentity(scope: Record<string, unknown>): string | null {
  const kind = scope["kind"]
  if (kind === "overall") {
    return "overall"
  }
  if (kind === "contract") {
    const contract = scope["contract"]
    return typeof contract === "string" ? `contract:${contract}` : null
  }
  return null
}

/** The comparable semantic content of a fact, excluding only array position. */
function factSignature(fact: unknown): string | null {
  if (!isRecord(fact)) {
    return null
  }
  const metric = fact["metric"]
  const unit = fact["unit"]
  const population = fact["population"]
  const citation = fact["citation"]
  if (
    !isRecord(metric) ||
    !isRecord(unit) ||
    !isRecord(population) ||
    !isRecord(citation)
  ) {
    return null
  }
  const metricId = metric["id"]
  const metricLabel = metric["label"]
  if (typeof metricId !== "string" || typeof metricLabel !== "string") {
    return null
  }
  const value = fact["value"]
  const unitKind = unit["kind"]
  const populationId = population["id"]
  const populationDefinition = population["definition"]
  const citationId = citation["id"]
  const citationSha256 = citation["artifactSha256"]
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    typeof unitKind !== "string" ||
    typeof populationId !== "string" ||
    typeof populationDefinition !== "string" ||
    typeof citationId !== "string" ||
    typeof citationSha256 !== "string"
  ) {
    return null
  }
  return JSON.stringify([
    metricId,
    metricLabel,
    value,
    unitKind,
    unit["currency"] ?? null,
    unit["period"] ?? null,
    populationId,
    populationDefinition,
    citationId,
    citationSha256,
  ])
}

function definitionId(definition: unknown): string | null {
  if (!isRecord(definition)) {
    return null
  }
  const id = definition["id"]
  return typeof id === "string" ? id : null
}

/** The comparable content of a definition: title, text, caveats, and source. */
function definitionSignature(definition: unknown): string | null {
  if (!isRecord(definition)) {
    return null
  }
  const source = definition["source"]
  const title = definition["title"]
  const text = definition["text"]
  const caveats = definition["caveats"]
  if (
    !isRecord(source) ||
    typeof title !== "string" ||
    typeof text !== "string" ||
    !Array.isArray(caveats) ||
    caveats.some((caveat) => typeof caveat !== "string")
  ) {
    return null
  }
  return JSON.stringify([
    title,
    text,
    caveats,
    source["kind"] ?? null,
    source["path"] ?? null,
    source["section"] ?? null,
    source["field"] ?? null,
    source["versioning"] ?? null,
    source["artifactSha256"] ?? null,
  ])
}

/**
 * Request semantics, treating `compare_contracts` contracts as unordered: the
 * model may reverse the comparison direction without changing the expectation.
 */
function requestsEquivalent(
  expected: EvidenceRequest,
  actual: unknown
): boolean {
  if (!isRecord(actual) || actual["operation"] !== expected.operation) {
    return false
  }
  switch (expected.operation) {
    case "get_kpi":
      return actual["metric"] === expected.metric
    case "get_contract_metrics":
      return actual["contract"] === expected.contract
    case "highest_churn_contract":
      return true
    case "get_definition":
      return actual["definition"] === expected.definition
    case "compare_contracts": {
      const contracts = actual["contracts"]
      if (!Array.isArray(contracts) || contracts.length !== 2) {
        return false
      }
      const [first, second] = expected.contracts
      return (
        (contracts[0] === first && contracts[1] === second) ||
        (contracts[0] === second && contracts[1] === first)
      )
    }
  }
}

function exposedRefusalField(
  result: Exclude<CopilotResult, { kind: "error" }>
): string | null {
  const record = result as unknown as Record<string, unknown>
  for (const field of REFUSAL_FORBIDDEN_FIELDS) {
    const value = record[field]
    if (value !== undefined && value !== null) {
      return field
    }
  }
  return null
}

function citationIds(evidence: unknown): readonly string[] {
  if (!isRecord(evidence) || !Array.isArray(evidence["facts"])) {
    return []
  }
  const ids: string[] = []
  for (const fact of evidence["facts"]) {
    if (!isRecord(fact)) {
      continue
    }
    const citation = fact["citation"]
    if (isRecord(citation) && typeof citation["id"] === "string") {
      ids.push(citation["id"])
    }
  }
  return ids
}

function artifactSha256(evidence: unknown): string | null {
  if (!isRecord(evidence)) {
    return null
  }
  const artifact = evidence["artifact"]
  if (!isRecord(artifact)) {
    return null
  }
  const sha256 = artifact["sha256"]
  return typeof sha256 === "string" ? sha256 : null
}

function sanitizeUsage(
  usage: unknown
): Readonly<Record<string, number>> | null {
  if (!isRecord(usage)) {
    return null
  }
  const entries: [string, number][] = []
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      entries.push([key, value])
    }
  }
  return Object.fromEntries(entries)
}

function usageNumber(
  usage: Readonly<Record<string, number>>,
  key: string
): number {
  const value = usage[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function finiteOrNull(value: number): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function median(sorted: readonly number[]): number | null {
  const count = sorted.length
  if (count === 0) {
    return null
  }
  const middle = Math.floor(count / 2)
  if (count % 2 === 1) {
    return sorted[middle]
  }
  return (sorted[middle - 1] + sorted[middle]) / 2
}

/** Nearest-rank percentile: index `ceil(0.95 * n) - 1`. */
function nearestRankP95(sorted: readonly number[]): number | null {
  if (sorted.length === 0) {
    return null
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(0.95 * sorted.length) - 1)
  )
  return sorted[index]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
