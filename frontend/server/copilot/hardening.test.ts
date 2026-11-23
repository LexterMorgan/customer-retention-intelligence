/**
 * Small regressions for defensive configuration and input hardening in the
 * copilot service/transport. Offline only: fake transports and fake fetch.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import { createCopilotService } from "./service.ts"
import { createNineRouterTransport } from "./transport.ts"
import { validateQuestionInput } from "./question.ts"

const SUCCESS_BODY = JSON.stringify({
  model: "hardening-model",
  choices: [
    {
      message: {
        content: '{"kind":"unsupported","reason":"unsupported_scope"}',
      },
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
})

function jsonResponse(): Response {
  return new Response(SUCCESS_BODY, {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

test("a throwing transport becomes a sanitized model_response error", async () => {
  const service = createCopilotService({
    credential: "test-credential",
    transport: async () => {
      throw new Error("transport exploded with a secret-looking cause")
    },
  })
  const result = await service.ask({
    question: "What is the overall churn rate?",
  })
  assert.equal(result.kind, "error")
  if (result.kind !== "error") {
    return
  }
  assert.equal(result.code, "model_response")
  assert.equal(result.message.includes("secret-looking"), false)
})

test("invalid transport configuration cannot make the transport reject", async () => {
  for (const timeoutMs of [
    -1,
    0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2 ** 40,
  ]) {
    const transport = createNineRouterTransport({
      credential: "test-credential",
      timeoutMs,
      fetchImpl: async () => jsonResponse(),
    })
    const result = await transport("question")
    assert.equal(
      result.ok,
      true,
      `timeoutMs=${String(timeoutMs)} should fall back`
    )
  }
})

test("a NaN response cap falls back to the default instead of disabling it", async () => {
  const transport = createNineRouterTransport({
    credential: "test-credential",
    maxResponseBytes: Number.NaN,
    fetchImpl: async () => jsonResponse(),
  })
  const result = await transport("question")
  assert.equal(result.ok, true)
})

test("symbol-keyed extra properties are rejected by question validation", () => {
  const input: Record<string | symbol, unknown> = { question: "What is churn?" }
  input[Symbol("filter")] = { contract: "One Year" }
  const result = validateQuestionInput(input)
  assert.equal(result.ok, false)
})
