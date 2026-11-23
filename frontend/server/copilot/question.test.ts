/**
 * Offline contract tests for copilot question input validation.
 *
 * validateQuestionInput() is pure: every case runs in-process and no transport,
 * evidence artifact, filesystem, or network access is involved. The validator
 * must accept exactly `{ question: string }`, trim it, and reject everything
 * else without coercing values or echoing rejected input.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { validateQuestionInput } from "./question.ts"
import type { CopilotError } from "./types.ts"

const MAX_LENGTH = 400
const VALID_QUESTION = "What is churn?"

function expectValid(input: unknown): string {
  const result = validateQuestionInput(input)
  if (!result.ok) {
    assert.fail(`expected acceptance, received ${JSON.stringify(result.error)}`)
  }
  return result.question
}

function expectInvalid(input: unknown): CopilotError {
  const result = validateQuestionInput(input)
  if (result.ok) {
    assert.fail(`expected rejection for ${JSON.stringify(input)}`)
  }
  assert.equal(result.error.kind, "error")
  assert.equal(result.error.code, "invalid_question")
  assert.ok(result.error.message.length > 0, "expected a non-empty message")
  return result.error
}

test("accepts a single question string", () => {
  assert.deepEqual(validateQuestionInput({ question: VALID_QUESTION }), {
    ok: true,
    question: VALID_QUESTION,
  })
})

test("returns trimmed question text", () => {
  assert.equal(expectValid({ question: "  x  " }), "x")
  assert.equal(expectValid({ question: "\tWhat is churn?\n" }), VALID_QUESTION)
})

test("accepts exactly 400 characters and rejects 401", () => {
  const atLimit = "x".repeat(MAX_LENGTH)
  assert.equal(expectValid({ question: atLimit }), atLimit)

  const error = expectInvalid({ question: "x".repeat(MAX_LENGTH + 1) })
  assert.ok(error.message.includes(String(MAX_LENGTH)))
  assert.equal(error.message.includes("x".repeat(16)), false)
})

test("rejects an empty object or missing question field", () => {
  expectInvalid({})
  expectInvalid({ question: undefined })
})

test("rejects blank question strings", () => {
  for (const question of ["", " ", "   ", "\t", "\n  \t"]) {
    expectInvalid({ question })
  }
})

test("rejects non-string question values without coercion", () => {
  const values: readonly unknown[] = [
    5,
    0,
    null,
    true,
    {},
    [],
    ["What is churn?"],
  ]
  for (const value of values) {
    expectInvalid({ question: value })
  }
})

test("rejects non-object input values", () => {
  const inputs: readonly unknown[] = [
    null,
    undefined,
    5,
    true,
    "What is churn?",
    [],
    ["question"],
  ]
  for (const input of inputs) {
    expectInvalid(input)
  }
})

test("rejects extra top-level fields instead of ignoring them", () => {
  const inputs: readonly Record<string, unknown>[] = [
    { question: VALID_QUESTION, filter: { contract: "One Year" } },
    { question: VALID_QUESTION, model: "free-models" },
    {
      question: VALID_QUESTION,
      endpoint: "http://localhost:20128/v1/chat/completions",
    },
    { question: VALID_QUESTION, path: "/etc/passwd" },
    { question: VALID_QUESTION, evidence: { operation: "get_kpi" } },
    { question: VALID_QUESTION, arbitrary: true },
  ]

  for (const input of inputs) {
    const error = expectInvalid(input)
    const extraKeys = Object.keys(input).filter((key) => key !== "question")
    for (const key of extraKeys) {
      assert.ok(error.message.includes(key), `expected message to name ${key}`)
    }
  }
})

test("lists multiple extra fields in sorted order", () => {
  const error = expectInvalid({
    question: VALID_QUESTION,
    model: "free-models",
    filter: {},
  })
  assert.ok(error.message.includes("filter, model"))
})

test("rejects non-plain objects and class instances", () => {
  const inherited: unknown = Object.create({ question: VALID_QUESTION })

  class QuestionInput {
    readonly question = VALID_QUESTION
  }

  expectInvalid(inherited)
  expectInvalid(new QuestionInput())
})

test("does not mutate a frozen input object", () => {
  const input = Object.freeze({ question: "  What is churn?  " })
  assert.equal(expectValid(input), VALID_QUESTION)
  assert.equal(input.question, "  What is churn?  ")
  assert.deepEqual(Object.keys(input), ["question"])
})

test("returns a minimal error that never echoes rejected values", () => {
  const pathLike = "/etc/passwd"
  const longQuestion = `${"x".repeat(MAX_LENGTH + 1)} ${pathLike}`

  const longError = expectInvalid({ question: longQuestion })
  assert.equal(longError.message.includes(pathLike), false)

  const extraValueError = expectInvalid({
    question: 5,
    path: pathLike,
    evidence: pathLike,
  })
  assert.equal(extraValueError.message.includes(pathLike), false)

  assert.deepEqual(Object.keys(longError).sort(), ["code", "kind", "message"])
})
