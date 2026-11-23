/**
 * Server-side retention copilot service (Milestone 3B).
 *
 * Flow: validated question -> exactly one 9router model call -> strict JSON
 * envelope parse -> existing evidence request parser -> existing evidence
 * resolver -> deterministic answer text built from verified evidence.
 *
 * No endpoint, UI, streaming, memory, retry, or failover. Importing this module
 * performs no network or filesystem work; everything happens inside ask().
 */
import {
  loadEvidence,
  type EvidenceEnvelope,
  type LoadEvidenceResult,
} from "../evidence/index.ts"
import { parseModelEnvelope } from "../evidence/probe-envelope.ts"
import { formatAnswer } from "./format.ts"
import { validateQuestionInput } from "./question.ts"
import { createNineRouterTransport } from "./transport.ts"
import {
  CONFIGURED_PROVIDER,
  CONFIGURED_ROUTE,
  CREDENTIAL_ENV_VAR,
  MAX_QUESTION_LENGTH,
  type CopilotError,
  type CopilotErrorCode,
  type CopilotResult,
  type ModelCallResult,
  type ModelFailureCategory,
  type ModelMetadata,
  type ModelTransport,
} from "./types.ts"

export const UNSUPPORTED_SCOPE_MESSAGE =
  "This question is outside the supported evidence scope. Supported evidence covers overall KPIs, single-contract metrics, comparisons of two contracts, highest-churn contract selection, and canonical definitions for the full Q2 2022 snapshot. Filtered, intersection, trend, predictive, causal, and customer-level questions are not supported."

const INVALID_QUESTION_MESSAGE = `The question could not be accepted. Provide exactly one 'question' string of at most ${MAX_QUESTION_LENGTH} characters.`

export type CopilotServiceDeps = {
  /** Server-side configuration; never read from client input. */
  readonly credential: string
  /** Injectable model transport (tests use fakes). */
  readonly transport?: ModelTransport
  /** Injectable evidence loader (tests use in-memory fixtures). */
  readonly loadEvidenceImpl?: () => LoadEvidenceResult
  /** Injectable clock for deterministic elapsed-time tests. */
  readonly now?: () => number
}

export type CopilotService = {
  readonly ask: (input: unknown) => Promise<CopilotResult>
}

function errorResult(
  code: CopilotErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>
): CopilotError {
  return details === undefined
    ? { kind: "error", code, message }
    : { kind: "error", code, message, details }
}

function transportFailure(
  category: ModelFailureCategory,
  status: number | null
): CopilotError {
  const details: Readonly<Record<string, unknown>> | undefined =
    status === null ? undefined : { status }
  switch (category) {
    case "connectivity":
      return errorResult(
        "model_connectivity",
        "The model route could not be reached.",
        details
      )
    case "timeout":
    case "aborted":
      return errorResult("model_timeout", "The model route timed out.", details)
    case "redirect_rejected":
      return errorResult(
        "model_redirect",
        "The model route attempted an unexpected redirect.",
        details
      )
    case "rate_limit":
      return errorResult(
        "model_rate_limit",
        "The model route reported a rate limit.",
        details
      )
    case "http_error":
      return errorResult(
        "model_http_error",
        status === null
          ? "The model route returned an HTTP error."
          : `The model route returned HTTP ${status}.`,
        details
      )
    case "invalid_provider_response":
    case "body_read_failed":
      return errorResult(
        "model_response",
        "The model route returned an unusable response.",
        details
      )
    case "truncated_completion":
      return errorResult(
        "model_truncated",
        "The model response was truncated before completion.",
        details
      )
    case "empty_content":
      return errorResult(
        "model_empty",
        "The model returned an empty response.",
        details
      )
    case "response_too_large":
      return errorResult(
        "model_response_too_large",
        "The model response exceeded the size limit.",
        details
      )
  }
}

function modelMetadata(result: ModelCallResult): ModelMetadata {
  return {
    provider: CONFIGURED_PROVIDER,
    configuredRoute: CONFIGURED_ROUTE,
    status: result.status,
    gatewayReportedModel: result.gatewayModel,
    usage: result.usage,
  }
}

export function createCopilotService(deps: CopilotServiceDeps): CopilotService {
  const transport =
    deps.transport ?? createNineRouterTransport({ credential: deps.credential })
  const loadEvidenceImpl = deps.loadEvidenceImpl ?? loadEvidence
  const now = deps.now ?? (() => Date.now())

  let cachedEvidence: LoadEvidenceResult | null = null
  const evidence = (): LoadEvidenceResult => {
    cachedEvidence ??= loadEvidenceImpl()
    return cachedEvidence
  }

  async function ask(input: unknown): Promise<CopilotResult> {
    const validated = validateQuestionInput(input)
    if (!validated.ok) {
      return {
        ...validated.error,
        message: INVALID_QUESTION_MESSAGE,
        details: { reason: validated.error.message },
      }
    }
    const question = validated.question

    if (deps.credential.trim() === "") {
      return errorResult(
        "missing_credential",
        "No server-side credential is configured for the model route.",
        { env: CREDENTIAL_ENV_VAR }
      )
    }

    const loaded = evidence()
    if (!loaded.ok) {
      const code =
        loaded.error.code === "unavailable_evidence"
          ? "evidence_unavailable"
          : "evidence_invalid"
      return errorResult(
        code,
        "The fixed evidence artifact could not be loaded.",
        {
          evidenceCode: loaded.error.code,
        }
      )
    }
    const service = loaded.service

    const startedAt = now()
    let result: ModelCallResult
    try {
      result = await transport(question)
    } catch {
      return errorResult(
        "model_response",
        "The model call failed unexpectedly."
      )
    }
    const elapsedMs = Math.max(0, now() - startedAt)

    if (!result.ok) {
      return transportFailure(result.category, result.status)
    }
    const model = modelMetadata(result)

    let envelopeValue: unknown
    try {
      envelopeValue = JSON.parse(result.content) as unknown
    } catch {
      return errorResult(
        "invalid_model_output",
        "The model output was not valid JSON.",
        { stage: "json_parse", status: result.status }
      )
    }

    const envelope = parseModelEnvelope(envelopeValue)
    if (!envelope.ok) {
      if (envelope.error.code === "invalid_request") {
        return errorResult(
          "invalid_request",
          "The model returned an invalid evidence request.",
          { envelopeCode: envelope.error.code, status: result.status }
        )
      }
      return errorResult(
        "invalid_model_output",
        "The model output did not match the required JSON envelope.",
        { envelopeCode: envelope.error.code, status: result.status }
      )
    }

    if (envelope.envelope.kind === "unsupported") {
      return {
        kind: "unsupported",
        question,
        reason: "unsupported_scope",
        message: UNSUPPORTED_SCOPE_MESSAGE,
        model,
        elapsedMs,
      }
    }

    const resolved = service.resolve(envelope.envelope.request)
    if (!resolved.ok) {
      const code =
        resolved.error.code === "unavailable_evidence"
          ? "evidence_unavailable"
          : "evidence_invalid"
      return errorResult(code, "The requested evidence is not available.", {
        evidenceCode: resolved.error.code,
      })
    }

    const evidenceEnvelope: EvidenceEnvelope = resolved.envelope
    return {
      kind: "answered",
      question,
      answerText: formatAnswer(evidenceEnvelope),
      request: envelope.envelope.request,
      evidence: evidenceEnvelope,
      model,
      elapsedMs,
    }
  }

  return { ask }
}
