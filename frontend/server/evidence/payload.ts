/**
 * Fixed-artifact loading for the evidence layer.
 *
 * The production loader reads exactly one repository artifact. Its path is
 * derived from this module's own location and is never caller-supplied.
 * `loadEvidenceFromBytes` is the in-memory seam used by tests and by callers
 * that already hold the artifact bytes; it applies the same exact-byte hashing,
 * JSON parsing, and structured errors as the production loader.
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { artifactError } from "./guards.ts"
import { createEvidenceResolver, type EvidenceResolver } from "./resolver.ts"
import { DEFAULT_ARTIFACT_SOURCE, type EvidenceError } from "./types.ts"

const FIXED_PAYLOAD_PATH = fileURLToPath(
  new URL("../../../data/processed/dashboard_payload.json", import.meta.url)
)

export type PayloadArtifact = {
  /** Canonical repository artifact path; never caller-supplied. */
  readonly path: string
  /** Repository-relative label, used in evidence citations. */
  readonly source: string
  readonly bytes: Uint8Array
  readonly sha256: string
}

export type EvidenceService = {
  readonly artifact: PayloadArtifact
  readonly resolve: EvidenceResolver
}

export type LoadEvidenceResult =
  | { readonly ok: true; readonly service: EvidenceService }
  | { readonly ok: false; readonly error: EvidenceError }

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/**
 * Read the fixed repository payload and hash its exact bytes. Throws on read
 * failure; `loadEvidence` converts that into a structured error.
 */
export function loadPayloadArtifact(): PayloadArtifact {
  const bytes = new Uint8Array(readFileSync(FIXED_PAYLOAD_PATH))
  return {
    path: FIXED_PAYLOAD_PATH,
    source: DEFAULT_ARTIFACT_SOURCE,
    bytes,
    sha256: sha256Hex(bytes),
  }
}

/**
 * In-memory evidence seam: hash, parse, and validate artifact bytes without any
 * filesystem access. `null` represents an unavailable artifact so the loading
 * error path stays testable without an arbitrary-path production API.
 */
export function loadEvidenceFromBytes(
  bytes: Uint8Array | null,
  source: string = DEFAULT_ARTIFACT_SOURCE
): LoadEvidenceResult {
  if (bytes === null) {
    return {
      ok: false,
      error: artifactError(
        "unavailable_evidence",
        "The dashboard payload artifact could not be read.",
        { source }
      ),
    }
  }

  const sha256 = sha256Hex(bytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return {
      ok: false,
      error: artifactError(
        "invalid_evidence",
        "The dashboard payload artifact is not valid JSON.",
        { source }
      ),
    }
  }

  const created = createEvidenceResolver({
    payload: parsed,
    artifactSha256: sha256,
    artifactSource: source,
  })
  if (!created.ok) {
    return created
  }
  return {
    ok: true,
    service: {
      artifact: {
        path: FIXED_PAYLOAD_PATH,
        source,
        bytes: new Uint8Array(bytes),
        sha256,
      },
      resolve: created.resolve,
    },
  }
}

/**
 * Load the fixed aggregate artifact and return a resolver bound to its exact
 * bytes. Errors are structured: unreadable artifact is `unavailable_evidence`,
 * unparsable or structurally invalid artifact is `invalid_evidence`.
 */
export function loadEvidence(): LoadEvidenceResult {
  let bytes: Uint8Array
  try {
    bytes = loadPayloadArtifact().bytes
  } catch {
    return loadEvidenceFromBytes(null)
  }
  return loadEvidenceFromBytes(bytes)
}
