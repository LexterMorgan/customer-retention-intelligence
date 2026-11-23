/**
 * Offline regression tests for response-body cleanup in the 9router transport.
 *
 * `transport.ts` cancels failed response bodies without awaiting the cancel.
 * These cases inject fake fetches and deliberately hostile ReadableStreams
 * whose cancel either never settles or rejects, so any awaited cleanup would
 * hang, replace the structured failure, or surface an unhandled rejection.
 * Nothing here opens a socket, reads configuration, or touches a real gateway.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { createNineRouterTransport } from "./transport.ts"
import type { NineRouterTransportDeps } from "./transport.ts"
import type { ModelCallResult, ModelFailureCategory } from "./types.ts"

const CREDENTIAL = "test-credential"
const QUESTION = "Which contract has the highest churn?"
const MAX_RESPONSE_BYTES = 8
const STALL_TIMEOUT_MS = 40
const PROMPT_RETURN_LIMIT_MS = 1_500
const REJECTION_SETTLE_MS = 75
const BODY_MARKER_TEXT = "do-not-read-this-body"

const encoder = new TextEncoder()
/** 64 bytes: eight times the tiny per-response budget used below. */
const OVERSIZED_CHUNK = encoder.encode("0123456789abcdef".repeat(4))
const BODY_MARKER = encoder.encode(BODY_MARKER_TEXT)

type StreamProbe = {
  pulls: number
  cancels: number
  enqueues: number
}

/** A promise used to stall a stream pull or a stream cancel forever. */
function neverSettles(): Promise<never> {
  return new Promise<never>(() => undefined)
}

function newProbe(): StreamProbe {
  return { pulls: 0, cancels: 0, enqueues: 0 }
}

/** Body whose pull never settles and whose cleanup never resolves either. */
function stalledBody(probe: StreamProbe): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull() {
      probe.pulls += 1
      return neverSettles()
    },
    cancel() {
      probe.cancels += 1
      return neverSettles()
    },
  })
}

/** Body that yields one oversized chunk; its cleanup never resolves. */
function oversizedUncancellableBody(
  probe: StreamProbe
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      probe.enqueues += 1
      controller.enqueue(OVERSIZED_CHUNK)
    },
    pull() {
      probe.pulls += 1
      return neverSettles()
    },
    cancel() {
      probe.cancels += 1
      return neverSettles()
    },
  })
}

/** Body that yields one oversized chunk; its cleanup rejects. */
function oversizedRejectingCancelBody(
  probe: StreamProbe
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      probe.enqueues += 1
      controller.enqueue(OVERSIZED_CHUNK)
    },
    pull() {
      probe.pulls += 1
      return neverSettles()
    },
    cancel() {
      probe.cancels += 1
      return Promise.reject(new Error("cancel rejected"))
    },
  })
}

/**
 * Body whose read rejects on its own. An errored stream answers `cancel()`
 * with its stored read error, so cleanup rejects here as well.
 */
function readFailureBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("upstream body read failed"))
    },
  })
}

/**
 * Body that must never be consumed on the early HTTP-error paths: the zero
 * high-water mark means `pull` runs only if the transport asks for data.
 */
function unreadBody(probe: StreamProbe): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        probe.pulls += 1
        probe.enqueues += 1
        controller.enqueue(BODY_MARKER)
      },
      cancel() {
        probe.cancels += 1
      },
    },
    { highWaterMark: 0 }
  )
}

function fetchFor(response: Response): typeof fetch {
  return async () => response
}

async function callTransport(
  response: Response,
  options: Partial<NineRouterTransportDeps> = {}
): Promise<ModelCallResult> {
  const transport = createNineRouterTransport({
    ...options,
    credential: CREDENTIAL,
    fetchImpl: fetchFor(response),
  })
  return transport(QUESTION)
}

async function timedCall(
  response: Response,
  options: Partial<NineRouterTransportDeps> = {}
): Promise<{
  readonly result: ModelCallResult
  readonly elapsedMs: number
}> {
  const startedAt = Date.now()
  const result = await callTransport(response, options)
  return { result, elapsedMs: Date.now() - startedAt }
}

function expectFailure(
  result: ModelCallResult,
  category: ModelFailureCategory,
  status: number
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

/** Give Node time to emit a queued unhandled-rejection event. */
async function settleRejections(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, REJECTION_SETTLE_MS)
  })
}

type RejectionTracker = {
  readonly reasons: readonly unknown[]
  readonly stop: () => void
}

function trackUnhandledRejections(): RejectionTracker {
  const reasons: unknown[] = []
  const listener = (reason: unknown): void => {
    reasons.push(reason)
  }
  process.on("unhandledRejection", listener)
  return {
    reasons,
    stop: () => {
      process.off("unhandledRejection", listener)
    },
  }
}

test(
  "times out a stalled body without waiting for a never-settling cancel",
  { timeout: 2_000 },
  async () => {
    const probe = newProbe()
    const { result, elapsedMs } = await timedCall(
      new Response(stalledBody(probe), { status: 200 }),
      { timeoutMs: STALL_TIMEOUT_MS }
    )

    expectFailure(result, "timeout", 200)
    assert.ok(
      elapsedMs < PROMPT_RETURN_LIMIT_MS,
      `timeout took ${elapsedMs}ms; an awaited cleanup would stall here`
    )
    assert.ok(probe.pulls >= 1, "expected the body read to be attempted")
    assert.equal(probe.cancels, 1, "expected exactly one best-effort cancel")
  }
)

test(
  "returns response_too_large without waiting for a never-settling cancel",
  { timeout: 2_000 },
  async () => {
    const probe = newProbe()
    const { result, elapsedMs } = await timedCall(
      new Response(oversizedUncancellableBody(probe), { status: 200 }),
      { maxResponseBytes: MAX_RESPONSE_BYTES }
    )

    expectFailure(result, "response_too_large", 200)
    assert.ok(
      elapsedMs < PROMPT_RETURN_LIMIT_MS,
      `oversized detection took ${elapsedMs}ms; an awaited cleanup would stall`
    )
    assert.equal(probe.enqueues, 1, "expected one oversized chunk")
    assert.equal(probe.cancels, 1, "expected exactly one best-effort cancel")
  }
)

test(
  "preserves response_too_large when body cancellation rejects",
  { timeout: 2_000 },
  async () => {
    const tracker = trackUnhandledRejections()
    try {
      const probe = newProbe()
      const result = await callTransport(
        new Response(oversizedRejectingCancelBody(probe), { status: 200 }),
        { maxResponseBytes: MAX_RESPONSE_BYTES }
      )

      expectFailure(result, "response_too_large", 200)
      assert.equal(probe.cancels, 1, "expected exactly one cancel attempt")

      await settleRejections()
      assert.deepEqual(tracker.reasons, [])
    } finally {
      tracker.stop()
    }
  }
)

test(
  "preserves body_read_failed when the failing body's cancel rejects",
  { timeout: 2_000 },
  async () => {
    const tracker = trackUnhandledRejections()
    try {
      // Same stream shape used by the transport: prove the cleanup really does
      // reject (an errored stream cancels with its stored read error).
      const probeReader = readFailureBody().getReader()
      await assert.rejects(() => probeReader.read())
      await assert.rejects(() => probeReader.cancel())

      const result = await callTransport(
        new Response(readFailureBody(), { status: 200 })
      )

      expectFailure(result, "body_read_failed", 200)
      await settleRejections()
      assert.deepEqual(tracker.reasons, [])
    } finally {
      tracker.stop()
    }
  }
)

test("requests one best-effort cleanup for early HTTP failures", async () => {
  const scenarios: readonly {
    readonly status: number
    readonly category: ModelFailureCategory
  }[] = [
    { status: 500, category: "http_error" },
    { status: 429, category: "rate_limit" },
    { status: 302, category: "redirect_rejected" },
  ]

  for (const scenario of scenarios) {
    const probe = newProbe()
    const result = await callTransport(
      new Response(unreadBody(probe), { status: scenario.status })
    )

    expectFailure(result, scenario.category, scenario.status)
    assert.equal(
      probe.cancels,
      1,
      `status ${scenario.status} should request one body cancel`
    )
    assert.equal(
      probe.pulls,
      0,
      `status ${scenario.status} must not read the error body`
    )
    assert.equal(
      probe.enqueues,
      0,
      `status ${scenario.status} must not consume the error body`
    )
    assert.ok(
      !JSON.stringify(result).includes(BODY_MARKER_TEXT),
      `status ${scenario.status} leaked body content into the result`
    )
  }
})

test(
  "keeps timeout, response_too_large, and body_read_failed distinct",
  { timeout: 2_000 },
  async () => {
    const timeoutProbe = newProbe()
    const timeout = await callTransport(
      new Response(stalledBody(timeoutProbe), { status: 200 }),
      { timeoutMs: STALL_TIMEOUT_MS }
    )
    expectFailure(timeout, "timeout", 200)

    const oversizedProbe = newProbe()
    const oversized = await callTransport(
      new Response(oversizedUncancellableBody(oversizedProbe), {
        status: 200,
      }),
      { maxResponseBytes: MAX_RESPONSE_BYTES }
    )
    expectFailure(oversized, "response_too_large", 200)

    // The read error arrives with no abort in play; the rejecting cleanup must
    // not reclassify it as connectivity or timeout.
    const failed = await callTransport(
      new Response(readFailureBody(), { status: 200 })
    )
    expectFailure(failed, "body_read_failed", 200)
  }
)

test(
  "resolves after hostile cleanup and emits no unhandled rejection",
  { timeout: 2_000 },
  async () => {
    const tracker = trackUnhandledRejections()
    try {
      const timeoutProbe = newProbe()
      const timeout = await callTransport(
        new Response(stalledBody(timeoutProbe), { status: 200 }),
        { timeoutMs: STALL_TIMEOUT_MS }
      )
      const oversizedProbe = newProbe()
      const oversized = await callTransport(
        new Response(oversizedUncancellableBody(oversizedProbe), {
          status: 200,
        }),
        { maxResponseBytes: MAX_RESPONSE_BYTES }
      )

      expectFailure(timeout, "timeout", 200)
      expectFailure(oversized, "response_too_large", 200)
      assert.equal(timeoutProbe.cancels, 1)
      assert.equal(oversizedProbe.cancels, 1)

      await settleRejections()
      assert.deepEqual(tracker.reasons, [])
    } finally {
      tracker.stop()
    }
  }
)
