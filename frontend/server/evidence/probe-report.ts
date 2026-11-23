/**
 * Pure acceptance and reporting logic for the 9router compatibility probe.
 *
 * This module must stay free of network, filesystem, credential, and probe
 * startup effects so tests can import it directly without executing live calls.
 * It only turns sanitized per-case observations into pass/fail outcomes and a
 * run summary with an explicit exit code.
 */

export type CaseExpectedKind = "supported" | "unsupported"

export type EnvelopeValidationResult =
  | "ok"
  | "not_attempted"
  | "invalid_json_content"
  | "invalid_envelope"
  | "invalid_request"
  | "unsupported_reason"

/** Sanitized observation collected for one attempted case. */
export type CaseObservation = {
  readonly caseId: string
  readonly expected: CaseExpectedKind
  /** True only when the provider request completed and the body was read. */
  readonly requestSucceeded: boolean
  /** Actual HTTP status, when a response was received; null otherwise. */
  readonly status: number | null
  /** "ok" for a successful request, otherwise a sanitized error category. */
  readonly category: string
  readonly elapsedMs: number
  /** Gateway-reported model for THIS case only; null when absent. */
  readonly gatewayModel: string | null
  readonly envelopeValidation: EnvelopeValidationResult
  readonly intentMatch: boolean | "n/a"
  /**
   * "n/a" when not applicable, otherwise `ok:<n>_facts` or an evidence error
   * code such as `unavailable_evidence`.
   */
  readonly evidenceResolution: string
  readonly usage: Readonly<Record<string, number>> | null
}

export type CaseOutcome = CaseObservation & {
  readonly passed: boolean
}

export type RunSummary = {
  readonly planned: number
  readonly attempted: number
  readonly passed: number
  readonly failed: number
  readonly unattempted: number
  readonly stoppedReason: string | null
  readonly success: boolean
  readonly exitCode: 0 | 1
}

const RESOLVED_EVIDENCE = /^ok:\d+_facts$/

function isSuccessfulHttpStatus(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300
}

/**
 * A case passes only when the provider request succeeded, validation passed,
 * the expected intent matched, and — for expected supported cases only — the
 * evidence resolved locally. Expected unsupported cases require only the exact
 * valid unsupported envelope; evidence resolution is not required.
 */
export function evaluateCase(observation: CaseObservation): CaseOutcome {
  const providerSucceeded =
    observation.requestSucceeded && isSuccessfulHttpStatus(observation.status)
  const validationPassed = observation.envelopeValidation === "ok"
  const intentPassed = observation.intentMatch === true
  const evidencePassed =
    observation.expected === "supported"
      ? RESOLVED_EVIDENCE.test(observation.evidenceResolution)
      : true
  return {
    ...observation,
    passed:
      providerSucceeded && validationPassed && intentPassed && evidencePassed,
  }
}

/**
 * Overall success requires every planned case to be attempted, every attempted
 * case to pass, and no early-stop reason. Any failed, incomplete, or stopped
 * run exits nonzero (blocked runs are reported separately by the probe with
 * exit code 2 before this summary exists).
 */
export function summarizeRun(
  outcomes: readonly CaseOutcome[],
  planned: number,
  stoppedReason: string | null
): RunSummary {
  const attempted = outcomes.length
  const passed = outcomes.filter((outcome) => outcome.passed).length
  const failed = attempted - passed
  const unattempted = Math.max(0, planned - attempted)
  const success =
    planned > 0 &&
    stoppedReason === null &&
    attempted === planned &&
    failed === 0 &&
    passed === planned
  return {
    planned,
    attempted,
    passed,
    failed,
    unattempted,
    stoppedReason,
    success,
    exitCode: success ? 0 : 1,
  }
}
