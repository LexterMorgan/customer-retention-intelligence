/**
 * Contract tests for the fixed dashboard payload artifact loading.
 *
 * Production loading has no caller-supplied path: the repository aggregate
 * artifact is the only production source. Fixture coverage uses the in-memory
 * byte seam (`loadEvidenceFromBytes`) and touches no files other than the
 * read-only repository artifact itself.
 */
import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { test } from "node:test"

import assert from "node:assert/strict"

import {
  loadEvidence,
  loadEvidenceFromBytes,
  loadPayloadArtifact,
} from "./payload.ts"
import type { EvidenceService, LoadEvidenceResult } from "./payload.ts"
import type { EvidenceError } from "./types.ts"

const PAYLOAD_SOURCE = "data/processed/dashboard_payload.json"
const PAYLOAD_FILENAME = join("data", "processed", "dashboard_payload.json")
const SNAPSHOT = "Q2 2022"
const REAL_CHURN_RATE_PCT = 28.37
const CHANGED_CHURN_RATE_PCT = 99.5

/** Minimal KPI block the validator requires, carrying the real values. */
const MINIMAL_KPIS = {
  total_customers: 7043,
  existing_customers: 6589,
  churned_customers: 1869,
  retained_customers: 4720,
  joined_customers: 454,
  churn_rate_pct: REAL_CHURN_RATE_PCT,
  retention_rate_pct: 71.63,
  mrvl: 137086.65,
}

const CONTRACT_ROW_METRICS = {
  existing_customers: 1,
  churned_customers: 1,
  retained_customers: 1,
  churn_rate_pct: 1,
  pct_of_total_churn: 1,
}

function sha256OfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function sha256OfFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function bytesOf(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function payloadBytes(overrides: {
  readonly churnRatePct?: number
  readonly contracts?: unknown
}): Uint8Array {
  return bytesOf({
    metadata: { snapshot: SNAPSHOT },
    kpis: {
      ...MINIMAL_KPIS,
      ...(overrides.churnRatePct === undefined
        ? {}
        : { churn_rate_pct: overrides.churnRatePct }),
    },
    by_contract: overrides.contracts ?? [],
  })
}

/** Narrow a load result to its service, failing the test otherwise. */
function expectService(result: LoadEvidenceResult): EvidenceService {
  if (!result.ok) {
    assert.fail(
      `expected the evidence to load, received ${result.error.code}: ${result.error.message}`
    )
  }
  return result.service
}

/** Narrow a load result to its error, failing the test otherwise. */
function expectLoadFailure(result: LoadEvidenceResult): EvidenceError {
  if (result.ok) {
    assert.fail("expected the evidence loader to return an error")
  }
  return result.error
}

test("loadPayloadArtifact returns the fixed artifact with an independent digest", () => {
  const artifact = loadPayloadArtifact()

  assert.equal(artifact.source, PAYLOAD_SOURCE)
  assert.equal(isAbsolute(artifact.path), true)
  assert.ok(artifact.path.endsWith(PAYLOAD_FILENAME))
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/)
  assert.equal(artifact.sha256, sha256OfFile(artifact.path))
  assert.equal(artifact.bytes.length, statSync(artifact.path).size)
})

test("production loading functions accept no caller-supplied path", () => {
  assert.equal(loadEvidence.length, 0)
  assert.equal(loadPayloadArtifact.length, 0)
  assert.ok(loadEvidenceFromBytes.length >= 1)
})

test("loadEvidence resolves the churn rate KPI from the default artifact", () => {
  const loaded = loadEvidence()
  const service = expectService(loaded)

  assert.equal(Object.hasOwn(loaded, "error"), false)
  assert.equal(service.artifact.sha256, sha256OfFile(service.artifact.path))

  const resolved = service.resolve({
    operation: "get_kpi",
    metric: "churn_rate_pct",
  })
  if (!resolved.ok) {
    assert.fail(
      `expected the churn rate request to resolve, received ${resolved.error.code}: ${resolved.error.message}`
    )
  }
  const envelope = resolved.envelope
  assert.equal(envelope.snapshot, SNAPSHOT)
  assert.equal(envelope.artifact.source, PAYLOAD_SOURCE)
  assert.equal(envelope.artifact.sha256, service.artifact.sha256)

  const fact = envelope.facts.find(
    (candidate) => candidate.metric.id === "churn_rate_pct"
  )
  assert.ok(fact, "expected a churn rate fact in the envelope")
  assert.equal(fact.value, REAL_CHURN_RATE_PCT)
  assert.equal(fact.unit.kind, "percentage")
})

test("loadEvidence and loadPayloadArtifact are deterministic across calls", () => {
  const firstService = expectService(loadEvidence())
  const secondService = expectService(loadEvidence())
  assert.equal(firstService.artifact.sha256, secondService.artifact.sha256)

  const firstArtifact = loadPayloadArtifact()
  const secondArtifact = loadPayloadArtifact()
  assert.equal(firstArtifact.sha256, secondArtifact.sha256)
  assert.deepEqual(firstArtifact.bytes, secondArtifact.bytes)
})

test("loadEvidence leaves the payload artifact untouched", () => {
  const payloadPath = loadPayloadArtifact().path
  const before = sha256OfFile(payloadPath)

  expectService(loadEvidence())

  assert.equal(sha256OfFile(payloadPath), before)
})

test("an unavailable artifact is reported as unavailable_evidence", () => {
  const error = expectLoadFailure(loadEvidenceFromBytes(null))

  assert.equal(error.kind, "evidence")
  assert.equal(error.code, "unavailable_evidence")
  assert.ok(error.message.length > 0, "expected a non-empty error message")
  assert.equal(error.details?.source, PAYLOAD_SOURCE)
  assert.equal(Object.hasOwn(error, "envelope"), false)
})

test("malformed JSON bytes are reported as invalid_evidence", () => {
  const error = expectLoadFailure(
    loadEvidenceFromBytes(new TextEncoder().encode("not json{"))
  )

  assert.equal(error.kind, "evidence")
  assert.equal(error.code, "invalid_evidence")
  assert.ok(error.message.length > 0, "expected a non-empty error message")
})

test("a structurally invalid payload is reported as invalid_evidence", () => {
  const error = expectLoadFailure(loadEvidenceFromBytes(bytesOf({})))

  assert.equal(error.kind, "evidence")
  assert.equal(error.code, "invalid_evidence")
})

test("duplicate contract categories are reported as invalid_evidence", () => {
  const error = expectLoadFailure(
    loadEvidenceFromBytes(
      payloadBytes({
        contracts: [
          { category: "Month-to-Month", ...CONTRACT_ROW_METRICS },
          { category: "Month-to-Month", ...CONTRACT_ROW_METRICS },
        ],
      })
    )
  )

  assert.equal(error.kind, "evidence")
  assert.equal(error.code, "invalid_evidence")
})

test("binds resolution and digest to the supplied bytes", () => {
  const changedBytes = payloadBytes({ churnRatePct: CHANGED_CHURN_RATE_PCT })
  const expectedSha = sha256OfBytes(changedBytes)

  const service = expectService(loadEvidenceFromBytes(changedBytes))
  assert.equal(service.artifact.sha256, expectedSha)
  assert.notEqual(service.artifact.sha256, loadPayloadArtifact().sha256)

  const resolved = service.resolve({
    operation: "get_kpi",
    metric: "churn_rate_pct",
  })
  if (!resolved.ok) {
    assert.fail(
      `expected the supplied payload to resolve, received ${resolved.error.code}: ${resolved.error.message}`
    )
  }
  assert.equal(resolved.envelope.artifact.sha256, expectedSha)

  const fact = resolved.envelope.facts.find(
    (candidate) => candidate.metric.id === "churn_rate_pct"
  )
  assert.ok(fact, "expected a churn rate fact in the envelope")
  assert.equal(fact.value, CHANGED_CHURN_RATE_PCT)
})

test("a one-byte change to valid payload bytes changes the artifact digest", () => {
  const original = payloadBytes({ churnRatePct: REAL_CHURN_RATE_PCT })
  const changed = payloadBytes({ churnRatePct: 28.38 })
  assert.equal(original.length, changed.length)

  const differing = original.reduce(
    (count, byte, index) => (byte === changed[index] ? count : count + 1),
    0
  )
  assert.equal(differing, 1)

  const originalService = expectService(loadEvidenceFromBytes(original))
  const changedService = expectService(loadEvidenceFromBytes(changed))
  assert.notEqual(
    originalService.artifact.sha256,
    changedService.artifact.sha256
  )
})

test("error results carry no envelope and success results carry no error", () => {
  const loaded = loadEvidence()
  const service = expectService(loaded)
  assert.equal(Object.hasOwn(loaded, "error"), false)

  const unavailable = loadEvidenceFromBytes(null)
  const error = expectLoadFailure(unavailable)
  assert.equal(Object.hasOwn(unavailable, "envelope"), false)
  assert.equal(Object.hasOwn(error, "envelope"), false)

  const unsupported = service.resolve({
    operation: "not_a_supported_operation",
  })
  if (unsupported.ok) {
    assert.fail("expected an unsupported request to fail")
  }
  assert.equal(Object.hasOwn(unsupported, "envelope"), false)
  assert.equal(Object.hasOwn(unsupported.error, "envelope"), false)
})
