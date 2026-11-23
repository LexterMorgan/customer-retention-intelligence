/**
 * Contract tests for the strict evidence request parser.
 *
 * `parseEvidenceRequest` is the trust boundary for untrusted caller input:
 * exact key allowlists, no coercion, no defaults, and no passthrough. These
 * tests pin every supported operation, every rejection code, and the
 * immutability of accepted input.
 *
 * Missing, non-string, and inherited operations are rejected as
 * `invalid_request`; only a present but unknown operation string reaches
 * `unsupported_operation`.
 */
import { strict as assert } from "node:assert"
import { describe, test } from "node:test"

import { parseEvidenceRequest } from "./requests.ts"
import type { EvidenceError, EvidenceRequest } from "./types.ts"

function describeInput(input: unknown): string {
  if (input === undefined) {
    return "undefined"
  }
  return JSON.stringify(input)
}

function expectOk(input: unknown): EvidenceRequest {
  const result = parseEvidenceRequest(input)
  if (!result.ok) {
    assert.fail(
      `expected acceptance for ${describeInput(input)}, received ${result.error.code}: ${result.error.message}`
    )
  }
  assert.strictEqual(Object.hasOwn(result, "error"), false)
  return result.request
}

function expectError(
  input: unknown,
  code: EvidenceError["code"],
  mentions?: string
): EvidenceError {
  const result = parseEvidenceRequest(input)
  if (result.ok) {
    assert.fail(
      `expected ${code} for ${describeInput(input)}, received request ${describeInput(result.request)}`
    )
  }
  const error = result.error
  assert.strictEqual(error.kind, "request")
  assert.strictEqual(error.code, code)
  assert.strictEqual(typeof error.message, "string")
  assert.ok(error.message.trim().length > 0, "error message must not be empty")
  if (mentions !== undefined) {
    const details =
      error.details === undefined ? "" : describeInput(error.details)
    const surfaced = `${error.message} ${details}`
    assert.ok(
      surfaced.includes(mentions),
      `expected rejection of ${describeInput(input)} to name '${mentions}', got: ${surfaced}`
    )
  }
  return error
}

const NON_OBJECT_INPUTS: readonly unknown[] = [
  null,
  undefined,
  "get_kpi",
  42,
  [],
  true,
]

const EXTRA_PROPERTIES: readonly (readonly [string, unknown])[] = [
  ["filter", "contract:One Year"],
  ["path", "kpis.total_customers"],
  ["section", "kpis"],
  ["customerId", "C-1042"],
  ["filter", { contract: "One Year" }],
]

describe("accepted operations", () => {
  test("normalizes get_kpi", () => {
    const request = expectOk({
      operation: "get_kpi",
      metric: "churn_rate_pct",
    })

    assert.deepStrictEqual(request, {
      operation: "get_kpi",
      metric: "churn_rate_pct",
    })
    assert.deepStrictEqual(Object.keys(request), ["operation", "metric"])
  })

  test("normalizes get_contract_metrics", () => {
    const request = expectOk({
      operation: "get_contract_metrics",
      contract: "One Year",
    })

    assert.deepStrictEqual(request, {
      operation: "get_contract_metrics",
      contract: "One Year",
    })
    assert.deepStrictEqual(Object.keys(request), ["operation", "contract"])
  })

  test("normalizes compare_contracts into an ordered two-element tuple", () => {
    const input = {
      operation: "compare_contracts",
      contracts: ["Two Year", "Month-to-Month"],
    }
    const request = expectOk(input)

    assert.deepStrictEqual(request, {
      operation: "compare_contracts",
      contracts: ["Two Year", "Month-to-Month"],
    })
    if (request.operation !== "compare_contracts") {
      assert.fail(`expected compare_contracts, received ${request.operation}`)
    }
    assert.ok(Array.isArray(request.contracts))
    assert.strictEqual(request.contracts.length, 2)
    assert.notStrictEqual(request.contracts, input.contracts)
    assert.deepStrictEqual(request.contracts, ["Two Year", "Month-to-Month"])
  })

  test("normalizes highest_churn_contract to only the operation key", () => {
    const request = expectOk({ operation: "highest_churn_contract" })

    assert.deepStrictEqual(request, { operation: "highest_churn_contract" })
    assert.deepStrictEqual(Object.keys(request), ["operation"])
    assert.strictEqual(Object.hasOwn(request, "metric"), false)
    assert.strictEqual(Object.hasOwn(request, "contract"), false)
  })

  test("normalizes get_definition", () => {
    const request = expectOk({
      operation: "get_definition",
      definition: "retention_rate",
    })

    assert.deepStrictEqual(request, {
      operation: "get_definition",
      definition: "retention_rate",
    })
    assert.deepStrictEqual(Object.keys(request), ["operation", "definition"])
  })
})

describe("non-object input", () => {
  test("rejects null, undefined, primitives, and arrays", () => {
    for (const input of NON_OBJECT_INPUTS) {
      const error = expectError(input, "invalid_request")
      assert.ok(error.message.includes("plain object"))
    }
  })
})

describe("non-plain object input", () => {
  test("rejects a request that inherits operation instead of owning it", () => {
    const inherited = Object.create({
      operation: "highest_churn_contract",
    }) as unknown
    const error = expectError(inherited, "invalid_request")
    assert.ok(error.message.includes("plain object"))
  })

  test("rejects class instances that expose an operation field", () => {
    class RequestLike {
      operation = "highest_churn_contract"
    }
    const error = expectError(new RequestLike(), "invalid_request")
    assert.ok(error.message.includes("plain object"))
  })
})

describe("operation validation", () => {
  test("rejects a request with no operation field", () => {
    expectError({}, "invalid_request", "operation")
  })

  test("rejects non-string operation values without coercion", () => {
    for (const operation of [5, null]) {
      expectError({ operation }, "invalid_request", "operation")
    }
  })

  test("rejects unknown operation strings with unsupported_operation", () => {
    for (const operation of ["get_revenue", "constructor", "toString", ""]) {
      const error = expectError({ operation }, "unsupported_operation")
      assert.ok(error.message.includes("Unsupported operation"))
    }
  })
})

describe("unexpected properties", () => {
  test("rejects extra properties on get_kpi, including nested filters", () => {
    for (const [key, value] of EXTRA_PROPERTIES) {
      expectError(
        { operation: "get_kpi", metric: "total_customers", [key]: value },
        "invalid_request",
        key
      )
    }
  })

  test("rejects extra properties on get_contract_metrics", () => {
    for (const [key, value] of EXTRA_PROPERTIES) {
      expectError(
        {
          operation: "get_contract_metrics",
          contract: "One Year",
          [key]: value,
        },
        "invalid_request",
        key
      )
    }
  })

  test("rejects extra properties on compare_contracts", () => {
    for (const [key, value] of EXTRA_PROPERTIES) {
      expectError(
        {
          operation: "compare_contracts",
          contracts: ["Month-to-Month", "Two Year"],
          [key]: value,
        },
        "invalid_request",
        key
      )
    }
  })

  test("rejects extra properties on highest_churn_contract", () => {
    for (const [key, value] of EXTRA_PROPERTIES) {
      expectError(
        { operation: "highest_churn_contract", [key]: value },
        "invalid_request",
        key
      )
    }
  })

  test("rejects extra properties on get_definition", () => {
    for (const [key, value] of EXTRA_PROPERTIES) {
      expectError(
        {
          operation: "get_definition",
          definition: "mrvl",
          [key]: value,
        },
        "invalid_request",
        key
      )
    }
  })
})

describe("unsupported values", () => {
  test("rejects unknown KPI metrics with unsupported_metric", () => {
    for (const metric of ["revenue", "CHURN_RATE_PCT"]) {
      const error = expectError(
        { operation: "get_kpi", metric },
        "unsupported_metric"
      )
      assert.ok(error.message.includes("Unsupported KPI metric"))
    }
  })

  test("rejects unknown contracts with unsupported_contract", () => {
    for (const contract of ["month-to-month", "Quarterly"]) {
      const error = expectError(
        { operation: "get_contract_metrics", contract },
        "unsupported_contract"
      )
      assert.strictEqual(error.details?.["field"], "contract")
    }
  })

  test("rejects unknown definitions with unsupported_definition", () => {
    const error = expectError(
      { operation: "get_definition", definition: "churn" },
      "unsupported_definition"
    )
    assert.ok(error.message.includes("Unsupported definition"))
  })
})

describe("wrong value types", () => {
  test("rejects non-string metric values", () => {
    for (const metric of [5, null]) {
      const error = expectError(
        { operation: "get_kpi", metric },
        "invalid_request"
      )
      assert.ok(error.message.includes("'metric' must be a string"))
    }
  })

  test("rejects non-string contract values", () => {
    const error = expectError(
      { operation: "get_contract_metrics", contract: 42 },
      "invalid_request"
    )
    assert.ok(error.message.includes("'contract' must be a string"))
  })

  test("rejects non-string definition values", () => {
    const error = expectError(
      { operation: "get_definition", definition: true },
      "invalid_request"
    )
    assert.ok(error.message.includes("'definition' must be a string"))
  })

  test("rejects non-array contracts values", () => {
    const values: readonly unknown[] = [
      "One Year",
      { 0: "One Year", 1: "Two Year" },
    ]
    for (const contracts of values) {
      const error = expectError(
        { operation: "compare_contracts", contracts },
        "invalid_request"
      )
      assert.ok(error.message.includes("'contracts' must be an array"))
    }
  })
})

describe("compare_contracts arity and identity", () => {
  test("rejects contract lists that are not exactly two entries", () => {
    const cases: readonly (readonly string[])[] = [
      ["One Year"],
      ["One Year", "Two Year", "Month-to-Month"],
    ]
    for (const contracts of cases) {
      const error = expectError(
        { operation: "compare_contracts", contracts },
        "invalid_request"
      )
      assert.strictEqual(error.details?.["receivedLength"], contracts.length)
    }
  })

  test("rejects an unsupported contract in either position", () => {
    const cases: readonly (readonly [number, readonly string[]])[] = [
      [0, ["Bogus", "One Year"]],
      [1, ["One Year", "Bogus"]],
    ]
    for (const [index, contracts] of cases) {
      const error = expectError(
        { operation: "compare_contracts", contracts },
        "unsupported_contract"
      )
      assert.strictEqual(error.details?.["field"], `contracts[${index}]`)
    }
  })

  test("rejects two identical contracts with identical_contracts", () => {
    const error = expectError(
      { operation: "compare_contracts", contracts: ["One Year", "One Year"] },
      "identical_contracts"
    )
    assert.ok(error.message.includes("distinct"))
  })
})

describe("undefined values on allowed keys", () => {
  test("rejects an allowed key whose value is undefined", () => {
    const kpi = { operation: "get_kpi", metric: undefined }
    assert.strictEqual(Object.hasOwn(kpi, "metric"), true)
    expectError(kpi, "invalid_request", "metric")

    const definition = { operation: "get_definition", definition: undefined }
    assert.strictEqual(Object.hasOwn(definition, "definition"), true)
    expectError(definition, "invalid_request", "definition")

    const compare = { operation: "compare_contracts", contracts: undefined }
    assert.strictEqual(Object.hasOwn(compare, "contracts"), true)
    expectError(compare, "invalid_request", "contracts")
  })
})

describe("input immutability", () => {
  test("does not mutate a deeply frozen get_kpi request", () => {
    const input = Object.freeze({
      operation: "get_kpi",
      metric: "retention_rate_pct",
    })

    const request = expectOk(input)

    assert.ok(Object.isFrozen(input))
    assert.notStrictEqual(request, input)
    assert.deepStrictEqual(request, {
      operation: "get_kpi",
      metric: "retention_rate_pct",
    })
    assert.strictEqual(input.metric, "retention_rate_pct")
  })

  test("does not mutate a deeply frozen compare_contracts request", () => {
    const contracts = Object.freeze(["Month-to-Month", "One Year"] as const)
    const input = Object.freeze({ operation: "compare_contracts", contracts })

    const request = expectOk(input)

    assert.ok(Object.isFrozen(input))
    assert.ok(Object.isFrozen(contracts))
    assert.notStrictEqual(request, input)
    if (request.operation !== "compare_contracts") {
      assert.fail(`expected compare_contracts, received ${request.operation}`)
    }
    assert.notStrictEqual(request.contracts, contracts)
    assert.deepStrictEqual(request.contracts, ["Month-to-Month", "One Year"])
    assert.deepStrictEqual(input.contracts, ["Month-to-Month", "One Year"])
  })
})

describe("result invariants", () => {
  test("every rejection is a request error with a non-empty message", () => {
    const invalidInputs: readonly unknown[] = [
      null,
      undefined,
      "get_kpi",
      42,
      [],
      true,
      {},
      { operation: "get_revenue" },
      { operation: "get_kpi", metric: "revenue" },
      { operation: "get_kpi", metric: 5 },
      { operation: "get_contract_metrics", contract: "Quarterly" },
      { operation: "get_definition", definition: "churn" },
      { operation: "compare_contracts", contracts: ["One Year"] },
      { operation: "compare_contracts", contracts: ["One Year", "One Year"] },
      { operation: "highest_churn_contract", filter: "x" },
    ]

    for (const input of invalidInputs) {
      const result = parseEvidenceRequest(input)
      if (result.ok) {
        assert.fail(`expected rejection for ${describeInput(input)}`)
      }
      assert.strictEqual(result.error.kind, "request")
      assert.strictEqual(typeof result.error.message, "string")
      assert.ok(result.error.message.trim().length > 0)
    }
  })

  test("accepted results never include an error property", () => {
    const validInputs: readonly unknown[] = [
      { operation: "get_kpi", metric: "mrvl" },
      { operation: "get_contract_metrics", contract: "Month-to-Month" },
      { operation: "compare_contracts", contracts: ["One Year", "Two Year"] },
      { operation: "highest_churn_contract" },
      { operation: "get_definition", definition: "mrvl" },
    ]

    for (const input of validInputs) {
      const result = parseEvidenceRequest(input)
      if (!result.ok) {
        assert.fail(`expected acceptance for ${describeInput(input)}`)
      }
      assert.strictEqual(Object.hasOwn(result, "error"), false)
      assert.strictEqual(Object.hasOwn(result, "request"), true)
    }
  })
})
