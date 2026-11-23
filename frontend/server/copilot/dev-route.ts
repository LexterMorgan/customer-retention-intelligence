/**
 * Development-only HTTP route for the retention copilot.
 *
 * This module is HTTP glue only: it owns path interception, loopback-only
 * access checks, a bounded streaming body read, question validation, and a
 * single-in-flight guard. The model call itself lives in the copilot service
 * and is injected as `deps.ask`, so tests exercise every branch offline
 * without Vite, a gateway, a credential, or an evidence artifact.
 *
 * The route is never mounted by production code. `dev-route-plugin.ts` wires
 * it from Vite's `configureServer` hook only, so it cannot exist in a build or
 * a preview server.
 */
import type { IncomingMessage, ServerResponse } from "node:http"
import type { ViteDevServer } from "vite"

import { validateQuestionInput } from "./question.ts"

/** Exact path this route owns. Every other path is left to the caller. */
export const COPILOT_DEV_ROUTE_PATH = "/api/copilot"

/**
 * Hard cap for the request body. The body is read incrementally and the read
 * stops as soon as this many bytes have been received, so a caller cannot make
 * the dev server buffer an unbounded payload.
 */
export const MAX_COPILOT_BODY_BYTES = 8 * 1024

export type CopilotDevRouteDeps = {
  /** Single-flight model call: exactly one invocation per accepted request. */
  readonly ask: (input: unknown) => Promise<unknown>
  /** Actual bound dev-server port, or null while the server is not listening. */
  readonly getBoundPort: () => number | null
}

/** Transport-level failure codes; distinct from the service's CopilotErrorCode. */
type CopilotHttpErrorCode =
  | "method_not_allowed"
  | "forbidden"
  | "unsupported_media_type"
  | "invalid_json"
  | "empty_body"
  | "payload_too_large"
  | "busy"
  | "internal"

type CopilotHttpError = {
  readonly kind: "error"
  readonly code: CopilotHttpErrorCode
  readonly message: string
}

const METHOD_NOT_ALLOWED: CopilotHttpError = {
  kind: "error",
  code: "method_not_allowed",
  message: "Only POST is supported.",
}

const FORBIDDEN: CopilotHttpError = {
  kind: "error",
  code: "forbidden",
  message: "The copilot route only accepts loopback requests.",
}

const UNSUPPORTED_MEDIA_TYPE: CopilotHttpError = {
  kind: "error",
  code: "unsupported_media_type",
  message: "The request body must be application/json.",
}

const INVALID_JSON: CopilotHttpError = {
  kind: "error",
  code: "invalid_json",
  message: "The request body was not valid JSON.",
}

const EMPTY_BODY: CopilotHttpError = {
  kind: "error",
  code: "empty_body",
  message: "The request body must not be empty.",
}

const PAYLOAD_TOO_LARGE: CopilotHttpError = {
  kind: "error",
  code: "payload_too_large",
  message: `The request body must be at most ${MAX_COPILOT_BODY_BYTES} bytes.`,
}

const BUSY: CopilotHttpError = {
  kind: "error",
  code: "busy",
  message: "A copilot request is already in progress.",
}

const INTERNAL: CopilotHttpError = {
  kind: "error",
  code: "internal",
  message: "The copilot request failed.",
}

/** No-op listener: keeps late socket errors from becoming uncaught events. */
function noop(): void {}

/**
 * Pathname for routing. Query and hash are ignored; a target that cannot be
 * parsed is never treated as the copilot route.
 */
function pathnameOf(requestUrl: string | undefined): string | null {
  if (typeof requestUrl !== "string" || requestUrl.length === 0) {
    return null
  }
  try {
    return new URL(requestUrl, "http://localhost").pathname
  } catch {
    let end = requestUrl.length
    for (const marker of ["?", "#"]) {
      const index = requestUrl.indexOf(marker)
      if (index !== -1 && index < end) {
        end = index
      }
    }
    return requestUrl.slice(0, end)
  }
}

function isLoopbackHost(host: string | undefined, port: number): boolean {
  return host === `localhost:${port}` || host === `127.0.0.1:${port}`
}

function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  // Browsers omit Origin for same-origin GETs; a present Origin must be one of
  // the two loopback origins on the actual bound port. Wildcards are never used.
  if (origin === undefined) {
    return true
  }
  return (
    origin === `http://localhost:${port}` ||
    origin === `http://127.0.0.1:${port}`
  )
}

function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) {
    return false
  }
  const separator = value.indexOf(";")
  const mediaType = (separator === -1 ? value : value.slice(0, separator))
    .trim()
    .toLowerCase()
  return mediaType === "application/json"
}

type BodyReadOutcome =
  | { readonly kind: "body"; readonly text: string }
  | { readonly kind: "too_large" }
  | { readonly kind: "aborted" }

/**
 * Read the request body while enforcing `MAX_COPILOT_BODY_BYTES` during the
 * stream. On overflow the request is paused immediately, the listeners are
 * removed, and nothing further is buffered.
 */
function readBody(req: IncomingMessage): Promise<BodyReadOutcome> {
  return new Promise<BodyReadOutcome>((resolve) => {
    const chunks: Buffer[] = []
    let received = 0
    let settled = false

    const cleanup = (): void => {
      req.off("data", onData)
      req.off("end", onEnd)
      req.off("error", onAborted)
      req.off("close", onClose)
    }

    const settle = (outcome: BodyReadOutcome): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(outcome)
    }

    function onData(chunk: Buffer): void {
      received += chunk.length
      if (received > MAX_COPILOT_BODY_BYTES) {
        req.pause()
        settle({ kind: "too_large" })
        return
      }
      chunks.push(chunk)
    }

    function onEnd(): void {
      settle({ kind: "body", text: Buffer.concat(chunks).toString("utf8") })
    }

    function onAborted(): void {
      settle({ kind: "aborted" })
    }

    function onClose(): void {
      if (req.complete !== true) {
        settle({ kind: "aborted" })
      }
    }

    req.on("data", onData)
    req.on("end", onEnd)
    req.on("error", onAborted)
    req.on("close", onClose)
  })
}

/** True only while a response can still be written to a live client. */
function canWrite(res: ServerResponse): boolean {
  if (res.headersSent || res.writableEnded || res.destroyed || !res.writable) {
    return false
  }
  const socket = res.socket
  return socket === null || !socket.destroyed
}

function serializeJson(value: unknown): string | null {
  try {
    const text: unknown = JSON.stringify(value)
    return typeof text === "string" ? text : null
  } catch {
    return null
  }
}

type SendOptions = {
  readonly headers?: Readonly<Record<string, string>>
  readonly onFinish?: () => void
}

/**
 * Write one JSON response. Every response, including failures, is uncached and
 * labeled JSON. A disconnected client is a no-op instead of an exception.
 */
function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  options?: SendOptions
): boolean {
  if (!canWrite(res)) {
    return false
  }

  let responseStatus = status
  let payload = serializeJson(body)
  if (payload === null) {
    responseStatus = 500
    payload = serializeJson(INTERNAL)
    if (payload === null) {
      return false
    }
  }

  try {
    res.statusCode = responseStatus
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    if (options?.headers !== undefined) {
      for (const [name, value] of Object.entries(options.headers)) {
        res.setHeader(name, value)
      }
    }
    if (options?.onFinish !== undefined) {
      res.once("finish", options.onFinish)
    }
    res.end(payload)
    return true
  } catch {
    return false
  }
}

/**
 * 413 helper: the client is still sending the oversized body, so stop reading,
 * answer, then tear the connection down once the response has flushed.
 */
function rejectOversizedBody(req: IncomingMessage, res: ServerResponse): void {
  const sent = sendJson(res, 413, PAYLOAD_TOO_LARGE, {
    headers: { Connection: "close" },
    onFinish: () => {
      if (!req.destroyed) {
        req.destroy()
      }
    },
  })
  if (!sent && !req.destroyed) {
    req.destroy()
  }
}

/** Sanitized status mapping for service error results. */
function statusForCopilotError(code: string): number {
  if (code === "missing_credential") {
    return 503
  }
  if (code === "invalid_model_output" || code === "invalid_request") {
    return 502
  }
  if (code.startsWith("model_")) {
    return 502
  }
  // evidence_* and any unexpected code: never a 4xx that implies caller fault.
  return 500
}

/** Map one service result to exactly one response. */
function respondWithResult(res: ServerResponse, result: unknown): void {
  if (typeof result !== "object" || result === null) {
    sendJson(res, 500, INTERNAL)
    return
  }

  const candidate = result as {
    readonly kind?: unknown
    readonly code?: unknown
  }
  if (candidate.kind === "answered" || candidate.kind === "unsupported") {
    sendJson(res, 200, result)
    return
  }
  if (candidate.kind === "error" && typeof candidate.code === "string") {
    sendJson(res, statusForCopilotError(candidate.code), result)
    return
  }
  sendJson(res, 500, INTERNAL)
}

/**
 * Build the HTTP handler. It never throws and never rejects: async work is
 * wrapped, and every failure path responds with a fixed sanitized body.
 */
export function createCopilotDevHandler(
  deps: CopilotDevRouteDeps
): (req: IncomingMessage, res: ServerResponse) => void {
  let active = false

  async function handle(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    if (pathnameOf(req.url) !== COPILOT_DEV_ROUTE_PATH) {
      // Not ours: write nothing and leave the connection to the caller.
      return
    }

    // From here on this handler owns the response. Attach no-op error
    // listeners so a client that disappears mid-flight cannot raise an
    // uncaught 'error' event on the request or response stream.
    req.on("error", noop)
    res.on("error", noop)

    if (req.method !== "POST") {
      sendJson(res, 405, METHOD_NOT_ALLOWED, { headers: { Allow: "POST" } })
      return
    }

    const port = deps.getBoundPort()
    if (
      port === null ||
      !isLoopbackHost(req.headers.host, port) ||
      !isAllowedOrigin(req.headers.origin, port)
    ) {
      sendJson(res, 403, FORBIDDEN)
      return
    }

    if (!isJsonContentType(req.headers["content-type"])) {
      sendJson(res, 415, UNSUPPORTED_MEDIA_TYPE)
      return
    }

    const body = await readBody(req)
    if (body.kind === "aborted") {
      // Client went away while sending; there is nobody to answer.
      return
    }
    if (body.kind === "too_large") {
      rejectOversizedBody(req, res)
      return
    }
    if (body.text.length === 0) {
      sendJson(res, 400, EMPTY_BODY)
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(body.text)
    } catch {
      sendJson(res, 400, INVALID_JSON)
      return
    }

    const validated = validateQuestionInput(parsed)
    if (!validated.ok) {
      // Validator errors are already sanitized: code, field-level message only.
      sendJson(res, 400, validated.error)
      return
    }

    if (active) {
      // Single-flight: refuse without touching the service or its transport.
      sendJson(res, 429, BUSY)
      return
    }

    active = true
    try {
      const result = await deps.ask({ question: validated.question })
      respondWithResult(res, result)
    } catch {
      // Never expose a thrown message or stack; the service's own failures are
      // returned as sanitized error results, not exceptions.
      sendJson(res, 500, INTERNAL)
    } finally {
      active = false
    }
  }

  return (req: IncomingMessage, res: ServerResponse): void => {
    void handle(req, res).catch(noop)
  }
}

/**
 * Install the handler on a Vite dev server.
 *
 * Connect only advances when a middleware calls `next()`, so non-target paths
 * are delegated here; the handler itself is also safe to call directly (as the
 * tests do) and writes nothing for paths it does not own.
 */
export function attachCopilotDevRoute(
  server: ViteDevServer,
  deps: CopilotDevRouteDeps
): void {
  const handler = createCopilotDevHandler(deps)
  server.middlewares.use((req, res, next) => {
    if (pathnameOf(req.url) !== COPILOT_DEV_ROUTE_PATH) {
      next()
      return
    }
    handler(req, res)
  })
}
