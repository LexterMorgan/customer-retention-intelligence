/// <reference types="node" />
/**
 * Offline tests for the browser copilot client.
 *
 * `fetch` is replaced with a recording stub; the real `Response` class supplies
 * bodies so the JSON, non-JSON, and non-2xx paths are exercised without a
 * server. Node's mock timers drive the 120 s client deadline.
 */
import assert from "node:assert/strict"
import { test, type TestContext } from "node:test"

import {
  askCopilot,
  COPILOT_CLIENT_TIMEOUT_MS,
  COPILOT_ENDPOINT,
} from "./ask-copilot.ts"

const ARTIFACT_SHA = "a".repeat(64)

type FetchCall = {
  readonly url: string
  readonly init: RequestInit
}

type FetchHandler = (init: RequestInit) => Response | Promise<Response>

function installFetch(t: TestContext, handler: FetchHandler): FetchCall[] {
  const calls: FetchCall[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const requestInit = init ?? {}
    calls.push({ url, init: requestInit })
    return handler(requestInit)
  }) as typeof fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  return calls
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function answeredBody(question: string): unknown {
  return {
    kind: "answered",
    question,
    answerText:
      "Churn Rate for the Q2 2022 full snapshot: 28.37%. Population/denominator: Churned + Stayed",
    request: { operation: "get_kpi", metric: "churn_rate_pct" },
    evidence: {
      snapshot: "Q2 2022",
      scope: {
        kind: "full_snapshot",
        description: "Full Q2 2022 snapshot across all customers.",
      },
      artifact: {
        source: "data/processed/dashboard_payload.json",
        sha256: ARTIFACT_SHA,
      },
      request: { operation: "get_kpi", metric: "churn_rate_pct" },
      facts: [
        {
          id: "fact-churn-rate",
          citation: {
            id: "cite-kpis-churn-rate",
            artifactSha256: ARTIFACT_SHA,
          },
          metric: { id: "churn_rate_pct", label: "Churn Rate" },
          value: 28.37,
          unit: { kind: "percentage" },
          scope: { kind: "overall" },
          population: {
            id: "existing_customers",
            definition: "Churned + Stayed",
          },
          locator: { section: "kpis", field: "churn_rate_pct" },
        },
      ],
      definitions: [],
      caveats: ["Rates describe the Q2 2022 snapshot only."],
    },
    model: {
      provider: "9router",
      configuredRoute: "free-models",
      status: 200,
      gatewayReportedModel: "test-model",
      usage: { total_tokens: 42 },
    },
    elapsedMs: 1234,
  }
}

function unsupportedBody(question: string): unknown {
  return {
    kind: "unsupported",
    question,
    reason: "unsupported_scope",
    message:
      "Supported evidence is limited to overall KPIs, contract metrics, comparisons, and canonical definitions.",
    model: {
      provider: "9router",
      configuredRoute: "free-models",
      status: 200,
      gatewayReportedModel: "test-model",
      usage: { total_tokens: 12 },
    },
    elapsedMs: 900,
  }
}

function errorBody(code: string, message: string): unknown {
  return { kind: "error", code, message }
}

test("posts exactly one JSON question and returns a validated answered result", async (t) => {
  const calls = installFetch(t, () =>
    jsonResponse(answeredBody("What is the overall churn rate?"))
  )

  const question = "What is the overall churn rate?"
  const result = await askCopilot({ question })

  assert.equal(result.kind, "answered")
  if (result.kind === "answered") {
    assert.equal(
      result.answerText,
      "Churn Rate for the Q2 2022 full snapshot: 28.37%. Population/denominator: Churned + Stayed"
    )
    assert.equal(result.evidence.facts[0]?.value, 28.37)
    assert.equal(result.evidence.facts[0]?.citation.id, "cite-kpis-churn-rate")
  }

  assert.equal(calls.length, 1)
  const call = calls[0]
  if (call === undefined) {
    assert.fail("expected one fetch call")
  }
  assert.equal(call.url, COPILOT_ENDPOINT)
  assert.equal(call.url, "/api/copilot")
  assert.equal(call.init.method, "POST")
  assert.equal(call.init.credentials, "same-origin")
  assert.deepEqual(call.init.headers, { "content-type": "application/json" })
  assert.equal(typeof call.init.body, "string")
  assert.deepEqual(JSON.parse(call.init.body as string), { question })
})

test("returns a validated unsupported result", async (t) => {
  installFetch(t, () =>
    jsonResponse(unsupportedBody("How many customers churned last week?"))
  )

  const result = await askCopilot({
    question: "How many customers churned last week?",
  })

  assert.equal(result.kind, "unsupported")
  if (result.kind === "unsupported") {
    assert.equal(result.reason, "unsupported_scope")
    assert.match(result.message, /limited to overall KPIs/)
  }
})

test("returns a validated error result from a 200 response", async (t) => {
  installFetch(t, () =>
    jsonResponse(
      errorBody("model_timeout", "The model did not respond in time.")
    )
  )

  const result = await askCopilot({ question: "What is churn?" })

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "model_timeout")
    assert.equal(result.message, "The model did not respond in time.")
  }
})

test("treats a non-JSON success body as invalid_response", async (t) => {
  installFetch(
    t,
    () =>
      new Response("<html><body>gateway error</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
  )

  const result = await askCopilot({ question: "q" })

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "invalid_response")
    assert.equal(result.message.includes("<"), false)
  }
})

test("treats a malformed success shape as invalid_response", async (t) => {
  installFetch(t, () => jsonResponse({ kind: "answered", question: "q" }))

  const result = await askCopilot({ question: "q" })

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "invalid_response")
  }
})

test("rejects a nested malformed evidence shape without throwing", async (t) => {
  const malformed = answeredBody("q") as {
    evidence: Record<string, unknown>
  }
  delete malformed.evidence["definitions"]
  installFetch(t, () => jsonResponse(malformed))

  const result = await askCopilot({ question: "q" })

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "invalid_response")
  }
})

test("returns the structured error from a non-2xx JSON body", async (t) => {
  installFetch(t, () =>
    jsonResponse(
      errorBody("model_timeout", "The model did not respond in time."),
      504
    )
  )

  const result = await askCopilot({ question: "q" })

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "model_timeout")
    assert.equal(result.message, "The model did not respond in time.")
  }
})

test("reads a { error } non-2xx body", async (t) => {
  installFetch(t, () =>
    jsonResponse(
      { error: { code: "busy", message: "Another answer is in flight." } },
      429
    )
  )

  const result = await askCopilot({ question: "q" })

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "busy")
    assert.equal(result.message, "Another answer is in flight.")
  }
})

test("never surfaces a non-2xx HTML body", async (t) => {
  installFetch(
    t,
    () =>
      new Response("<html><body>502 Bad Gateway</body></html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      })
  )

  const result = await askCopilot({ question: "q" })

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "http_error")
    assert.equal(result.message.includes("<"), false)
    assert.match(result.message, /HTTP 502/)
  }
})

test("returns network_error when fetch rejects", async (t) => {
  installFetch(t, () => Promise.reject(new TypeError("fetch failed")))

  const result = await askCopilot({ question: "q" })

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "network_error")
  }
})

test("returns timeout when the client deadline expires without retrying", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const calls = installFetch(
    t,
    (init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new Error("aborted by client deadline"))
        })
      })
  )

  const pending = askCopilot({ question: "q" })
  assert.equal(calls.length, 1)
  t.mock.timers.tick(COPILOT_CLIENT_TIMEOUT_MS)
  const result = await pending

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "timeout")
  }
  assert.equal(calls.length, 1)
  t.mock.timers.reset()
})

test("returns aborted when the caller signal is aborted during the request", async (t) => {
  const controller = new AbortController()
  installFetch(t, (init) => {
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        reject(new Error("caller aborted"))
      })
      queueMicrotask(() => {
        controller.abort()
      })
    })
  })

  const result = await askCopilot({
    question: "q",
    signal: controller.signal,
  })

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "aborted")
  }
})

test("does not fetch when the caller signal is already aborted", async (t) => {
  const calls = installFetch(t, () => jsonResponse(answeredBody("q")))
  const controller = new AbortController()
  controller.abort()

  const result = await askCopilot({
    question: "q",
    signal: controller.signal,
  })

  assert.equal(result.kind, "error")
  if (result.kind === "error") {
    assert.equal(result.code, "aborted")
  }
  assert.equal(calls.length, 0)
})
