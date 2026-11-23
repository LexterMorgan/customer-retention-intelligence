/**
 * Offline tests for the development-only copilot HTTP route.
 *
 * Every test starts an ephemeral loopback `node:http` server around the real
 * handler and injects a fake `ask`, so no Vite server, gateway, credential,
 * evidence artifact, or writes to the repository are involved. The only I/O is
 * a loopback socket.
 */
import assert from "node:assert/strict"
import { createServer, request } from "node:http"
import { connect, type AddressInfo } from "node:net"
import { test, type TestContext } from "node:test"

import {
  COPILOT_DEV_ROUTE_PATH,
  MAX_COPILOT_BODY_BYTES,
  createCopilotDevHandler,
} from "./dev-route.ts"

const LOOPBACK_HOST = "127.0.0.1"

const ANSWERED = {
  kind: "answered",
  question: "What is churn?",
  answerText: "Churn is the share of customers who cancel.",
} as const

type AskFn = (input: unknown) => Promise<unknown>

type Harness = {
  readonly port: number
  readonly calls: readonly unknown[]
  setAsk: (next: AskFn) => void
}

type HttpOutcome = {
  readonly status: number
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  readonly text: string
}

type SendInit = {
  readonly method?: string
  readonly path?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
}

async function listenOnEphemeralPort(
  server: ReturnType<typeof createServer>
): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, LOOPBACK_HOST, () => {
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    assert.fail("expected a bound TCP address")
  }
  return (address as AddressInfo).port
}

async function startHarness(
  t: TestContext,
  initialAsk: AskFn
): Promise<Harness> {
  const calls: unknown[] = []
  let ask: AskFn = initialAsk
  let port = 0

  const handler = createCopilotDevHandler({
    ask: (input) => {
      calls.push(input)
      return ask(input)
    },
    getBoundPort: () => port,
  })

  const server = createServer((req, res) => {
    handler(req, res)
    const url = req.url ?? ""
    const queryIndex = url.indexOf("?")
    const path = queryIndex === -1 ? url : url.slice(0, queryIndex)
    if (path !== COPILOT_DEV_ROUTE_PATH) {
      // Stand-in for Vite: a path this route does not own falls through.
      res.statusCode = 404
      res.end("not found")
    }
  })

  port = await listenOnEphemeralPort(server)
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    })
  })

  return {
    port,
    calls,
    setAsk: (next: AskFn) => {
      ask = next
    },
  }
}

async function send(port: number, init: SendInit = {}): Promise<HttpOutcome> {
  return await new Promise<HttpOutcome>((resolve, reject) => {
    const client = request(
      {
        host: LOOPBACK_HOST,
        port,
        method: init.method ?? "POST",
        path: init.path ?? COPILOT_DEV_ROUTE_PATH,
        agent: false,
        headers: {
          "content-type": "application/json",
          ...init.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk)
        })
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          })
        })
        response.on("error", reject)
      }
    )
    client.on("error", reject)
    if (init.body !== undefined) {
      client.write(init.body)
    }
    client.end()
  })
}

/**
 * Minimal HTTP/1.0 request over a raw socket. Node's HTTP/1.1 client always
 * sends a Host header, so this is how the missing-Host branch is exercised.
 */
async function sendHttp10(port: number, body: string): Promise<HttpOutcome> {
  const requestText = [
    "POST /api/copilot HTTP/1.0",
    "Content-Type: application/json",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "",
    body,
  ].join("\r\n")

  const raw = await new Promise<string>((resolve, reject) => {
    const socket = connect(port, LOOPBACK_HOST, () => {
      socket.write(requestText)
    })
    let data = ""
    socket.setEncoding("utf8")
    socket.on("data", (chunk: string) => {
      data += chunk
    })
    socket.on("end", () => {
      resolve(data)
    })
    socket.on("error", reject)
    socket.setTimeout(2_000, () => {
      socket.destroy()
      resolve(data)
    })
  })

  const separator = raw.indexOf("\r\n\r\n")
  assert.notEqual(separator, -1, "expected a complete HTTP response")
  const head = raw.slice(0, separator)
  const text = raw.slice(separator + 4)
  const lines = head.split("\r\n")
  const statusLine = lines[0] ?? ""
  const match = /^HTTP\/\d\.\d (\d{3})/.exec(statusLine)
  assert.notEqual(match, null, `expected a status line, got ${statusLine}`)

  const headers: Record<string, string> = {}
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":")
    if (colon === -1) {
      continue
    }
    headers[line.slice(0, colon).trim().toLowerCase()] = line
      .slice(colon + 1)
      .trim()
  }
  return { status: Number(match?.[1]), headers, text }
}

/** Parse a response body strictly; any trailing junk or non-JSON fails. */
function jsonBody(res: HttpOutcome): Record<string, unknown> {
  assert.notEqual(res.text, "", "expected a JSON response body")
  let parsed: unknown
  try {
    parsed = JSON.parse(res.text)
  } catch {
    assert.fail(`response body was not valid JSON: ${res.text.slice(0, 120)}`)
  }
  assert.equal(typeof parsed, "object")
  assert.notEqual(parsed, null)
  assert.equal(Array.isArray(parsed), false)
  return parsed as Record<string, unknown>
}

function expectJsonError(
  res: HttpOutcome,
  code: string
): Record<string, unknown> {
  assert.equal(res.headers["cache-control"], "no-store")
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8")
  assert.equal(res.headers["access-control-allow-origin"], undefined)

  const body = jsonBody(res)
  assert.deepEqual(Object.keys(body).sort(), ["code", "kind", "message"])
  assert.equal(body["kind"], "error")
  assert.equal(body["code"], code)
  assert.equal(typeof body["message"], "string")
  assert.ok(String(body["message"]).length > 0)
  return body
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  const state: { resolve: ((value: T) => void) | null } = { resolve: null }
  const promise = new Promise<T>((resolve) => {
    state.resolve = resolve
  })
  return {
    promise,
    resolve: (value: T): void => {
      state.resolve?.(value)
    },
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!predicate()) {
    if (Date.now() > deadline) {
      assert.fail(`timed out waiting for ${label}`)
    }
    await delay(5)
  }
}

test("valid POST asks exactly once and returns the result JSON", async (t) => {
  const h = await startHarness(t, async () => ANSWERED)

  const res = await send(h.port, {
    body: JSON.stringify({ question: "  What is churn?  " }),
  })

  assert.equal(res.status, 200)
  assert.equal(res.headers["cache-control"], "no-store")
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8")
  assert.deepEqual(jsonBody(res), ANSWERED)
  assert.equal(h.calls.length, 1)
  assert.deepEqual(h.calls[0], { question: "What is churn?" })
})

test("route matching ignores the query string", async (t) => {
  const h = await startHarness(t, async () => ANSWERED)

  const res = await send(h.port, {
    path: `${COPILOT_DEV_ROUTE_PATH}?trace=1`,
    body: JSON.stringify({ question: "What is churn?" }),
  })

  assert.equal(res.status, 200)
  assert.equal(h.calls.length, 1)
})

test("unsupported results are returned unchanged with 200", async (t) => {
  const unsupported = {
    kind: "unsupported",
    question: "Which customer churned most?",
    reason: "unsupported_scope",
    message: "Outside the supported evidence scope.",
  }
  const h = await startHarness(t, async () => unsupported)

  const res = await send(h.port, {
    body: JSON.stringify({ question: "Which customer churned most?" }),
  })

  assert.equal(res.status, 200)
  assert.deepEqual(jsonBody(res), unsupported)
  assert.equal(h.calls.length, 1)
})

test("non-POST methods get 405 with Allow: POST and never reach the service", async (t) => {
  const h = await startHarness(t, async () => ANSWERED)

  const res = await send(h.port, { method: "GET" })

  assert.equal(res.status, 405)
  assert.equal(res.headers.allow, "POST")
  expectJsonError(res, "method_not_allowed")
  assert.equal(h.calls.length, 0)
})

test("other paths are not handled and never reach the service", async (t) => {
  const h = await startHarness(t, async () => ANSWERED)

  for (const path of [
    "/",
    "/api/copilotx",
    "/api/copilot/extra",
    "/api/Copilot",
  ]) {
    const res = await send(h.port, { path })
    assert.equal(res.status, 404, `expected the caller to handle ${path}`)
    assert.equal(res.text, "not found")
  }
  assert.equal(h.calls.length, 0)
})

test("non-loopback Host headers are rejected", async (t) => {
  const h = await startHarness(t, async () => ANSWERED)
  const body = JSON.stringify({ question: "What is churn?" })

  const wrongHost = await send(h.port, {
    headers: { host: "evil.example" },
    body,
  })
  assert.equal(wrongHost.status, 403)
  expectJsonError(wrongHost, "forbidden")

  const wrongPort = await send(h.port, {
    headers: { host: `localhost:${h.port + 1}` },
    body,
  })
  assert.equal(wrongPort.status, 403)

  // Node's HTTP/1.1 parser itself rejects a missing Host with 400, so the
  // handler's missing-Host branch is exercised with a raw HTTP/1.0 request.
  const missingHost = await sendHttp10(h.port, body)
  assert.equal(missingHost.status, 403)
  expectJsonError(missingHost, "forbidden")

  assert.equal(h.calls.length, 0)
})

test("Origin checks accept only the two loopback origins", async (t) => {
  const h = await startHarness(t, async () => ANSWERED)
  const body = JSON.stringify({ question: "What is churn?" })

  const crossOrigin = await send(h.port, {
    headers: { origin: "http://evil.example" },
    body,
  })
  assert.equal(crossOrigin.status, 403)
  expectJsonError(crossOrigin, "forbidden")

  const nullOrigin = await send(h.port, { headers: { origin: "null" }, body })
  assert.equal(nullOrigin.status, 403)

  assert.equal(h.calls.length, 0)

  for (const origin of [
    `http://localhost:${h.port}`,
    `http://127.0.0.1:${h.port}`,
  ]) {
    const res = await send(h.port, { headers: { origin }, body })
    assert.equal(res.status, 200, `expected ${origin} to be accepted`)
    // Never answer with wildcard CORS headers.
    assert.equal(res.headers["access-control-allow-origin"], undefined)
  }
  assert.equal(h.calls.length, 2)
})

test("content type must be application/json", async (t) => {
  const h = await startHarness(t, async () => ANSWERED)
  const body = JSON.stringify({ question: "What is churn?" })

  const textPlain = await send(h.port, {
    headers: { "content-type": "text/plain" },
    body,
  })
  assert.equal(textPlain.status, 415)
  expectJsonError(textPlain, "unsupported_media_type")

  const missing = await send(h.port, {
    headers: { "content-type": "" },
    body,
  })
  assert.equal(missing.status, 415)

  assert.equal(h.calls.length, 0)

  const withCharset = await send(h.port, {
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  })
  assert.equal(withCharset.status, 200)
  assert.equal(h.calls.length, 1)
})

test("empty and malformed bodies are rejected without reaching the service", async (t) => {
  const h = await startHarness(t, async () => ANSWERED)

  const empty = await send(h.port)
  assert.equal(empty.status, 400)
  expectJsonError(empty, "empty_body")

  const secret = "sk-live-must-not-be-echoed"
  const malformed = await send(h.port, { body: `{"question":"${secret}"` })
  assert.equal(malformed.status, 400)
  expectJsonError(malformed, "invalid_json")
  assert.equal(malformed.text.includes(secret), false)

  assert.equal(h.calls.length, 0)
})

test("invalid questions are rejected with the validator error and no service call", async (t) => {
  const h = await startHarness(t, async () => ANSWERED)

  const cases: readonly unknown[] = [
    { question: "   " },
    { question: "x".repeat(401) },
    { question: "What is churn?", filter: { contract: "One Year" } },
    {},
    { question: 5 },
    [],
    null,
  ]

  for (const value of cases) {
    const res = await send(h.port, { body: JSON.stringify(value) })
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(value)}`)
    expectJsonError(res, "invalid_question")
  }
  assert.equal(h.calls.length, 0)
})

test("oversized bodies are rejected while streaming without reaching the service", async (t) => {
  const oversized = JSON.stringify({
    question: "x".repeat(MAX_COPILOT_BODY_BYTES),
  })
  assert.ok(Buffer.byteLength(oversized) > MAX_COPILOT_BODY_BYTES)

  const h = await startHarness(t, async () => ANSWERED)

  const res = await send(h.port, { body: oversized })
  assert.equal(res.status, 413)
  expectJsonError(res, "payload_too_large")
  assert.equal(h.calls.length, 0)

  // The oversized connection is closed, but the route still serves the next request.
  const next = await send(h.port, {
    body: JSON.stringify({ question: "What is churn?" }),
  })
  assert.equal(next.status, 200)
  assert.equal(h.calls.length, 1)
})

test("a second in-flight request is rejected with 429 busy", async (t) => {
  const gate = createDeferred<unknown>()
  const h = await startHarness(t, () => gate.promise)

  const first = send(h.port, {
    body: JSON.stringify({ question: "first" }),
  })
  await waitFor(() => h.calls.length === 1, "first ask call")

  const second = await send(h.port, {
    body: JSON.stringify({ question: "second" }),
  })
  assert.equal(second.status, 429)
  const busy = expectJsonError(second, "busy")
  assert.deepEqual(Object.keys(busy).sort(), ["code", "kind", "message"])
  assert.equal(h.calls.length, 1)

  gate.resolve(ANSWERED)
  const firstRes = await first
  assert.equal(firstRes.status, 200)

  h.setAsk(async () => ANSWERED)
  const third = await send(h.port, {
    body: JSON.stringify({ question: "third" }),
  })
  assert.equal(third.status, 200)
  assert.equal(h.calls.length, 2)
})

test("the single-flight guard is released after a service error result", async (t) => {
  const failure = {
    kind: "error",
    code: "model_timeout",
    message: "The model route timed out.",
  }
  const h = await startHarness(t, async () => failure)

  const first = await send(h.port, {
    body: JSON.stringify({ question: "first" }),
  })
  assert.equal(first.status, 502)
  assert.deepEqual(expectJsonError(first, "model_timeout"), failure)

  // Released: a second request reaches the service instead of getting 429.
  const second = await send(h.port, {
    body: JSON.stringify({ question: "second" }),
  })
  assert.equal(second.status, 502)
  assert.equal(h.calls.length, 2)
})

test("requests are rejected while the bound port is unknown", async (t) => {
  const handler = createCopilotDevHandler({
    ask: async () => ANSWERED,
    getBoundPort: () => null,
  })
  const server = createServer((req, res) => {
    handler(req, res)
  })
  const port = await listenOnEphemeralPort(server)
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    })
  })

  const res = await send(port, {
    body: JSON.stringify({ question: "What is churn?" }),
  })
  assert.equal(res.status, 403)
  expectJsonError(res, "forbidden")
})

test("non-conforming service results map to a sanitized 500", async (t) => {
  const results: readonly unknown[] = [
    null,
    undefined,
    "answered",
    { kind: "weird" },
    { kind: "error" },
  ]
  let index = 0
  const h = await startHarness(t, async () => results[index++])

  for (let attempt = 0; attempt < results.length; attempt += 1) {
    const res = await send(h.port, {
      body: JSON.stringify({ question: "What is churn?" }),
    })
    assert.equal(res.status, 500)
    assert.deepEqual(expectJsonError(res, "internal"), {
      kind: "error",
      code: "internal",
      message: "The copilot request failed.",
    })
  }
  assert.equal(h.calls.length, results.length)
})

test("service error codes map to sanitized statuses", async (t) => {
  const h = await startHarness(t, async () => {
    assert.fail("initial ask should not be used")
  })

  const statusByCode: readonly (readonly [string, number])[] = [
    ["missing_credential", 503],
    ["model_connectivity", 502],
    ["model_timeout", 502],
    ["model_redirect", 502],
    ["model_rate_limit", 502],
    ["model_http_error", 502],
    ["model_response", 502],
    ["model_truncated", 502],
    ["model_empty", 502],
    ["model_response_too_large", 502],
    ["invalid_model_output", 502],
    ["invalid_request", 502],
    ["evidence_unavailable", 500],
    ["evidence_invalid", 500],
    ["unexpected_code", 500],
  ]

  for (const [code, status] of statusByCode) {
    h.setAsk(async () => ({
      kind: "error",
      code,
      message: "sanitized message",
    }))
    const res = await send(h.port, {
      body: JSON.stringify({ question: "What is churn?" }),
    })
    assert.equal(res.status, status, `expected ${status} for ${code}`)
    const body = expectJsonError(res, code)
    assert.deepEqual(body, {
      kind: "error",
      code,
      message: "sanitized message",
    })
  }
  assert.equal(h.calls.length, statusByCode.length)
})

test("thrown failures are sanitized to 500 and release the guard", async (t) => {
  const secret = "SECRET upstream body sk-live-123"
  const h = await startHarness(t, async () => {
    throw new Error(`${secret} at Object.<anonymous>`)
  })

  const res = await send(h.port, {
    body: JSON.stringify({ question: "What is churn?" }),
  })
  assert.equal(res.status, 500)
  assert.deepEqual(expectJsonError(res, "internal"), {
    kind: "error",
    code: "internal",
    message: "The copilot request failed.",
  })
  for (const marker of [
    "SECRET",
    "sk-live",
    "upstream body",
    "Object.<anonymous>",
    "Error:",
  ]) {
    assert.equal(
      res.text.includes(marker),
      false,
      `response leaked ${JSON.stringify(marker)}`
    )
  }

  // Released: the next request is accepted instead of getting 429.
  h.setAsk(async () => ANSWERED)
  const next = await send(h.port, {
    body: JSON.stringify({ question: "What is churn?" }),
  })
  assert.equal(next.status, 200)
  assert.equal(h.calls.length, 2)
})

test("client disconnect mid-request releases the guard without unhandled rejections", async (t) => {
  const rejections: unknown[] = []
  const onRejection = (reason: unknown): void => {
    rejections.push(reason)
  }
  process.on("unhandledRejection", onRejection)
  t.after(() => {
    process.removeListener("unhandledRejection", onRejection)
  })

  const gate = createDeferred<unknown>()
  const h = await startHarness(t, () => gate.promise)

  let responded = false
  const client = request(
    {
      host: LOOPBACK_HOST,
      port: h.port,
      method: "POST",
      path: COPILOT_DEV_ROUTE_PATH,
      agent: false,
      headers: { "content-type": "application/json" },
    },
    () => {
      responded = true
    }
  )
  client.on("error", () => {
    // The connection is torn down on purpose; the response never arrives.
  })
  client.end(JSON.stringify({ question: "disconnect" }))
  await waitFor(() => h.calls.length === 1, "ask call before disconnect")

  client.destroy()
  await delay(25)

  gate.resolve(ANSWERED)
  await delay(25)

  assert.equal(responded, false)
  assert.deepEqual(rejections, [])

  h.setAsk(async () => ANSWERED)
  const next = await send(h.port, {
    body: JSON.stringify({ question: "next" }),
  })
  assert.equal(next.status, 200)
  assert.equal(h.calls.length, 2)
})

test("error responses never expose credentials, upstream content, or stacks", async (t) => {
  const h = await startHarness(t, async () => {
    throw new Error("upstream body: token sk-live-secret")
  })

  const responses: HttpOutcome[] = []
  responses.push(await send(h.port, { headers: { host: "evil.example" } }))
  responses.push(await send(h.port, { method: "GET" }))
  responses.push(
    await send(h.port, { headers: { "content-type": "text/plain" } })
  )
  responses.push(await send(h.port, { body: "" }))
  responses.push(await send(h.port, { body: "{not json" }))
  responses.push(
    await send(h.port, {
      body: JSON.stringify({ question: "x".repeat(MAX_COPILOT_BODY_BYTES) }),
    })
  )
  responses.push(
    await send(h.port, { body: JSON.stringify({ question: "What is churn?" }) })
  )

  const forbiddenMarkers = [
    "sk-live",
    "upstream body",
    "token",
    "authorization",
    "Authorization",
    "Error:",
    "Object.<anonymous>",
  ]

  for (const res of responses) {
    const body = jsonBody(res)
    assert.equal(body["kind"], "error")
    assert.equal(res.headers["cache-control"], "no-store")
    assert.equal(res.headers["access-control-allow-origin"], undefined)
    for (const marker of forbiddenMarkers) {
      assert.equal(
        res.text.includes(marker),
        false,
        `status ${res.status} leaked ${JSON.stringify(marker)}`
      )
    }
  }

  // Exactly one accepted request reached the service.
  assert.equal(h.calls.length, 1)
  assert.equal(responses.at(-1)?.status, 500)
})
