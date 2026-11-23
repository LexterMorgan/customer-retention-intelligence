/**
 * Manual copilot evaluation runner.
 *
 * Offline (default): validates the frozen dataset, resolves every expected
 * request against the fixed payload, checks the semantic assertions, and
 * exercises the scorer with controlled fixture results. This is fixture/offline
 * validation, never model performance.
 *
 * Live (`--live`): exactly one copilot-service call per case, sequentially, with
 * no retries or prompt changes. Transport/credential/rate-limit failures stop
 * the run and leave remaining cases unattempted. Only sanitized results are
 * recorded.
 */
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import {
  loadEvidence,
  type EvidenceEnvelope,
  type EvidenceResolver,
} from "../../evidence/index.ts"
import { formatAnswer } from "../format.ts"
import { createCopilotService, UNSUPPORTED_SCOPE_MESSAGE } from "../service.ts"
import {
  CONFIGURED_PROVIDER,
  CONFIGURED_ROUTE,
  type CopilotErrorCode,
  type CopilotResult,
  type ModelMetadata,
} from "../types.ts"
import {
  buildEvaluationArtifact,
  hashRuntimeSources,
  readGitIdentity,
  type EvaluationArtifact,
  type GitIdentity,
  type RuntimeSourceIdentity,
} from "./artifact.ts"
import { EVALUATION_DATASET } from "./dataset.ts"
import {
  scoreCaseOutcome,
  summarizeEvaluation,
  type CaseScore,
  type EvaluationSummary,
} from "./scoring.ts"
import {
  EVALUATION_DATASET_VERSION,
  type EvaluationCase,
  type EvidenceLocator,
} from "./types.ts"
import { datasetHash, validateDataset } from "./validation.ts"

/** Transport/auth/quota failures that must stop a live run. */
export const LIVE_STOP_CODES: ReadonlySet<string> = new Set([
  "missing_credential",
  "model_connectivity",
  "model_timeout",
  "model_rate_limit",
  "model_http_error",
  "model_redirect",
  "model_response",
  "model_truncated",
  "model_empty",
  "model_response_too_large",
])

const FIXTURE_MODEL: ModelMetadata = {
  provider: CONFIGURED_PROVIDER,
  configuredRoute: CONFIGURED_ROUTE,
  status: null,
  gatewayReportedModel: null,
  usage: null,
}

export type OfflineEvaluationReport = {
  readonly mode: "offline"
  readonly label: "fixture/offline validation — not model performance"
  readonly dataset: {
    readonly version: string
    readonly sha256: string
    readonly total: number
    readonly valid: boolean
    readonly errors: readonly string[]
    readonly countsByCategory: Readonly<Record<string, number>>
  }
  readonly aggregatePayloadSha256: string | null
  readonly expectedEvidence: {
    readonly resolved: number
    readonly failed: readonly string[]
  }
  readonly assertions: {
    readonly checked: number
    readonly failed: readonly string[]
  }
  readonly evaluatorSelfCheck: {
    readonly checks: number
    readonly failed: readonly string[]
  }
  readonly passed: boolean
  readonly exitCode: 0 | 1
}

function assertionMatches(
  envelope: EvidenceEnvelope,
  locator: EvidenceLocator
): boolean {
  if (locator.section === "definition") {
    return envelope.definitions.some(
      (definition) => definition.id === locator.id
    )
  }
  if (locator.section === "kpis") {
    return envelope.facts.some(
      (fact) =>
        fact.locator.section === "kpis" && fact.locator.field === locator.field
    )
  }
  return envelope.facts.some(
    (fact) =>
      fact.locator.section === "by_contract" &&
      fact.locator.key.category === locator.category &&
      fact.locator.field === locator.field
  )
}

function fixtureModelResult(
  testCase: EvaluationCase,
  resolver: EvidenceResolver
): CopilotResult | null {
  if (testCase.expectedDisposition !== "answered") {
    return null
  }
  const request = testCase.acceptableRequests[0]
  const resolved = resolver(request)
  if (!resolved.ok) {
    return null
  }
  return {
    kind: "answered",
    question: testCase.question,
    answerText: formatAnswer(resolved.envelope),
    request: resolved.envelope.request,
    evidence: resolved.envelope,
    model: FIXTURE_MODEL,
    elapsedMs: 0,
  }
}

function fixtureUnsupportedResult(testCase: EvaluationCase): CopilotResult {
  return {
    kind: "unsupported",
    question: testCase.question,
    reason: "unsupported_scope",
    message: UNSUPPORTED_SCOPE_MESSAGE,
    model: FIXTURE_MODEL,
    elapsedMs: 0,
  }
}

export function runOfflineEvaluation(
  options: {
    readonly cases?: readonly EvaluationCase[]
  } = {}
): OfflineEvaluationReport {
  const cases = options.cases ?? EVALUATION_DATASET
  const validation = validateDataset(cases)
  const loaded = loadEvidence()
  if (!loaded.ok) {
    return {
      mode: "offline",
      label: "fixture/offline validation — not model performance",
      dataset: {
        version: EVALUATION_DATASET_VERSION,
        sha256: datasetHash(cases),
        total: cases.length,
        valid: validation.ok,
        errors: validation.errors,
        countsByCategory: validation.countsByCategory,
      },
      aggregatePayloadSha256: null,
      expectedEvidence: { resolved: 0, failed: ["payload unavailable"] },
      assertions: { checked: 0, failed: [] },
      evaluatorSelfCheck: { checks: 0, failed: ["payload unavailable"] },
      passed: false,
      exitCode: 1,
    }
  }

  const resolver = loaded.service.resolve
  const expectedFailures: string[] = []
  const assertionFailures: string[] = []
  let resolvedCount = 0
  let assertionsChecked = 0

  for (const testCase of cases) {
    if (testCase.expectedDisposition !== "answered") {
      continue
    }
    let matched = false
    for (const request of testCase.acceptableRequests) {
      const resolved = resolver(request)
      if (!resolved.ok) {
        continue
      }
      matched = true
      resolvedCount += 1
      for (const locator of testCase.evidenceAssertions) {
        assertionsChecked += 1
        if (!assertionMatches(resolved.envelope, locator)) {
          assertionFailures.push(
            `${testCase.id}: missing assertion ${locator.section}`
          )
        }
      }
      break
    }
    if (!matched) {
      expectedFailures.push(testCase.id)
    }
  }

  // Controlled evaluator self-checks: ideal fixtures must pass and known-wrong
  // fixtures must land in the expected failure classes.
  const selfCheckFailures: string[] = []
  let checks = 0
  const answeredCases = cases.filter(
    (testCase) => testCase.expectedDisposition === "answered"
  )
  const unsupportedCases = cases.filter(
    (testCase) => testCase.expectedDisposition === "unsupported"
  )

  for (const testCase of answeredCases.slice(0, 5)) {
    checks += 1
    const ideal = fixtureModelResult(testCase, resolver)
    if (ideal === null) {
      selfCheckFailures.push(`${testCase.id}: ideal fixture unavailable`)
      continue
    }
    const score = scoreCaseOutcome({ testCase, result: ideal, resolver })
    if (score.classification !== "correct" || !score.passed) {
      selfCheckFailures.push(
        `${testCase.id}: ideal fixture classified ${score.classification}`
      )
    }
  }
  for (const testCase of unsupportedCases.slice(0, 5)) {
    checks += 1
    const score = scoreCaseOutcome({
      testCase,
      result: fixtureUnsupportedResult(testCase),
      resolver,
    })
    if (score.classification !== "correct" || !score.passed) {
      selfCheckFailures.push(
        `${testCase.id}: unsupported fixture classified ${score.classification}`
      )
    }
  }
  const firstAnswered = answeredCases[0]
  if (firstAnswered !== undefined) {
    checks += 2
    const ideal = fixtureModelResult(firstAnswered, resolver)
    if (ideal !== null && ideal.kind === "answered") {
      const wrongRequest = resolver({ operation: "highest_churn_contract" })
      if (wrongRequest.ok) {
        const wrong: CopilotResult = {
          kind: "answered",
          question: firstAnswered.question,
          answerText: formatAnswer(wrongRequest.envelope),
          request: wrongRequest.envelope.request,
          evidence: wrongRequest.envelope,
          model: FIXTURE_MODEL,
          elapsedMs: 0,
        }
        const score = scoreCaseOutcome({
          testCase: firstAnswered,
          result: wrong,
          resolver,
        })
        if (score.classification !== "semantic_routing_failure") {
          selfCheckFailures.push(
            `wrong-request fixture classified ${score.classification}`
          )
        }
      } else {
        selfCheckFailures.push("wrong-request fixture evidence unavailable")
      }
    }
    const firstUnsupported = unsupportedCases[0]
    if (firstUnsupported !== undefined) {
      const misrouted = fixtureModelResult(firstUnsupported, resolver)
      if (misrouted !== null) {
        const score = scoreCaseOutcome({
          testCase: firstUnsupported,
          result: misrouted,
          resolver,
        })
        if (score.classification !== "unsupported_scope_acceptance") {
          selfCheckFailures.push(
            `expected-unsupported answered fixture classified ${score.classification}`
          )
        }
      }
    }
  }

  const passed =
    validation.ok &&
    expectedFailures.length === 0 &&
    assertionFailures.length === 0 &&
    selfCheckFailures.length === 0
  return {
    mode: "offline",
    label: "fixture/offline validation — not model performance",
    dataset: {
      version: EVALUATION_DATASET_VERSION,
      sha256: datasetHash(cases),
      total: cases.length,
      valid: validation.ok,
      errors: validation.errors,
      countsByCategory: validation.countsByCategory,
    },
    aggregatePayloadSha256: loaded.service.artifact.sha256,
    expectedEvidence: { resolved: resolvedCount, failed: expectedFailures },
    assertions: { checked: assertionsChecked, failed: assertionFailures },
    evaluatorSelfCheck: { checks, failed: selfCheckFailures },
    passed,
    exitCode: passed ? 0 : 1,
  }
}

export type LiveEvaluationResult = {
  readonly mode: "live"
  readonly blockedReason: string | null
  readonly scores: readonly CaseScore[]
  readonly summary: EvaluationSummary
  readonly artifactPath: string | null
  readonly exitCode: 0 | 1 | 2
}

export type LiveEvaluationOptions = {
  readonly credential: string
  readonly artifactPath?: string
  readonly cases?: readonly EvaluationCase[]
  readonly now?: () => Date
  /** Test seam: replace the model-backed service call. Never used by the CLI. */
  readonly ask?: (input: {
    readonly question: string
  }) => Promise<CopilotResult>
  /** Test seam: simulates interruption after a completed case. */
  readonly onCaseCompleted?: (caseId: string) => void | Promise<void>
}

const CHECKPOINT_LIMITATIONS: readonly string[] = [
  "This artifact is written by the bounded live evaluation runner.",
  "An interrupted run may leave an incomplete checkpoint; unattempted cases were never called.",
  "Single bounded live run of synthetic questions; not a production-quality or broad model-reliability evaluation.",
  "Gateway-reported model identity may change upstream behind the configured free-models route.",
  "Scores judge schema-valid interpretation and trusted-evidence rendering, not open-ended semantic understanding.",
  "No monetary cost is inferred and the route is not asserted to be free.",
]

function persistArtifactAtomically(
  path: string,
  artifact: EvaluationArtifact
): void {
  const target = resolve(path)
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`, "utf8")
    renameSync(temporary, target)
  } catch {
    try {
      unlinkSync(temporary)
    } catch {
      // The original checkpoint write failure is the reported error.
    }
    throw new Error(
      `Failed to persist the evaluation checkpoint at ${target}; stopping before further model calls.`
    )
  }
}

function errorResultFor(code: CopilotErrorCode): CopilotResult {
  return {
    kind: "error",
    code,
    message: "The model call failed before a result was produced.",
  }
}

export async function runLiveEvaluation(
  options: LiveEvaluationOptions
): Promise<LiveEvaluationResult> {
  const cases = options.cases ?? EVALUATION_DATASET
  const validation = validateDataset(cases)
  if (!validation.ok) {
    const summary = summarizeEvaluation({
      scores: [],
      planned: cases.length,
      mode: "live",
      stoppedReason: "invalid_dataset",
    })
    return {
      mode: "live",
      blockedReason: `invalid_dataset: ${validation.errors.join("; ")}`,
      scores: [],
      summary,
      artifactPath: null,
      exitCode: 2,
    }
  }
  if (options.credential.trim() === "") {
    const summary = summarizeEvaluation({
      scores: [],
      planned: cases.length,
      mode: "live",
      stoppedReason: "missing_credential",
    })
    return {
      mode: "live",
      blockedReason: "missing_credential",
      scores: [],
      summary,
      artifactPath: null,
      exitCode: 2,
    }
  }
  const loaded = loadEvidence()
  if (!loaded.ok) {
    const summary = summarizeEvaluation({
      scores: [],
      planned: cases.length,
      mode: "live",
      stoppedReason: "evidence_unavailable",
    })
    return {
      mode: "live",
      blockedReason: "evidence_unavailable",
      scores: [],
      summary,
      artifactPath: null,
      exitCode: 1,
    }
  }

  const resolver = loaded.service.resolve
  const ask =
    options.ask ??
    ((input: { readonly question: string }) =>
      createCopilotService({ credential: options.credential }).ask(input))
  const scores: CaseScore[] = []
  let stoppedReason: string | null = null

  // Capture run identity and write an initial checkpoint before any model call,
  // so an interrupted run preserves dataset/payload/git/runtime identity.
  const artifactTarget =
    options.artifactPath === undefined ? null : resolve(options.artifactPath)
  let runTimestampUtc: string | null = null
  let git: GitIdentity | null = null
  let runtimeSource: RuntimeSourceIdentity | null = null

  const summarize = (): EvaluationSummary =>
    summarizeEvaluation({
      scores,
      planned: cases.length,
      mode: "live",
      stoppedReason,
    })

  const checkpoint = (): void => {
    if (
      artifactTarget === null ||
      runTimestampUtc === null ||
      git === null ||
      runtimeSource === null
    ) {
      return
    }
    persistArtifactAtomically(
      artifactTarget,
      buildEvaluationArtifact({
        cases,
        scores,
        summary: summarize(),
        aggregatePayloadSha256: loaded.service.artifact.sha256,
        runTimestampUtc,
        git,
        runtimeSource,
        limitations: CHECKPOINT_LIMITATIONS,
      })
    )
  }

  if (artifactTarget !== null) {
    runTimestampUtc = (options.now ?? (() => new Date()))().toISOString()
    git = readGitIdentity()
    runtimeSource = hashRuntimeSources()
    stoppedReason = "running"
    checkpoint()
    stoppedReason = null
  }

  for (const testCase of cases) {
    let result: CopilotResult
    try {
      result = await ask({ question: testCase.question })
    } catch {
      result = errorResultFor("model_response")
    }
    scores.push(scoreCaseOutcome({ testCase, result, resolver }))
    checkpoint()
    if (result.kind === "error" && LIVE_STOP_CODES.has(result.code)) {
      stoppedReason = result.code
      break
    }
    if (options.onCaseCompleted !== undefined) {
      try {
        await options.onCaseCompleted(testCase.id)
      } catch {
        stoppedReason = "interrupted"
        break
      }
    }
  }

  if (stoppedReason === "running") {
    stoppedReason = null
  }
  // Finalization replaces the last progress checkpoint with a consistent
  // summary (complete run, or an explicitly stopped and incomplete one).
  checkpoint()
  const summary = summarize()
  const artifactPath = artifactTarget

  return {
    mode: "live",
    blockedReason:
      stoppedReason !== null && scores.length === 0 ? stoppedReason : null,
    scores,
    summary,
    artifactPath,
    exitCode: summary.exitCode,
  }
}
