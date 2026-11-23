/**
 * Contract tests for the strict route-compatibility probe envelope parser.
 *
 * `parseModelEnvelope` is the trust boundary for raw model output: exactly two
 * shapes are accepted, unknown fields are rejected on both branches, and no
 * value is ever repaired, coerced, or substituted. The nested request is
 * delegated to the existing evidence request parser, so that parser's rejection
 * code is surfaced inside the envelope error message rather than flattened.
 *
 * Accepted results must stay fresh and unwired from caller input: the returned
 * request is a new object, and a rejected input still produces no envelope.
 */
import { strict as assert } from "node:assert"
import { describe, test } from "node:test"

import { parseModelEnvelope, UNSUPPORTED_REASON } from "./probe-envelope.ts"
import type {
  EnvelopeError,
  EnvelopeErrorCode,
  ModelEnvelope,
} from "./probe-envelope.ts"

type SupportedEnvelope = Extract<ModelEnvelope, { readonly kind: "supported" }>
type UnsupportedEnvelope = Extract<
  ModelEnvelope,
  { readonly kind: "unsupported" }
>

/** The only rejection codes the module may produce. */
const DOCUMENTED_CODES: readonly EnvelopeErrorCode[] = [
  "invalid_envelope",
  "invalid_request",
  "unsupported_reason",
]

const NON_OBJECT_INPUTS: readonly unknown[] = [
  null,
  undefined,
  "supported",
  42,
  [],
  true,
]

const SUPPORTED_EXTRA_FIELDS: readonly (readonly [string, unknown])[] = [
  ["filter", "contract:One Year"],
  ["path", "kpis.churn_rate_pct"],
  ["payload", { kpis: { churn_rate_pct: 26.5 } }],
  ["reason", UNSUPPORTED_REASON],
]

const UNSUPPORTED_EXTRA_FIELDS: readonly (readonly [string, unknown])[] = [
  ["filter", "contract:One Year"],
  ["path", "kpis.churn_rate_pct"],
]

const INVALID_INPUTS: readonly unknown[] = [
  null,
  undefined,
  "supported",
  42,
  [],
  true,
  {},
  { kind: 5 },
  { kind: null },
  { kind: "maybe" },
  { kind: "supported" },
  { kind: "supported", request: null },
  { kind: "supported", request: { operation: "get_kpi", metric: "revenue" } },
  {
    kind: "supported",
    request: { operation: "highest_churn_contract", filter: "x" },
  },
  {
    kind: "supported",
    request: {
      operation: "compare_contracts",
      contracts: ["One Year", "One Year"],
    },
  },
  { kind: "unsupported" },
  { kind: "unsupported", reason: "unsupported" },
  { kind: "unsupported", reason: 5 },
]

const VALID_INPUTS: readonly unknown[] = [
  { kind: "supported", request: { operation: "get_kpi", metric: "mrvl" } },
  { kind: "supported", request: { operation: "highest_churn_contract" } },
  {
    kind: "supported",
    request: { operation: "get_definition", definition: "churn_rate" },
  },
  {
    kind: "supported",
    request: {
      operation: "compare_contracts",
      contracts: ["One Year", "Two Year"],
    },
  },
  { kind: "unsupported", reason: UNSUPPORTED_REASON },
]

function describeInput(input: unknown): string {
  if (input === undefined) {
    return "undefined"
  }
  return JSON.stringify(input)
}

function expectOk(input: unknown): ModelEnvelope {
  const result = parseModelEnvelope(input)
  if (!result.ok) {
    assert.fail(
      `expected acceptance for ${describeInput(input)}, received ${result.error.code}: ${result.error.message}`
    )
  }
  assert.strictEqual(Object.hasOwn(result, "error"), false)
  assert.strictEqual(Object.hasOwn(result, "envelope"), true)
  return result.envelope
}

function expectSupported(input: unknown): SupportedEnvelope {
  const envelope = expectOk(input)
  if (envelope.kind !== "supported") {
    assert.fail(
      `expected a supported envelope for ${describeInput(input)}, received kind '${envelope.kind}'`
    )
  }
  return envelope
}

function expectUnsupported(input: unknown): UnsupportedEnvelope {
  const envelope = expectOk(input)
  if (envelope.kind !== "unsupported") {
    assert.fail(
      `expected an unsupported envelope for ${describeInput(input)}, received kind '${envelope.kind}'`
    )
  }
  return envelope
}

function expectError(
  input: unknown,
  code: EnvelopeErrorCode,
  mentions?: string
): EnvelopeError {
  const result = parseModelEnvelope(input)
  if (result.ok) {
    assert.fail(
      `expected ${code} for ${describeInput(input)}, received envelope ${describeInput(result.envelope)}`
    )
  }
  const error = result.error
  assert.strictEqual(error.code, code)
  assert.strictEqual(typeof error.message, "string")
  assert.ok(error.message.trim().length > 0, "error message must not be empty")
  if (mentions !== undefined) {
    assert.ok(
      error.message.includes(mentions),
      `expected rejection of ${describeInput(input)} to name '${mentions}', got: ${error.message}`
    )
  }
  return error
}

describe("supported envelopes", () => {
  test("accepts get_kpi and normalizes the request", () => {
    const request = { operation: "get_kpi", metric: "churn_rate_pct" }
    const envelope = expectSupported({ kind: "supported", request })

    assert.strictEqual(envelope.kind, "supported")
    assert.deepStrictEqual(Object.keys(envelope), ["kind", "request"])
    assert.strictEqual(Object.hasOwn(envelope, "reason"), false)
    assert.deepStrictEqual(envelope.request, request)
    assert.deepStrictEqual(Object.keys(envelope.request), [
      "operation",
      "metric",
    ])
  })

  test("accepts highest_churn_contract with only the operation key", () => {
    const envelope = expectSupported({
      kind: "supported",
      request: { operation: "highest_churn_contract" },
    })

    assert.deepStrictEqual(envelope.request, {
      operation: "highest_churn_contract",
    })
    assert.deepStrictEqual(Object.keys(envelope.request), ["operation"])
    assert.strictEqual(Object.hasOwn(envelope.request, "metric"), false)
    assert.strictEqual(Object.hasOwn(envelope.request, "contract"), false)
  })

  test("accepts get_definition for the mrvl definition", () => {
    const envelope = expectSupported({
      kind: "supported",
      request: { operation: "get_definition", definition: "mrvl" },
    })

    assert.deepStrictEqual(envelope.request, {
      operation: "get_definition",
      definition: "mrvl",
    })
    assert.deepStrictEqual(Object.keys(envelope.request), [
      "operation",
      "definition",
    ])
  })

  test("accepts compare_contracts as an ordered pair", () => {
    const input = {
      kind: "supported",
      request: {
        operation: "compare_contracts",
        contracts: ["One Year", "Two Year"],
      },
    }
    const envelope = expectSupported(input)
    const request = envelope.request

    if (request.operation !== "compare_contracts") {
      assert.fail(`expected compare_contracts, received ${request.operation}`)
    }
    assert.deepStrictEqual(request, input.request)
    assert.strictEqual(request.contracts.length, 2)
    assert.deepStrictEqual(request.contracts, ["One Year", "Two Year"])
    assert.notStrictEqual(request.contracts, input.request.contracts)
  })
})

describe("unsupported envelopes", () => {
  test("accepts unsupported_scope without producing a request", () => {
    const envelope = expectUnsupported({
      kind: "unsupported",
      reason: "unsupported_scope",
    })

    assert.strictEqual(envelope.kind, "unsupported")
    assert.strictEqual(envelope.reason, UNSUPPORTED_REASON)
    assert.deepStrictEqual(Object.keys(envelope), ["kind", "reason"])
    assert.strictEqual(Object.hasOwn(envelope, "request"), false)
    assert.deepStrictEqual(envelope, {
      kind: "unsupported",
      reason: "unsupported_scope",
    })
  })
})

describe("malformed outer values", () => {
  test("rejects null, undefined, primitives, and arrays", () => {
    for (const input of NON_OBJECT_INPUTS) {
      const error = expectError(input, "invalid_envelope")
      assert.ok(error.message.includes("JSON object"))
    }
  })
})

describe("kind validation", () => {
  test("rejects a missing kind", () => {
    const error = expectError({}, "invalid_envelope", "kind")
    assert.ok(error.message.includes("missing"))
  })

  test("rejects non-string kind values without coercion", () => {
    for (const kind of [5, null]) {
      const error = expectError({ kind }, "invalid_envelope", "kind")
      assert.ok(error.message.includes("a string 'kind'"))
    }
  })

  test("rejects unknown kind strings", () => {
    const error = expectError({ kind: "maybe" }, "invalid_envelope")
    assert.ok(error.message.includes("Unknown model output kind"))
    assert.ok(error.message.includes('"maybe"'))
  })
})

describe("missing fields", () => {
  test("rejects a supported envelope with no request", () => {
    const error = expectError(
      { kind: "supported" },
      "invalid_envelope",
      "request"
    )
    assert.ok(error.message.includes("missing"))
  })

  test("rejects an unsupported envelope with no reason", () => {
    const error = expectError(
      { kind: "unsupported" },
      "invalid_envelope",
      "reason"
    )
    assert.ok(error.message.includes("missing"))
  })
})

describe("unexpected properties", () => {
  test("rejects unknown properties on a supported envelope", () => {
    for (const [key, value] of SUPPORTED_EXTRA_FIELDS) {
      const error = expectError(
        {
          kind: "supported",
          request: { operation: "get_kpi", metric: "mrvl" },
          [key]: value,
        },
        "invalid_envelope",
        key
      )
      assert.ok(error.message.includes("unsupported properties"))
    }
  })

  test("rejects unknown properties on an unsupported envelope", () => {
    for (const [key, value] of UNSUPPORTED_EXTRA_FIELDS) {
      const error = expectError(
        { kind: "unsupported", reason: UNSUPPORTED_REASON, [key]: value },
        "invalid_envelope",
        key
      )
      assert.ok(error.message.includes("unsupported properties"))
    }
  })

  test("rejects an unsupported envelope that also carries a request", () => {
    const error = expectError(
      {
        kind: "unsupported",
        reason: UNSUPPORTED_REASON,
        request: { operation: "highest_churn_contract" },
      },
      "invalid_envelope",
      "request"
    )
    assert.ok(error.message.includes("unsupported properties"))
  })
})

describe("nested request failures", () => {
  test("rejects an unsupported KPI metric as invalid_request", () => {
    const error = expectError(
      {
        kind: "supported",
        request: { operation: "get_kpi", metric: "revenue" },
      },
      "invalid_request",
      "unsupported_metric"
    )
    assert.ok(error.message.includes("Nested request is invalid"))
  })

  test("rejects a non-object request", () => {
    for (const request of [null, undefined]) {
      const error = expectError(
        { kind: "supported", request },
        "invalid_request",
        "invalid_request"
      )
      assert.ok(error.message.includes("plain object"))
    }
  })

  test("rejects a request missing a required field", () => {
    const error = expectError(
      { kind: "supported", request: { operation: "get_kpi" } },
      "invalid_request",
      "invalid_request"
    )
    assert.ok(error.message.includes("metric"))
  })

  test("rejects a request carrying an extra field", () => {
    const error = expectError(
      {
        kind: "supported",
        request: { operation: "highest_churn_contract", filter: "x" },
      },
      "invalid_request",
      "invalid_request"
    )
    assert.ok(error.message.includes("filter"))
  })

  test("rejects identical contracts as invalid_request", () => {
    const error = expectError(
      {
        kind: "supported",
        request: {
          operation: "compare_contracts",
          contracts: ["One Year", "One Year"],
        },
      },
      "invalid_request",
      "identical_contracts"
    )
    assert.ok(error.message.includes("distinct"))
  })
})

describe("unsupported reason validation", () => {
  test("rejects a reason string that is not unsupported_scope", () => {
    const error = expectError(
      { kind: "unsupported", reason: "unsupported" },
      "unsupported_reason",
      "unsupported_scope"
    )
    assert.ok(error.message.includes("'reason'"))
  })

  test("rejects an empty reason string as unsupported_reason", () => {
    const error = expectError(
      { kind: "unsupported", reason: "" },
      "unsupported_reason",
      "unsupported_scope"
    )
    assert.ok(error.message.includes("must be"))
  })

  test("rejects a non-string reason without coercion", () => {
    const error = expectError(
      { kind: "unsupported", reason: 5 },
      "invalid_envelope",
      "reason"
    )
    assert.ok(error.message.includes("must be a string"))
  })
})

describe("prototype and interop strictness", () => {
  test("rejects an envelope whose fields are inherited", () => {
    const inherited: unknown = Object.create({
      kind: "unsupported",
      reason: UNSUPPORTED_REASON,
    })
    const error = expectError(inherited, "invalid_envelope")
    assert.ok(error.message.includes("JSON object"))
  })

  test("rejects a class instance exposing envelope fields", () => {
    class EnvelopeLike {
      kind = "unsupported"
      reason = UNSUPPORTED_REASON
    }
    const error = expectError(new EnvelopeLike(), "invalid_envelope")
    assert.ok(error.message.includes("JSON object"))
  })
})

describe("purity and immutability", () => {
  test("does not mutate a deeply frozen supported envelope", () => {
    const request = Object.freeze({
      operation: "get_kpi",
      metric: "churn_rate_pct",
    })
    const input = Object.freeze({ kind: "supported", request })
    const before = JSON.stringify(input)

    const envelope = expectSupported(input)

    assert.ok(Object.isFrozen(input))
    assert.ok(Object.isFrozen(request))
    assert.strictEqual(JSON.stringify(input), before)
    assert.notStrictEqual(envelope.request, request)
    assert.deepStrictEqual(envelope.request, {
      operation: "get_kpi",
      metric: "churn_rate_pct",
    })
    assert.deepStrictEqual(envelope, {
      kind: "supported",
      request: { operation: "get_kpi", metric: "churn_rate_pct" },
    })
  })

  test("does not mutate a deeply frozen unsupported envelope", () => {
    const input = Object.freeze({
      kind: "unsupported",
      reason: UNSUPPORTED_REASON,
    })
    const before = JSON.stringify(input)

    const envelope = expectUnsupported(input)

    assert.ok(Object.isFrozen(input))
    assert.strictEqual(JSON.stringify(input), before)
    assert.strictEqual(Object.hasOwn(envelope, "request"), false)
    assert.deepStrictEqual(envelope, {
      kind: "unsupported",
      reason: "unsupported_scope",
    })
  })
})

describe("result invariants", () => {
  test("every failure uses a documented code, a message, and no envelope", () => {
    for (const input of INVALID_INPUTS) {
      const result = parseModelEnvelope(input)
      if (result.ok) {
        assert.fail(`expected rejection for ${describeInput(input)}`)
      }
      const error = result.error
      assert.ok(
        DOCUMENTED_CODES.includes(error.code),
        `unexpected error code for ${describeInput(input)}: ${error.code}`
      )
      assert.strictEqual(typeof error.message, "string")
      assert.ok(error.message.trim().length > 0)
      assert.strictEqual(Object.hasOwn(result, "envelope"), false)
      assert.strictEqual(Object.hasOwn(result, "error"), true)
    }
  })

  test("every acceptance omits an error property", () => {
    for (const input of VALID_INPUTS) {
      const result = parseModelEnvelope(input)
      if (!result.ok) {
        assert.fail(
          `expected acceptance for ${describeInput(input)}, received ${result.error.code}`
        )
      }
      assert.strictEqual(Object.hasOwn(result, "error"), false)
      assert.strictEqual(Object.hasOwn(result, "envelope"), true)
      assert.strictEqual(Object.hasOwn(result.envelope, "error"), false)
    }
  })
})
