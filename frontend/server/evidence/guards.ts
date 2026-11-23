/** Small runtime guards and structured error constructors. */
import {
  SUPPORTED_CONTRACTS,
  type EvidenceError,
  type EvidenceErrorCode,
  type EvidenceErrorKind,
  type SupportedContract,
} from "./types.ts"

export function isSupportedContract(value: string): value is SupportedContract {
  return (SUPPORTED_CONTRACTS as readonly string[]).includes(value)
}

/**
 * Accepts only plain JSON-style objects. Anything with a custom prototype
 * (class instances, `Object.create(...)` objects) is rejected so inherited
 * properties can never satisfy the request allowlists.
 */
export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function makeError(
  kind: EvidenceErrorKind,
  code: EvidenceErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>
): EvidenceError {
  return details === undefined
    ? { kind, code, message }
    : { kind, code, message, details }
}

/** A malformed/unsupported request from the caller. */
export function requestError(
  code: EvidenceErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>
): EvidenceError {
  return makeError("request", code, message, details)
}

/** A missing or malformed payload artifact (not the caller's fault). */
export function artifactError(
  code: EvidenceErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>
): EvidenceError {
  return makeError("evidence", code, message, details)
}

/** Keys present on a record that the operation does not allow, sorted. */
export function unexpectedKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>
): string[] {
  return Object.keys(record)
    .filter((key) => !allowed.has(key))
    .sort()
}

/** Short, log-safe description of an arbitrary value for error details. */
export function describeValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(
      value.length > 60 ? `${value.slice(0, 60)}...` : value
    )
  }
  if (value === null) {
    return "null"
  }
  if (Array.isArray(value)) {
    return "array"
  }
  return typeof value
}
