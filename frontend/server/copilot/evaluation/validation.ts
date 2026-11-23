/**
 * Deterministic dataset validation and hashing for the copilot evaluation.
 *
 * Validation is structural and capability-based: it checks the required
 * category counts, uniqueness, question limits, and that every expected request
 * is a currently supported EvidenceRequest. It does not resolve evidence (the
 * runner does that against the fixed payload).
 */
import { createHash } from "node:crypto"

import {
  DEFINITION_IDS,
  KPI_METRIC_IDS,
  SUPPORTED_CONTRACTS,
  parseEvidenceRequest,
} from "../../evidence/index.ts"
import { CONTRACT_METRIC_IDS } from "../../evidence/index.ts"
import { MAX_QUESTION_LENGTH } from "../types.ts"
import {
  EVALUATION_CATEGORIES,
  EXPECTED_CATEGORY_COUNTS,
  EXPECTED_TOTAL_CASES,
  type EvaluationCase,
  type EvaluationCategory,
  type EvidenceLocator,
} from "./types.ts"

export type DatasetValidationResult = {
  readonly ok: boolean
  readonly errors: readonly string[]
  readonly countsByCategory: Readonly<Record<EvaluationCategory, number>>
  readonly total: number
}

/** Stable JSON: object keys sorted, arrays preserved. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

/** Deterministic SHA-256 of the frozen dataset content. */
export function datasetHash(cases: readonly EvaluationCase[]): string {
  return createHash("sha256").update(stableStringify(cases)).digest("hex")
}

function locatorError(locator: EvidenceLocator, caseId: string): string | null {
  if (locator.section === "kpis") {
    return (KPI_METRIC_IDS as readonly string[]).includes(locator.field)
      ? null
      : `${caseId}: unsupported KPI locator ${String(locator.field)}`
  }
  if (locator.section === "by_contract") {
    if (
      !(SUPPORTED_CONTRACTS as readonly string[]).includes(locator.category)
    ) {
      return `${caseId}: unsupported contract locator ${locator.category}`
    }
    return (CONTRACT_METRIC_IDS as readonly string[]).includes(locator.field)
      ? null
      : `${caseId}: unsupported contract metric ${locator.field}`
  }
  return (DEFINITION_IDS as readonly string[]).includes(locator.id)
    ? null
    : `${caseId}: unsupported definition locator ${locator.id}`
}

export function validateDataset(
  cases: readonly EvaluationCase[]
): DatasetValidationResult {
  const errors: string[] = []
  const counts: Record<EvaluationCategory, number> = {
    supported_paraphrase: 0,
    comparison_ranking: 0,
    unsupported_scope: 0,
    ambiguous_compound: 0,
    adversarial: 0,
  }
  const seenIds = new Set<string>()
  const seenQuestions = new Set<string>()

  for (const testCase of cases) {
    const id = testCase.id
    if (id.trim().length === 0) {
      errors.push("dataset contains an empty case id")
    } else if (seenIds.has(id)) {
      errors.push(`duplicate case id: ${id}`)
    }
    seenIds.add(id)

    if (
      !(EVALUATION_CATEGORIES as readonly string[]).includes(testCase.category)
    ) {
      errors.push(`${id}: unsupported category ${String(testCase.category)}`)
    } else {
      counts[testCase.category] += 1
    }

    const question = testCase.question.trim()
    if (question.length === 0) {
      errors.push(`${id}: question must not be blank`)
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      errors.push(`${id}: question exceeds ${MAX_QUESTION_LENGTH} characters`)
    }
    const normalizedQuestion = question.toLowerCase()
    if (seenQuestions.has(normalizedQuestion)) {
      errors.push(`${id}: duplicate question text`)
    }
    seenQuestions.add(normalizedQuestion)

    if (testCase.rationale.trim().length === 0) {
      errors.push(`${id}: rationale must not be blank`)
    }

    if (testCase.expectedDisposition === "unsupported") {
      if (testCase.acceptableRequests.length > 0) {
        errors.push(`${id}: unsupported cases must have no acceptable request`)
      }
      if (testCase.evidenceAssertions.length > 0) {
        errors.push(`${id}: unsupported cases must have no evidence assertions`)
      }
      continue
    }

    if (testCase.acceptableRequests.length === 0) {
      errors.push(`${id}: answered cases need at least one acceptable request`)
    }
    for (const request of testCase.acceptableRequests) {
      const parsed = parseEvidenceRequest(request)
      if (!parsed.ok) {
        errors.push(
          `${id}: acceptable request is not a supported EvidenceRequest (${parsed.error.code})`
        )
      }
    }
    if (testCase.evidenceAssertions.length === 0) {
      errors.push(`${id}: answered cases need at least one evidence assertion`)
    }
    for (const locator of testCase.evidenceAssertions) {
      const error = locatorError(locator, id)
      if (error !== null) {
        errors.push(error)
      }
    }
  }

  if (cases.length !== EXPECTED_TOTAL_CASES) {
    errors.push(
      `dataset has ${cases.length} cases; expected ${EXPECTED_TOTAL_CASES}`
    )
  }
  for (const category of EVALUATION_CATEGORIES) {
    const expected = EXPECTED_CATEGORY_COUNTS[category]
    if (counts[category] !== expected) {
      errors.push(
        `category ${category} has ${counts[category]} cases; expected ${expected}`
      )
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    countsByCategory: counts,
    total: cases.length,
  }
}
