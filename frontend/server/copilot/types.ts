/**
 * Public types for the server-side retention copilot service (Milestone 3B).
 *
 * The service turns one validated question into exactly one local 9router model
 * call, validates the model's structured envelope, resolves the interpreted
 * evidence request against the fixed aggregate payload, and builds a
 * deterministic cited answer from verified evidence only.
 *
 * No endpoint, UI, deployment, streaming, memory, retry, or failover.
 */
import type { EvidenceEnvelope, EvidenceRequest } from "../evidence/index.ts"

/** Configured provenance, never derived from model output. */
export const CONFIGURED_PROVIDER = "9router"
export const CONFIGURED_ROUTE = "free-models"
export const NINE_ROUTER_ENDPOINT = "http://localhost:20128/v1/chat/completions"

/** Project-specific server-side credential variable (never VITE_*). */
export const CREDENTIAL_ENV_VAR = "RETENTION_COPILOT_API_KEY"

export const MAX_QUESTION_LENGTH = 400

/**
 * Sanitized transport failure categories. No upstream body, header, or
 * credential is ever attached.
 */
export type ModelFailureCategory =
  | "connectivity"
  | "timeout"
  | "redirect_rejected"
  | "rate_limit"
  | "http_error"
  | "invalid_provider_response"
  | "truncated_completion"
  | "empty_content"
  | "response_too_large"
  | "body_read_failed"
  | "aborted"

/** Result of exactly one model call. */
export type ModelCallResult =
  | {
      readonly ok: true
      readonly status: number
      readonly content: string
      readonly usage: Readonly<Record<string, number>> | null
      readonly gatewayModel: string | null
    }
  | {
      readonly ok: false
      readonly status: number | null
      readonly category: ModelFailureCategory
      readonly usage: null
      readonly gatewayModel: null
    }

/** Injectable one-call transport. Must not be invoked at import time. */
export type ModelTransport = (question: string) => Promise<ModelCallResult>

export type ModelMetadata = {
  readonly provider: typeof CONFIGURED_PROVIDER
  readonly configuredRoute: typeof CONFIGURED_ROUTE
  readonly status: number | null
  readonly gatewayReportedModel: string | null
  readonly usage: Readonly<Record<string, number>> | null
}

export type CopilotErrorCode =
  | "invalid_question"
  | "missing_credential"
  | "model_connectivity"
  | "model_timeout"
  | "model_redirect"
  | "model_rate_limit"
  | "model_http_error"
  | "model_response"
  | "model_truncated"
  | "model_empty"
  | "model_response_too_large"
  | "invalid_model_output"
  | "invalid_request"
  | "evidence_unavailable"
  | "evidence_invalid"

export type CopilotError = {
  readonly kind: "error"
  readonly code: CopilotErrorCode
  readonly message: string
  /** Sanitized metadata only: codes, stages, and HTTP status. */
  readonly details?: Readonly<Record<string, unknown>>
}

export type CopilotAnswered = {
  readonly kind: "answered"
  readonly question: string
  /** Deterministic text built only from verified evidence facts/definitions. */
  readonly answerText: string
  /** Validated interpretation of the question (inspectable by the caller). */
  readonly request: EvidenceRequest
  readonly evidence: EvidenceEnvelope
  readonly model: ModelMetadata
  readonly elapsedMs: number
}

export type CopilotUnsupported = {
  readonly kind: "unsupported"
  readonly question: string
  readonly reason: "unsupported_scope"
  /** Fixed application text describing the supported scope. */
  readonly message: string
  readonly model: ModelMetadata
  readonly elapsedMs: number
}

export type CopilotResult = CopilotAnswered | CopilotUnsupported | CopilotError

export type QuestionValidation =
  | { readonly ok: true; readonly question: string }
  | { readonly ok: false; readonly error: CopilotError }
