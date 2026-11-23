/**
 * Strict parser for the route-compatibility probe's model output.
 *
 * The probe asks the model for exactly one of:
 *   {"kind":"supported","request":<EvidenceRequest>}
 *   {"kind":"unsupported","reason":"unsupported_scope"}
 *
 * This parser is deliberately strict: unknown fields are rejected, JSON is
 * never repaired, field types are never coerced, and a supported request is
 * validated only by the existing evidence request parser. The question sent to
 * the model is untrusted data; nothing here executes model instructions.
 */
import { isPlainObject } from "./guards.ts"
import { parseEvidenceRequest } from "./requests.ts"
import type { EvidenceRequest } from "./types.ts"

export const UNSUPPORTED_REASON = "unsupported_scope"

export type ModelEnvelope =
  | { readonly kind: "supported"; readonly request: EvidenceRequest }
  | { readonly kind: "unsupported"; readonly reason: "unsupported_scope" }

export type EnvelopeErrorCode =
  "invalid_envelope" | "invalid_request" | "unsupported_reason"

export type EnvelopeError = {
  readonly code: EnvelopeErrorCode
  readonly message: string
}

export type EnvelopeParseResult =
  | { readonly ok: true; readonly envelope: ModelEnvelope }
  | { readonly ok: false; readonly error: EnvelopeError }

const SUPPORTED_KEYS = new Set(["kind", "request"])
const UNSUPPORTED_KEYS = new Set(["kind", "reason"])

function invalidEnvelope(message: string): EnvelopeParseResult {
  return { ok: false, error: { code: "invalid_envelope", message } }
}

function unexpectedKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>
): string[] {
  return Object.keys(record)
    .filter((key) => !allowed.has(key))
    .sort()
}

/**
 * Parse one model response value into a validated envelope. Every failure mode
 * returns a structured error; no partial or substituted request is produced.
 */
export function parseModelEnvelope(value: unknown): EnvelopeParseResult {
  if (!isPlainObject(value)) {
    return invalidEnvelope("Model output must be a JSON object.")
  }

  const kind = value["kind"]
  if (typeof kind !== "string") {
    return invalidEnvelope("Model output is missing a string 'kind' field.")
  }

  if (kind === "supported") {
    const extra = unexpectedKeys(value, SUPPORTED_KEYS)
    if (extra.length > 0) {
      return invalidEnvelope(
        `Supported output has unsupported properties: ${extra.join(", ")}.`
      )
    }
    if (!Object.prototype.hasOwnProperty.call(value, "request")) {
      return invalidEnvelope("Supported output is missing 'request'.")
    }
    const parsed = parseEvidenceRequest(value["request"])
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: "invalid_request",
          message: `Nested request is invalid (${parsed.error.code}): ${parsed.error.message}`,
        },
      }
    }
    return { ok: true, envelope: { kind, request: parsed.request } }
  }

  if (kind === "unsupported") {
    const extra = unexpectedKeys(value, UNSUPPORTED_KEYS)
    if (extra.length > 0) {
      return invalidEnvelope(
        `Unsupported output has unsupported properties: ${extra.join(", ")}.`
      )
    }
    if (!Object.prototype.hasOwnProperty.call(value, "reason")) {
      return invalidEnvelope("Unsupported output is missing 'reason'.")
    }
    const reason = value["reason"]
    if (typeof reason !== "string") {
      return invalidEnvelope("Unsupported output 'reason' must be a string.")
    }
    if (reason !== UNSUPPORTED_REASON) {
      return {
        ok: false,
        error: {
          code: "unsupported_reason",
          message: `Unsupported output 'reason' must be '${UNSUPPORTED_REASON}'.`,
        },
      }
    }
    return { ok: true, envelope: { kind, reason } }
  }

  return invalidEnvelope(`Unknown model output kind: ${JSON.stringify(kind)}.`)
}
