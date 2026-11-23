/**
 * Offline contract tests for the pure probe acceptance and reporting logic.
 *
 * `evaluateCase` and `summarizeRun` are the only judges of a probe run: they
 * turn sanitized per-case observations into a verdict and a summary with the
 * process exit code. These tests pin the acceptance matrix, the evidence
 * exemption for correctly rejected unsupported requests, incomplete and
 * early-stopped runs, per-case gateway model identity, provider failures, and
 * the purity guarantees that let the probe reuse these objects.
 *
 * The module has no network, filesystem, credential, or startup effects, so
 * importing it here starts nothing.
 */
import { strict as assert } from "node:assert"
import { describe, test } from "node:test"

import { evaluateCase, summarizeRun } from "./probe-report.ts"
import type {
  CaseObservation,
  CaseOutcome,
  EnvelopeValidationResult,
} from "./probe-report.ts"

/** A fully passing supported observation; each test overrides what it targets. */
const BASE_OBSERVATION: CaseObservation = {
  caseId: "case-001",
  expected: "supported",
  requestSucceeded: true,
  status: 200,
  category: "ok",
  elapsedMs: 42,
  gatewayModel: null,
  envelopeValidation: "ok",
  intentMatch: true,
  evidenceResolution: "ok:1_facts",
  usage: { input_tokens: 12, output_tokens: 7 },
}

const INVALID_ENVELOPE_RESULTS: readonly EnvelopeValidationResult[] = [
  "invalid_json_content",
  "invalid_envelope",
]

/** Builds an observation from the passing baseline, then applies overrides. */
function observation(
  overrides: Partial<CaseObservation> = {}
): CaseObservation {
  return { ...BASE_OBSERVATION, ...overrides }
}

/** A correctly rejected unsupported case: evidence resolution is not required. */
function unsupportedObservation(
  overrides: Partial<CaseObservation> = {}
): CaseObservation {
  return observation({
    expected: "unsupported",
    evidenceResolution: "n/a",
    ...overrides,
  })
}

/** Five passing cases: three resolved supported ones plus two unsupported. */
function validObservations(): CaseObservation[] {
  return [
    observation({ caseId: "supported-1", evidenceResolution: "ok:1_facts" }),
    observation({ caseId: "supported-10", evidenceResolution: "ok:10_facts" }),
    observation({ caseId: "supported-0", evidenceResolution: "ok:0_facts" }),
    unsupportedObservation({ caseId: "unsupported-1" }),
    unsupportedObservation({ caseId: "unsupported-2" }),
  ]
}

function evaluateAll(observations: readonly CaseObservation[]): CaseOutcome[] {
  return observations.map((item) => evaluateCase(item))
}

describe("evaluateCase acceptance", () => {
  test("six valid matching cases all pass", () => {
    const observations: readonly CaseObservation[] = [
      observation({ caseId: "supported-1", evidenceResolution: "ok:1_facts" }),
      observation({
        caseId: "supported-10",
        evidenceResolution: "ok:10_facts",
      }),
      observation({ caseId: "supported-0", evidenceResolution: "ok:0_facts" }),
      unsupportedObservation({ caseId: "unsupported-1" }),
      unsupportedObservation({ caseId: "unsupported-2" }),
      unsupportedObservation({ caseId: "unsupported-3" }),
    ]

    const outcomes = evaluateAll(observations)
    assert.equal(outcomes.length, 6)
    for (const outcome of outcomes) {
      assert.equal(outcome.passed, true, `${outcome.caseId} must pass`)
    }

    assert.deepEqual(summarizeRun(outcomes, 6, null), {
      planned: 6,
      attempted: 6,
      passed: 6,
      failed: 0,
      unattempted: 0,
      stoppedReason: null,
      success: true,
      exitCode: 0,
    })
  })

  for (const invalidResult of INVALID_ENVELOPE_RESULTS) {
    test(`one completed call with ${invalidResult} fails the run`, () => {
      const observations: readonly CaseObservation[] = [
        ...validObservations(),
        observation({
          caseId: "invalid-envelope",
          category: invalidResult,
          envelopeValidation: invalidResult,
          intentMatch: "n/a",
          evidenceResolution: "n/a",
        }),
      ]

      const outcomes = evaluateAll(observations)
      assert.equal(outcomes.length, 6)
      assert.equal(outcomes[5].envelopeValidation, invalidResult)
      assert.equal(outcomes[5].passed, false)
      for (const outcome of outcomes.slice(0, 5)) {
        assert.equal(outcome.passed, true, `${outcome.caseId} must pass`)
      }

      assert.deepEqual(summarizeRun(outcomes, 6, null), {
        planned: 6,
        attempted: 6,
        passed: 5,
        failed: 1,
        unattempted: 0,
        stoppedReason: null,
        success: false,
        exitCode: 1,
      })
    })
  }

  test("valid response with mismatched intent fails", () => {
    const outcome = evaluateCase(observation({ intentMatch: false }))
    assert.equal(outcome.status, 200)
    assert.equal(outcome.envelopeValidation, "ok")
    assert.equal(outcome.intentMatch, false)
    assert.equal(outcome.passed, false)
  })

  test("supported request with unresolved evidence fails", () => {
    const observations: readonly CaseObservation[] = [
      observation({
        caseId: "unavailable",
        evidenceResolution: "unavailable_evidence",
      }),
      observation({
        caseId: "invalid",
        evidenceResolution: "invalid_evidence",
      }),
      observation({ caseId: "bare-ok", evidenceResolution: "ok" }),
    ]

    const outcomes = evaluateAll(observations)
    for (const outcome of outcomes) {
      assert.equal(outcome.envelopeValidation, "ok")
      assert.equal(outcome.intentMatch, true)
      assert.equal(outcome.passed, false, `${outcome.caseId} must fail`)
    }

    const summary = summarizeRun(outcomes, 3, null)
    assert.equal(summary.passed, 0)
    assert.equal(summary.failed, 3)
    assert.equal(summary.success, false)
    assert.equal(summary.exitCode, 1)
  })

  test("correctly rejected unsupported case passes without evidence", () => {
    const outcome = evaluateCase(
      unsupportedObservation({ caseId: "unsupported-only" })
    )
    assert.equal(outcome.expected, "unsupported")
    assert.equal(outcome.status, 200)
    assert.equal(outcome.envelopeValidation, "ok")
    assert.equal(outcome.intentMatch, true)
    assert.equal(outcome.evidenceResolution, "n/a")
    assert.equal(outcome.passed, true)
    assert.equal(summarizeRun([outcome], 1, null).success, true)
  })
})

describe("summarizeRun incomplete runs", () => {
  test("stopped run with unattempted cases fails", () => {
    const outcomes = evaluateAll(validObservations())
    assert.equal(outcomes.length, 5)
    assert.ok(outcomes.every((outcome) => outcome.passed))

    assert.deepEqual(summarizeRun(outcomes, 6, "timeout"), {
      planned: 6,
      attempted: 5,
      passed: 5,
      failed: 0,
      unattempted: 1,
      stoppedReason: "timeout",
      success: false,
      exitCode: 1,
    })
  })

  test("all planned cases passing still fails when a stop reason exists", () => {
    const outcomes = evaluateAll([
      ...validObservations(),
      observation({
        caseId: "supported-extra",
        evidenceResolution: "ok:3_facts",
      }),
    ])
    assert.equal(outcomes.length, 6)
    assert.ok(outcomes.every((outcome) => outcome.passed))

    assert.deepEqual(summarizeRun(outcomes, 6, "http_429"), {
      planned: 6,
      attempted: 6,
      passed: 6,
      failed: 0,
      unattempted: 0,
      stoppedReason: "http_429",
      success: false,
      exitCode: 1,
    })
  })
})

describe("gateway model identity", () => {
  test("each outcome keeps its own model and the summary has no model field", () => {
    const first = evaluateCase(
      observation({ caseId: "model-a-case", gatewayModel: "model-a" })
    )
    const second = evaluateCase(
      observation({ caseId: "model-b-case", gatewayModel: "model-b" })
    )

    assert.equal(first.passed, true)
    assert.equal(second.passed, true)
    assert.equal(first.gatewayModel, "model-a")
    assert.equal(second.gatewayModel, "model-b")

    const summary = summarizeRun([first, second], 2, null)
    assert.equal("gatewayModel" in summary, false)
    assert.deepEqual(Object.keys(summary).sort(), [
      "attempted",
      "exitCode",
      "failed",
      "passed",
      "planned",
      "stoppedReason",
      "success",
      "unattempted",
    ])
  })

  test("absent gateway model stays null on the outcome", () => {
    const outcome = evaluateCase(observation({ gatewayModel: null }))
    assert.equal("gatewayModel" in outcome, true)
    assert.equal(outcome.gatewayModel, null)
    assert.equal(outcome.passed, true)
  })
})

describe("provider and transport failures", () => {
  test("failed request without a response fails", () => {
    const outcome = evaluateCase(
      observation({
        requestSucceeded: false,
        status: null,
        category: "transport_error",
        envelopeValidation: "not_attempted",
        intentMatch: "n/a",
        evidenceResolution: "n/a",
      })
    )
    assert.equal(outcome.requestSucceeded, false)
    assert.equal(outcome.status, null)
    assert.equal(outcome.envelopeValidation, "not_attempted")
    assert.equal(outcome.passed, false)
  })

  test("non-2xx status cannot pass", () => {
    for (const status of [199, 302, 404, 500]) {
      const outcome = evaluateCase(observation({ status }))
      assert.equal(outcome.requestSucceeded, true)
      assert.equal(outcome.envelopeValidation, "ok")
      assert.equal(outcome.intentMatch, true)
      assert.equal(outcome.passed, false, `status ${status} must fail`)
    }
  })
})

describe("purity", () => {
  test("evaluateCase does not mutate a frozen observation", () => {
    const usage = Object.freeze({ input_tokens: 12, output_tokens: 7 })
    const frozen = Object.freeze({ ...BASE_OBSERVATION, usage })
    const expected = { ...BASE_OBSERVATION, usage }

    assert.ok(Object.isFrozen(frozen))
    assert.ok(Object.isFrozen(usage))
    assert.equal("passed" in frozen, false)

    const outcome = evaluateCase(frozen)

    assert.notStrictEqual(outcome, frozen)
    assert.equal("passed" in outcome, true)
    assert.equal(outcome.passed, true)
    assert.equal(outcome.caseId, frozen.caseId)
    assert.deepEqual(outcome.usage, { input_tokens: 12, output_tokens: 7 })
    assert.deepEqual(frozen, expected)
    assert.equal("passed" in frozen, false)
  })

  test("summarizeRun does not mutate the outcomes array", () => {
    const outcomes = Object.freeze(evaluateAll(validObservations()))
    const snapshot = outcomes.map((item) => ({ ...item }))

    assert.ok(Object.isFrozen(outcomes))
    const summary = summarizeRun(outcomes, 6, "timeout")

    assert.equal(summary.attempted, 5)
    assert.equal(outcomes.length, snapshot.length)
    assert.deepEqual(outcomes, snapshot)
    assert.deepEqual(summarizeRun(outcomes, 6, "timeout"), summary)
  })
})
