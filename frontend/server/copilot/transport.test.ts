/**
 * Offline contract tests for the shared 9router chat-completions transport.
 *
 * Every case injects a fake `fetch`, so nothing here opens a socket, retries,
 * reads configuration, or touches the real gateway. The transport is exercised
 * exactly as the copilot service uses it: one question in, one sanitized result
 * out, with no upstream body or header echoed back.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { createNineRouterTransport } from "./transport.ts"
import type { NineRouterTransportDeps } from "./transport.ts"
import type { ModelCallResult, ModelFailureCategory } from "./types.ts"

const ENDPOINT = "http://localhost:20128/v1/chat/completions"
const CREDENTIAL = "test-credential"
const QUESTION = "Which contract has the highest churn?"
const CONTENT = JSON.stringify({ ok: 1 })

const SUPPORTED_OPERATIONS = [
  "get_kpi",
  "get_contract_metrics",
  "compare_contracts",
  "highest_churn_contract",
  "get_definition",
] as const

const USAGE_KEYS: readonly string[] = [
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
]

const encoder = new TextEncoder()

type RecordedCall = {
  readonly url: string
  readonly init: RequestInit | undefined
}

type CallOutcome = {
  readonly result: ModelCallResult
  readonly calls: readonly RecordedCall[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function expectRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("expected a JSON object")
  }
  return value
}

function expectArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("expected a JSON array")
  }
  return value
}

function expectText(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("expected a string")
  }
  return value
}

function namedError(name: string, message: string): Error {
  const error = new Error(message)
  error.name = name
  return error
}

/** Fake fetch that records every request and replies through `respond`. */
function fakeFetch(
  respond: (call: RecordedCall) => Response | Promise<Response>
): {
  readonly fetchImpl: typeof fetch
  readonly calls: RecordedCall[]
} {
  const calls: RecordedCall[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url =
      input instanceof URL
        ? input.href
        : typeof input === "string"
          ? input
          : input.url
    const call: RecordedCall = { url, init }
    calls.push(call)
    return respond(call)
  }
  return { fetchImpl, calls }
}

/** Build a transport over a fake fetch and invoke it once with the question. */
async function callWith(
  respond: (call: RecordedCall) => Response | Promise<Response>,
  options: Partial<NineRouterTransportDeps> = {}
): Promise<CallOutcome> {
  const stub = fakeFetch(respond)
  const transport = createNineRouterTransport({
    credential: CREDENTIAL,
    fetchImpl: stub.fetchImpl,
    ...options,
  })
  const result = await transport(QUESTION)
  return { result, calls: stub.calls }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function successPayload(): Record<string, unknown> {
  return {
    model: "test-model",
    choices: [
      {
        message: { content: CONTENT },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
  }
}

function requestBodyOf(init: RequestInit | undefined): Record<string, unknown> {
  const body = init?.body
  if (typeof body !== "string") {
    throw new Error("expected the request body to be a serialized JSON string")
  }
  return expectRecord(JSON.parse(body))
}

function expectSuccess(
  result: ModelCallResult
): Extract<ModelCallResult, { ok: true }> {
  if (!result.ok) {
    assert.fail(`expected a successful result, received ${result.category}`)
  }
  return result
}

function expectFailure(
  result: ModelCallResult,
  category: ModelFailureCategory,
  status: number | null
): void {
  if (result.ok) {
    assert.fail(`expected ${category}, received a successful result`)
  }
  assert.deepEqual(Object.keys(result).sort(), [
    "category",
    "gatewayModel",
    "ok",
    "status",
    "usage",
  ])
  assert.equal(result.category, category)
  assert.equal(result.status, status)
  assert.equal(result.usage, null)
  assert.equal(result.gatewayModel, null)
}

/** Every retained counter must be a non-negative safe integer. */
function assertSafeUsage(usage: Readonly<Record<string, number>> | null): void {
  if (usage === null) {
    return
  }
  for (const key of Object.keys(usage)) {
    assert.ok(USAGE_KEYS.includes(key), `unexpected usage key ${key}`)
    const value = usage[key]
    assert.ok(Number.isInteger(value), `usage ${key} must be an integer`)
    assert.ok(value >= 0, `usage ${key} must not be negative`)
  }
}

/** Resolve only when the signal aborts; used to stall a streamed body. */
function waitForAbort(signal: AbortSignal): Promise<void> {
  return new Promise<void>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    })
  })
}

/** Body stream that never yields and errors when the request is aborted. */
async function* stalledBody(signal: AbortSignal): AsyncGenerator<Uint8Array> {
  await waitForAbort(signal)
  yield new Uint8Array()
}

/** Body stream that fails mid-read on its own, without any abort. */
async function* failedBody(): AsyncGenerator<Uint8Array> {
  yield encoder.encode("{")
  await Promise.resolve()
  throw new Error("upstream body read failed")
}

/** Two 10-byte chunks that together exceed a 16-byte response budget. */
async function* oversizedBody(): AsyncGenerator<Uint8Array> {
  yield encoder.encode("0123456789")
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 1)
  })
  yield encoder.encode("abcdefghij")
}

test("sends one fixed POST and sanitizes a successful completion", async () => {
  const outcome = await callWith(() => jsonResponse(successPayload()))

  const result = expectSuccess(outcome.result)
  assert.equal(result.status, 200)
  assert.equal(result.content, CONTENT)
  assert.equal(result.gatewayModel, "test-model")
  assert.deepEqual(result.usage, {
    prompt_tokens: 1,
    completion_tokens: 2,
    total_tokens: 3,
  })

  assert.equal(outcome.calls.length, 1, "expected exactly one fetch call")
  const call = outcome.calls[0]
  if (call === undefined) {
    assert.fail("expected a recorded request")
  }

  assert.equal(call.url, ENDPOINT)
  assert.equal(call.init?.method, "POST")
  assert.equal(call.init?.redirect, "error")
  assert.ok(call.init?.signal instanceof AbortSignal)

  const headers = new Headers(call.init?.headers)
  assert.equal(headers.get("authorization"), `Bearer ${CREDENTIAL}`)
  assert.equal(headers.get("content-type"), "application/json")

  const body = requestBodyOf(call.init)
  assert.deepEqual(Object.keys(body).sort(), [
    "max_tokens",
    "messages",
    "model",
    "reasoning",
    "response_format",
    "stream",
  ])
  assert.equal(body["model"], "free-models")
  assert.equal(body["stream"], false)
  assert.equal(body["max_tokens"], 4096)
  assert.deepEqual(body["response_format"], { type: "json_object" })
  assert.deepEqual(body["reasoning"], { effort: "low", exclude: true })

  const messages = expectArray(body["messages"])
  assert.equal(messages.length, 2)
  const systemMessage = expectRecord(messages[0])
  const userMessage = expectRecord(messages[1])
  assert.equal(systemMessage["role"], "system")
  assert.equal(userMessage["role"], "user")
  assert.equal(userMessage["content"], QUESTION)
  const systemContent = expectText(systemMessage["content"])
  for (const operation of SUPPORTED_OPERATIONS) {
    assert.ok(
      systemContent.includes(operation),
      `system prompt must name ${operation}`
    )
  }
})

test("maps 429 to rate_limit and never echoes the upstream body", async () => {
  const secret = "slow-down-secret-body"
  const { result, calls } = await callWith(
    () => new Response(`{"error":"${secret}"}`, { status: 429 })
  )

  expectFailure(result, "rate_limit", 429)
  assert.equal(calls.length, 1)
  assert.equal(JSON.stringify(result).includes(secret), false)
})

test("maps 500 and 404 to http_error without leaking bodies", async () => {
  for (const status of [500, 404]) {
    const secret = `leak-marker-${status}`
    const { result } = await callWith(
      () => new Response(`{"error":"${secret}"}`, { status })
    )
    expectFailure(result, "http_error", status)
    assert.equal(JSON.stringify(result).includes(secret), false)
  }
})

test("rejects 3xx responses as redirect_rejected", async () => {
  const { result } = await callWith(() => new Response(null, { status: 302 }))

  expectFailure(result, "redirect_rejected", 302)
})

test("classifies redirect failures in a rejected fetch", async () => {
  const fromMessage = await callWith(async () => {
    throw new TypeError("unexpected redirect response")
  })
  expectFailure(fromMessage.result, "redirect_rejected", null)

  const fromCause = await callWith(async () => {
    throw new TypeError("fetch failed", {
      cause: new Error("redirect mode is error"),
    })
  })
  expectFailure(fromCause.result, "redirect_rejected", null)
})

test("maps a plain network rejection to connectivity", async () => {
  const { result } = await callWith(async () => {
    throw new TypeError("fetch failed")
  })

  expectFailure(result, "connectivity", null)
})

test("maps timeout-style rejections to timeout", async () => {
  const timedOut = await callWith(async () => {
    throw namedError("TimeoutError", "the request timed out")
  })
  expectFailure(timedOut.result, "timeout", null)

  const aborted = await callWith(async () => {
    throw new DOMException("the request was aborted", "AbortError")
  })
  expectFailure(aborted.result, "timeout", null)
})

test("rejects a non-JSON body as invalid_provider_response", async () => {
  const { result } = await callWith(
    () => new Response("<html>not json</html>", { status: 200 })
  )

  expectFailure(result, "invalid_provider_response", 200)
})

test("rejects payloads without usable choices or message", async () => {
  const payloads: readonly unknown[] = [
    null,
    {},
    { model: "test-model" },
    { choices: [] },
    { choices: "not-an-array" },
    { choices: ["not-an-object"] },
    { choices: [{ finish_reason: "stop" }] },
  ]

  for (const payload of payloads) {
    const { result } = await callWith(() => jsonResponse(payload))
    expectFailure(result, "invalid_provider_response", 200)
  }
})

test("maps non-string or blank content to empty_content", async () => {
  const contents: readonly unknown[] = [7, null, "", "   ", "\n\t "]

  for (const content of contents) {
    const payload = successPayload()
    payload["choices"] = [{ message: { content }, finish_reason: "stop" }]
    const { result } = await callWith(() => jsonResponse(payload))
    expectFailure(result, "empty_content", 200)
  }
})

test("rejects a length-truncated completion even with content", async () => {
  const payload = successPayload()
  payload["choices"] = [
    { message: { content: CONTENT }, finish_reason: "length" },
  ]

  const { result } = await callWith(() => jsonResponse(payload))

  expectFailure(result, "truncated_completion", 200)
})

test("stops reading an oversized streamed body", async () => {
  const { result, calls } = await callWith(
    () => new Response(oversizedBody(), { status: 200 }),
    { maxResponseBytes: 16 }
  )

  expectFailure(result, "response_too_large", 200)
  assert.equal(calls.length, 1)
})

/**
 * `AbortSignal.timeout` uses an unref'd timer. Keep the event loop referenced
 * with a finite watchdog while a test awaits the abort, and reject instead of
 * hanging if the operation never settles.
 */
const WATCHDOG_TIMEOUT_MS = 2_000

async function withReferencedWatchdog<T>(
  operation: () => Promise<T>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const watchdog = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("test watchdog expired before the operation settled"))
    }, WATCHDOG_TIMEOUT_MS)
  })
  try {
    return await Promise.race([operation(), watchdog])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

test("times out a stalled body when the abort signal fires", async () => {
  const { result } = await withReferencedWatchdog(() =>
    callWith(
      (call) => {
        const signal = call.init?.signal
        if (signal === undefined || signal === null) {
          throw new Error("expected the transport to pass an abort signal")
        }
        return new Response(stalledBody(signal), { status: 200 })
      },
      { timeoutMs: 40 }
    )
  )

  expectFailure(result, "timeout", 200)
})

test("maps a body stream error without abort to body_read_failed", async () => {
  const failed = await callWith(
    () => new Response(failedBody(), { status: 200 })
  )
  expectFailure(failed.result, "body_read_failed", 200)

  const missing = await callWith(() => new Response(null, { status: 200 }))
  expectFailure(missing.result, "body_read_failed", 200)
})

test("keeps the gateway model optional and filters unsafe usage", async () => {
  const withoutModel = successPayload()
  delete withoutModel["model"]
  const omitted = await callWith(() => jsonResponse(withoutModel))
  const omittedResult = expectSuccess(omitted.result)
  assert.equal(omittedResult.gatewayModel, null)
  assert.deepEqual(omittedResult.usage, {
    prompt_tokens: 1,
    completion_tokens: 2,
    total_tokens: 3,
  })

  const unsafe = successPayload()
  unsafe["usage"] = {
    prompt_tokens: -1,
    completion_tokens: 1.5,
    total_tokens: "3",
  }
  const unsafeResult = expectSuccess(
    (await callWith(() => jsonResponse(unsafe))).result
  )
  assert.equal(unsafeResult.usage, null)

  const partial = successPayload()
  partial["usage"] = { prompt_tokens: 4, completion_tokens: -2 }
  const partialResult = expectSuccess(
    (await callWith(() => jsonResponse(partial))).result
  )
  assertSafeUsage(partialResult.usage)
  if (partialResult.usage !== null) {
    assert.equal(partialResult.usage["completion_tokens"], undefined)
  }
})

test("never retries a failed call", async () => {
  let attempts = 0
  const { result, calls } = await callWith(() => {
    attempts += 1
    return jsonResponse({ error: "unavailable" }, 503)
  })

  expectFailure(result, "http_error", 503)
  assert.equal(attempts, 1)
  assert.equal(calls.length, 1)
})

test("imports the module without performing any fetch", async () => {
  const originalFetch = globalThis.fetch
  let importTimeCalls = 0
  globalThis.fetch = () => {
    importTimeCalls += 1
    throw new Error("fetch must not run while the module initializes")
  }

  try {
    // A distinct query string gives a fresh module instance, so the throwing
    // stub would be observed if importing performed any network work.
    const specifier = "./transport.ts?import-time-probe"
    const freshModule: unknown = await import(specifier)
    assert.ok(isRecord(freshModule), "expected a module namespace object")
    assert.equal(typeof freshModule["createNineRouterTransport"], "function")
    assert.equal(importTimeCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
