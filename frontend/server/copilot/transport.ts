/**
 * Shared 9router Chat Completions transport.
 *
 * One call sends the fixed system prompt plus one untrusted question to the
 * configured local 9router route and returns a sanitized result. Nothing here
 * logs, retries, streams, or reads configuration at import time.
 *
 * Failure mapping is intentionally coarse and safe: no upstream body, header,
 * request URL beyond the fixed configured endpoint, or credential is ever
 * attached to a result.
 */
import { SYSTEM_PROMPT } from "./prompt.ts"
import {
  CONFIGURED_ROUTE,
  NINE_ROUTER_ENDPOINT,
  type ModelCallResult,
  type ModelFailureCategory,
  type ModelTransport,
} from "./types.ts"

const DEFAULT_TIMEOUT_MS = 90_000
const DEFAULT_MAX_RESPONSE_BYTES = 262_144
const MAX_OUTPUT_TOKENS = 4096

export type NineRouterTransportDeps = {
  readonly credential: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
  readonly maxResponseBytes?: number
}

type BodyReadFailureCategory =
  "timeout" | "body_read_failed" | "response_too_large"

type BodyReadResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly category: BodyReadFailureCategory }

type ErrorChainFlags = {
  readonly redirect: boolean
  readonly timeout: boolean
}

function failure(
  category: ModelFailureCategory,
  status: number | null
): ModelCallResult {
  return { ok: false, status, category, usage: null, gatewayModel: null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Walk a fetch error and its `cause` chain for redirect and timeout/abort
 * signals. Only names, codes, and messages are inspected; nothing is logged.
 */
function inspectErrorChain(error: unknown): ErrorChainFlags {
  let redirect = false
  let timeout = false
  let current: unknown = error
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current === "string") {
      redirect = redirect || /redirect/i.test(current)
      break
    }
    if (!isRecord(current)) {
      break
    }
    const name = current["name"]
    const message = current["message"]
    const code = current["code"]
    if (typeof name === "string") {
      timeout = timeout || name === "TimeoutError" || name === "AbortError"
      redirect = redirect || /redirect/i.test(name)
    }
    if (typeof message === "string" && /redirect/i.test(message)) {
      redirect = true
    }
    if (typeof code === "string" && /redirect/i.test(code)) {
      redirect = true
    }
    current = current["cause"]
  }
  return { redirect, timeout }
}

function classifyFetchError(
  error: unknown,
  signal: AbortSignal
): ModelFailureCategory {
  const flags = inspectErrorChain(error)
  if (flags.redirect) {
    return "redirect_rejected"
  }
  if (flags.timeout || signal.aborted) {
    return "timeout"
  }
  return "connectivity"
}

/**
 * Race an operation against the request deadline so the timeout covers header
 * waiting and body reads even when an injected fetch implementation ignores the
 * signal.
 */
async function raceWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    onAbort = () => {
      reject(signal.reason)
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
  try {
    return await Promise.race([operation, aborted])
  } finally {
    if (onAbort !== undefined) {
      signal.removeEventListener("abort", onAbort)
    }
  }
}

/**
 * Request cleanup without awaiting it. Cleanup must never delay the structured
 * failure and must never become an unhandled rejection.
 */
function cancelResponseBodyBestEffort(response: Response): void {
  const body = response.body
  if (body === null) {
    return
  }
  try {
    void body.cancel().catch(() => undefined)
  } catch {
    // Best effort only; the original failure is returned regardless.
  }
}

function cancelReaderBestEffort(
  reader: ReadableStreamDefaultReader<Uint8Array>
): void {
  try {
    void reader.cancel().catch(() => undefined)
  } catch {
    // Best effort only; the original failure is returned regardless.
  }
}

async function readCappedBody(
  response: Response,
  maxResponseBytes: number,
  signal: AbortSignal
): Promise<BodyReadResult> {
  const body = response.body
  if (body === null) {
    return { ok: false, category: "body_read_failed" }
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const step = await raceWithAbort(reader.read(), signal)
      if (step.done) {
        break
      }
      const value = step.value
      if (value === undefined) {
        continue
      }
      total += value.byteLength
      if (total > maxResponseBytes) {
        cancelReaderBestEffort(reader)
        return { ok: false, category: "response_too_large" }
      }
      chunks.push(value)
    }
  } catch (error) {
    cancelReaderBestEffort(reader)
    const flags = inspectErrorChain(error)
    return {
      ok: false,
      category:
        flags.timeout || signal.aborted ? "timeout" : "body_read_failed",
    }
  }
  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(combined) }
}

function readUsage(value: unknown): Readonly<Record<string, number>> | null {
  if (!isRecord(value)) {
    return null
  }
  const usage: Record<string, number> = {}
  for (const key of [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
  ] as const) {
    const field = value[key]
    if (
      typeof field === "number" &&
      Number.isInteger(field) &&
      field >= 0 &&
      field <= Number.MAX_SAFE_INTEGER
    ) {
      usage[key] = field
    }
  }
  return Object.keys(usage).length > 0 ? usage : null
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300
}

/**
 * Build a one-call transport bound to a server-side credential. Creating the
 * transport performs no network or filesystem work; only invoking it does.
 */
export function createNineRouterTransport(
  deps: NineRouterTransportDeps
): ModelTransport {
  const fetchImpl = deps.fetchImpl ?? fetch
  const timeoutMs =
    typeof deps.timeoutMs === "number" &&
    Number.isInteger(deps.timeoutMs) &&
    deps.timeoutMs > 0 &&
    deps.timeoutMs <= 2_147_483_647
      ? deps.timeoutMs
      : DEFAULT_TIMEOUT_MS
  const maxResponseBytes =
    typeof deps.maxResponseBytes === "number" &&
    Number.isInteger(deps.maxResponseBytes) &&
    deps.maxResponseBytes > 0
      ? deps.maxResponseBytes
      : DEFAULT_MAX_RESPONSE_BYTES
  const authorization = `Bearer ${deps.credential}`

  async function callNineRouter(question: string): Promise<ModelCallResult> {
    const requestBody = {
      model: CONFIGURED_ROUTE,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
      stream: false,
      response_format: { type: "json_object" },
      max_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: "low", exclude: true },
    }

    const signal = AbortSignal.timeout(timeoutMs)
    let response: Response
    try {
      response = await raceWithAbort(
        fetchImpl(NINE_ROUTER_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: authorization,
            "content-type": "application/json",
          },
          body: JSON.stringify(requestBody),
          redirect: "error",
          signal,
        }),
        signal
      )
    } catch (error) {
      return failure(classifyFetchError(error, signal), null)
    }

    const status = response.status
    if (status >= 300 && status < 400) {
      cancelResponseBodyBestEffort(response)
      return failure("redirect_rejected", status)
    }
    if (status === 429) {
      cancelResponseBodyBestEffort(response)
      return failure("rate_limit", status)
    }
    if (!isSuccessStatus(status)) {
      cancelResponseBodyBestEffort(response)
      return failure("http_error", status)
    }

    const read = await readCappedBody(response, maxResponseBytes, signal)
    if (!read.ok) {
      return failure(read.category, status)
    }

    let payload: unknown
    try {
      payload = JSON.parse(read.text)
    } catch {
      return failure("invalid_provider_response", status)
    }
    if (!isRecord(payload)) {
      return failure("invalid_provider_response", status)
    }

    const choices = payload["choices"]
    if (!Array.isArray(choices) || choices.length === 0) {
      return failure("invalid_provider_response", status)
    }
    const first = choices[0]
    if (!isRecord(first)) {
      return failure("invalid_provider_response", status)
    }
    const message = first["message"]
    if (!isRecord(message)) {
      return failure("invalid_provider_response", status)
    }
    if (first["finish_reason"] === "length") {
      return failure("truncated_completion", status)
    }
    const content = message["content"]
    if (typeof content !== "string" || content.trim() === "") {
      return failure("empty_content", status)
    }

    const reportedModel = payload["model"]
    return {
      ok: true,
      status,
      content,
      usage: readUsage(payload["usage"]),
      gatewayModel: typeof reportedModel === "string" ? reportedModel : null,
    }
  }

  return callNineRouter
}
