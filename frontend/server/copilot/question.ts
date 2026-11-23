/**
 * Question input validation for the copilot service.
 *
 * Accepts exactly `{ question: string }`. No filters, model, endpoint, path,
 * evidence, or extra fields are accepted, and nothing is coerced. Validation
 * runs before any transport call.
 */
import {
  MAX_QUESTION_LENGTH,
  type CopilotError,
  type QuestionValidation,
} from "./types.ts"

function invalidQuestion(message: string): QuestionValidation {
  const error: CopilotError = {
    kind: "error",
    code: "invalid_question",
    message,
  }
  return { ok: false, error }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function validateQuestionInput(input: unknown): QuestionValidation {
  if (!isPlainObject(input)) {
    return invalidQuestion(
      "Input must be an object with a single 'question' field."
    )
  }

  const keys = Reflect.ownKeys(input)
  const extra = keys
    .filter((key) => key !== "question")
    .map((key) => String(key))
    .sort()
  if (extra.length > 0) {
    return invalidQuestion(
      `Input contains unsupported properties: ${extra.join(", ")}.`
    )
  }
  if (!Object.prototype.hasOwnProperty.call(input, "question")) {
    return invalidQuestion("'question' is required.")
  }

  const raw = input["question"]
  if (typeof raw !== "string") {
    return invalidQuestion("'question' must be a string.")
  }

  const question = raw.trim()
  if (question === "") {
    return invalidQuestion("'question' must not be blank.")
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return invalidQuestion(
      `'question' must be at most ${MAX_QUESTION_LENGTH} characters.`
    )
  }

  return { ok: true, question }
}
