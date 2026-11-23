/// <reference types="node" />
/**
 * Offline tests for the evaluation dataset and runner entry points.
 *
 * No gateway, credential, or network access: the blocked live path is exercised
 * with an empty credential, and imports are verified to start no calls.
 */
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { loadEvidence } from "../evidence/index.ts"
import { formatAnswer } from "./format.ts"
import type { CopilotResult } from "./types.ts"
import { EVALUATION_DATASET } from "./evaluation/dataset.ts"
import { runLiveEvaluation, runOfflineEvaluation } from "./evaluation/runner.ts"
import { validateDataset } from "./evaluation/validation.ts"

test("dataset has exactly 36 cases with the required category counts", () => {
  const validation = validateDataset(EVALUATION_DATASET)
  assert.equal(validation.ok, true, validation.errors.join("; "))
  assert.equal(validation.total, 36)
  assert.deepEqual(validation.countsByCategory, {
    supported_paraphrase: 12,
    comparison_ranking: 6,
    unsupported_scope: 6,
    ambiguous_compound: 6,
    adversarial: 6,
  })
})

test("dataset case ids and questions are unique", () => {
  const ids = EVALUATION_DATASET.map((testCase) => testCase.id)
  const questions = EVALUATION_DATASET.map((testCase) =>
    testCase.question.trim().toLowerCase()
  )
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(questions).size, questions.length)
})

test("offline evaluation validates expectations without model performance claims", () => {
  const report = runOfflineEvaluation()
  assert.equal(report.mode, "offline")
  assert.match(report.label, /not model performance/i)
  assert.equal(report.dataset.valid, true)
  assert.equal(report.dataset.total, 36)
  assert.equal(report.expectedEvidence.resolved, 17)
  assert.deepEqual(report.expectedEvidence.failed, [])
  assert.deepEqual(report.assertions.failed, [])
  assert.ok(report.evaluatorSelfCheck.checks > 0)
  assert.deepEqual(report.evaluatorSelfCheck.failed, [])
  assert.equal(report.passed, true)
  assert.equal(report.exitCode, 0)
})

test("live evaluation is blocked without a credential and makes no calls", async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error("network access is not allowed in this test")
  }) as typeof fetch
  try {
    const result = await runLiveEvaluation({ credential: "" })
    assert.equal(result.mode, "live")
    assert.equal(result.blockedReason, "missing_credential")
    assert.equal(result.summary.attempted, 0)
    assert.equal(result.summary.unattempted, 36)
    assert.equal(result.summary.fullRun, false)
    assert.notEqual(result.exitCode, 0)
    assert.equal(result.artifactPath, null)
    assert.deepEqual(result.scores, [])
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("importing the runner and CLI modules starts no calls", async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error("network access is not allowed in this test")
  }) as typeof fetch
  try {
    const runnerModule = await import("./evaluation/runner.ts")
    const cliModule = await import("./evaluation/cli.ts")
    assert.equal(typeof runnerModule.runOfflineEvaluation, "function")
    assert.equal(typeof runnerModule.runLiveEvaluation, "function")
    assert.equal(typeof cliModule.EVALUATION_USAGE, "string")
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("interruption after a completed case preserves the checkpoint", async () => {
  const directory = mkdtempSync(join(tmpdir(), "copilot-eval-checkpoint-"))
  const artifactPath = join(directory, "run.json")
  try {
    const loaded = loadEvidence()
    assert.equal(loaded.ok, true)
    if (!loaded.ok) {
      return
    }
    const firstCase = EVALUATION_DATASET[0]
    const request = firstCase.acceptableRequests[0]
    const resolved = loaded.service.resolve(request)
    assert.equal(resolved.ok, true)
    if (!resolved.ok) {
      return
    }
    const fixture: CopilotResult = {
      kind: "answered",
      question: firstCase.question,
      answerText: formatAnswer(resolved.envelope),
      request: resolved.envelope.request,
      evidence: resolved.envelope,
      model: {
        provider: "9router",
        configuredRoute: "free-models",
        status: 200,
        gatewayReportedModel: "checkpoint-test-model",
        usage: { total_tokens: 1 },
      },
      elapsedMs: 1,
    }

    let calls = 0
    const result = await runLiveEvaluation({
      credential: "offline-test-credential",
      artifactPath,
      ask: async () => {
        calls += 1
        if (calls > 1) {
          throw new Error("the interrupted run must not call again")
        }
        return fixture
      },
      onCaseCompleted: () => {
        throw new Error("simulated interruption")
      },
    })

    assert.equal(calls, 1)
    assert.equal(result.scores.length, 1)
    assert.equal(result.scores[0]?.caseId, firstCase.id)
    assert.equal(result.scores[0]?.passed, true)
    assert.equal(result.summary.attempted, 1)
    assert.equal(result.summary.unattempted, 35)
    assert.equal(result.summary.fullRun, false)
    assert.equal(result.summary.passed, false)
    assert.notEqual(result.exitCode, 0)
    assert.equal(result.artifactPath, artifactPath)

    const saved = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      mode: string
      cases: Array<{ caseId: string; passed: boolean }>
      summary: {
        attempted: number
        unattempted: number
        fullRun: boolean
        passed: boolean
        exitCode: number
        stoppedReason: string | null
      }
    }
    assert.equal(saved.mode, "live")
    assert.equal(saved.cases.length, 1)
    assert.equal(saved.cases[0]?.caseId, firstCase.id)
    assert.equal(saved.cases[0]?.passed, true)
    assert.equal(saved.summary.attempted, 1)
    assert.equal(saved.summary.unattempted, 35)
    assert.equal(saved.summary.fullRun, false)
    assert.equal(saved.summary.passed, false)
    assert.equal(saved.summary.stoppedReason, "interrupted")
    assert.notEqual(saved.summary.exitCode, 0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("checkpoint persistence failure stops before any model call", async () => {
  const directory = mkdtempSync(join(tmpdir(), "copilot-eval-blocked-"))
  try {
    const blockingFile = join(directory, "not-a-directory")
    writeFileSync(blockingFile, "x", "utf8")
    let calls = 0
    await assert.rejects(
      runLiveEvaluation({
        credential: "offline-test-credential",
        artifactPath: join(blockingFile, "run.json"),
        ask: async () => {
          calls += 1
          throw new Error("must not be called")
        },
      }),
      /Failed to persist the evaluation checkpoint/
    )
    assert.equal(calls, 0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
