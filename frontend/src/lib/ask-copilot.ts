/**
 * Browser client for the local retention copilot endpoint.
 *
 * One POST per call with no retries and no credential handling: authentication
 * stays entirely in the local server. The client deadline is 120 s so it
 * outlives the server's 90 s model timeout and lets the server answer first.
 * Every failure is returned as a sanitized `CopilotResult` error; raw response
 * text, HTML, and transport details are never surfaced.
 */
import { parseCopilotResult, type CopilotResult } from "./copilot-contract.ts"
import { sanitizeCopilotMessage } from "./copilot-view.ts"

export const COPILOT_ENDPOINT = "/api/copilot"

/** Client deadline in milliseconds; deliberately longer than the server's 90 s. */
export const COPILOT_CLIENT_TIMEOUT_MS = 120_000

const MAX_ERROR_CODE_LENGTH = 80

export type AskCopilotInput = {
  readonly question: string
  readonly signal?: AbortSignal
}

type RequestFailure = "network" | "timeout" | "aborted"

type MergedAbortSignal = {
  readonly signal: AbortSignal
  readonly dispose: () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorResult(code: string, message: string): CopilotResult {
  const normalizedCode = code.trim().slice(0, MAX_ERROR_CODE_LENGTH) || "error"
  return {
    kind: "error",
    code: normalizedCode,
    message: sanitizeCopilotMessage(message),
  }
}

function failureResult(failure: RequestFailure): CopilotResult {
  switch (failure) {
    case "timeout":
      return errorResult(
        "timeout",
        `The retention analyst request timed out after ${COPILOT_CLIENT_TIMEOUT_MS / 1000} seconds.`
      )
    case "aborted":
      return errorResult(
        "aborted",
        "The retention analyst request was cancelled."
      )
    case "network":
      return errorResult(
        "network_error",
        "Could not reach the retention analyst. Check that the local copilot service is running."
      )
  }
}

function invalidResponseResult(): CopilotResult {
  return {
    kind: "error",
    code: "invalid_response",
    message:
      "The retention analyst returned a response the dashboard could not read.",
  }
}

function classifyFailure(
  timedOut: boolean,
  callerSignal: AbortSignal | undefined
): RequestFailure {
  if (timedOut) {
    return "timeout"
  }
  if (callerSignal?.aborted === true) {
    return "aborted"
  }
  return "network"
}

function mergeAbortSignals(
  callerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal
): MergedAbortSignal {
  const controller = new AbortController()
  const removers: (() => void)[] = []
  for (const source of [callerSignal, timeoutSignal]) {
    if (source === undefined) {
      continue
    }
    if (source.aborted) {
      controller.abort(source.reason)
      break
    }
    const onAbort = () => {
      controller.abort(source.reason)
    }
    source.addEventListener("abort", onAbort, { once: true })
    removers.push(() => {
      source.removeEventListener("abort", onAbort)
    })
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const remove of removers) {
        remove()
      }
    },
  }
}

function tryParseResult(payload: unknown): CopilotResult | null {
  try {
    return parseCopilotResult(payload)
  } catch {
    // The parser expects arrays for nested collections; malformed bodies throw
    // instead of returning null. Treat that as an unreadable response.
    return null
  }
}

/**
 * Read a structured error from a non-2xx body. Only JSON objects that either
 * match the contract's error result or expose `{ error: ... }` are accepted;
 * anything else falls back to a status-only sanitized error.
 */
function structuredError(payload: unknown): CopilotResult | null {
  const parsed = tryParseResult(payload)
  if (parsed !== null && parsed.kind === "error") {
    return errorResult(parsed.code, parsed.message)
  }
  if (!isRecord(payload)) {
    return null
  }
  const error = payload["error"]
  if (isRecord(error)) {
    const code = isString(error["code"]) ? error["code"] : "error"
    const message = isString(error["message"]) ? error["message"] : ""
    return errorResult(code, message)
  }
  if (isString(error)) {
    return errorResult("error", error)
  }
  const code = payload["code"]
  const message = payload["message"]
  if (isString(code) && isString(message)) {
    return errorResult(code, message)
  }
  return null
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

async function postQuestion(
  question: string,
  signal: AbortSignal
): Promise<Response> {
  return fetch(COPILOT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
    credentials: "same-origin",
    signal,
  })
}

/**
 * Ask the local retention copilot exactly one question.
 *
 * Resolves with the parsed result union; transport and response failures are
 * returned as sanitized `{ kind: "error" }` results and never thrown.
 */
export async function askCopilot(
  input: AskCopilotInput
): Promise<CopilotResult> {
  if (input.signal?.aborted === true) {
    return failureResult("aborted")
  }

  const timeoutController = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    timeoutController.abort()
  }, COPILOT_CLIENT_TIMEOUT_MS)
  const merged = mergeAbortSignals(input.signal, timeoutController.signal)

  try {
    let response: Response
    try {
      response = await postQuestion(input.question, merged.signal)
    } catch {
      return failureResult(classifyFailure(timedOut, input.signal))
    }

    let text: string
    try {
      text = await response.text()
    } catch {
      return failureResult(classifyFailure(timedOut, input.signal))
    }

    let payload: unknown
    let hasJsonBody = false
    if (text.trim() !== "") {
      try {
        payload = JSON.parse(text) as unknown
        hasJsonBody = true
      } catch {
        hasJsonBody = false
      }
    }

    if (!response.ok) {
      if (hasJsonBody) {
        const structured = structuredError(payload)
        if (structured !== null) {
          return structured
        }
      }
      return errorResult(
        "http_error",
        `The retention analyst request failed (HTTP ${response.status}).`
      )
    }

    if (!hasJsonBody) {
      return invalidResponseResult()
    }

    const result = tryParseResult(payload)
    if (result === null) {
      return invalidResponseResult()
    }
    if (result.kind === "error") {
      return errorResult(result.code, result.message)
    }
    return result
  } finally {
    clearTimeout(timeoutId)
    merged.dispose()
  }
}
