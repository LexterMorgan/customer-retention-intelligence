/// <reference types="node" />
/**
 * Offline tests for the headless copilot controller.
 *
 * The controller is intentionally React-free, so these tests only need a fake
 * `ask` function and promise flushing; no JSX, DOM, or fetch is involved.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  createCopilotController,
  MAX_COPILOT_QUESTION_LENGTH,
  type CopilotStatus,
} from "./copilot-controller.ts"
import type {
  CopilotAnswered,
  CopilotEvidence,
  CopilotFact,
  CopilotModel,
  CopilotResult,
} from "./copilot-contract.ts"

const ARTIFACT_SHA = "a".repeat(64)

const FACT: CopilotFact = {
  id: "fact-churn-rate",
  citation: { id: "cite-kpis-churn-rate", artifactSha256: ARTIFACT_SHA },
  metric: { id: "churn_rate_pct", label: "Churn Rate" },
  value: 28.37,
  unit: { kind: "percentage" },
  scope: { kind: "overall" },
  population: { id: "existing_customers", definition: "Churned + Stayed" },
  locator: { section: "kpis", field: "churn_rate_pct" },
}

const MODEL: CopilotModel = {
  provider: "9router",
  configuredRoute: "free-models",
  status: 200,
  gatewayReportedModel: "test-model",
  usage: { total_tokens: 42 },
}

const EVIDENCE: CopilotEvidence = {
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
  facts: [FACT],
  definitions: [],
  caveats: ["Rates describe the Q2 2022 snapshot only."],
}

function makeAnswered(question: string): CopilotAnswered {
  return {
    kind: "answered",
    question,
    answerText: `Churn Rate for the Q2 2022 full snapshot: 28.37%.`,
    request: { operation: "get_kpi", metric: "churn_rate_pct" },
    evidence: EVIDENCE,
    model: MODEL,
    elapsedMs: 1234,
  }
}

type Deferred<T> = {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test("one accepted submit calls ask once with the trimmed question", async () => {
  const calls: string[] = []
  const statuses: CopilotStatus[] = []
  const controller = createCopilotController({
    ask: async (input) => {
      calls.push(input.question)
      return makeAnswered(input.question)
    },
    onStateChange: (state) => {
      statuses.push(state.status)
    },
  })
  controller.subscribe((state) => {
    statuses.push(state.status)
  })

  controller.setQuestion("  What is the overall churn rate?  ")
  statuses.length = 0
  const pending = controller.submit()

  assert.deepEqual(calls, ["What is the overall churn rate?"])
  assert.equal(controller.getState().status, "loading")
  assert.deepEqual(statuses, ["loading", "loading"])

  await pending

  const state = controller.getState()
  assert.equal(state.status, "answered")
  assert.equal(state.question, "What is the overall churn rate?")
  assert.equal(state.result?.kind, "answered")
  assert.deepEqual(statuses, ["loading", "loading", "answered", "answered"])
})

test("ignores a second submit while the first request is loading", async () => {
  const gate = deferred<CopilotResult>()
  let askCount = 0
  const controller = createCopilotController({
    ask: () => {
      askCount += 1
      return gate.promise
    },
  })

  controller.setQuestion("q1")
  const first = controller.submit()
  const second = controller.submit()

  assert.equal(askCount, 1)

  gate.resolve(makeAnswered("q1"))
  await first
  await second

  assert.equal(askCount, 1)
  assert.equal(controller.getState().status, "answered")
})

test("does nothing for a blank submit", async () => {
  let askCount = 0
  const controller = createCopilotController({
    ask: async () => {
      askCount += 1
      return makeAnswered("q")
    },
  })

  controller.setQuestion("   ")
  await controller.submit()

  assert.equal(askCount, 0)
  assert.equal(controller.getState().status, "idle")
  // The draft itself is preserved; only submission trims/validates.
  assert.equal(controller.getState().question, "   ")
})

test("fills the input from an example without submitting it", () => {
  let askCount = 0
  const controller = createCopilotController({
    ask: async () => {
      askCount += 1
      return makeAnswered("q")
    },
  })

  controller.applyExample("What does MRVL mean?")

  assert.equal(controller.getState().question, "What does MRVL mean?")
  assert.equal(controller.getState().status, "idle")
  assert.equal(askCount, 0)
})

test("retry is manual and re-submits the last submitted question", async () => {
  const calls: string[] = []
  let attempt = 0
  const controller = createCopilotController({
    ask: async (input) => {
      calls.push(input.question)
      attempt += 1
      if (attempt === 1) {
        return {
          kind: "error",
          code: "busy",
          message: "The retention analyst is busy; try again.",
        }
      }
      return makeAnswered(input.question)
    },
  })

  controller.setQuestion("Compare One Year and Two Year contracts.")
  await controller.submit()

  assert.equal(controller.getState().status, "error")
  assert.equal(
    controller.getState().errorMessage,
    "The retention analyst is busy; try again."
  )
  assert.deepEqual(calls, ["Compare One Year and Two Year contracts."])

  await controller.retry()

  assert.deepEqual(calls, [
    "Compare One Year and Two Year contracts.",
    "Compare One Year and Two Year contracts.",
  ])
  assert.equal(controller.getState().status, "answered")
})

test("retry before any submission is a no-op", async () => {
  let askCount = 0
  const controller = createCopilotController({
    ask: async () => {
      askCount += 1
      return makeAnswered("q")
    },
  })

  await controller.retry()

  assert.equal(askCount, 0)
  assert.equal(controller.getState().status, "idle")
})

test("keeps the newest submission's result across sequential submissions", async () => {
  const calls: string[] = []
  const controller = createCopilotController({
    ask: async (input) => {
      calls.push(input.question)
      return makeAnswered(input.question)
    },
  })

  controller.setQuestion("first question")
  await controller.submit()
  assert.equal(controller.getState().question, "first question")

  controller.setQuestion("second question")
  await controller.submit()

  assert.deepEqual(calls, ["first question", "second question"])
  assert.equal(controller.getState().status, "answered")
  assert.equal(controller.getState().question, "second question")
  assert.equal(controller.getState().result?.kind, "answered")
})

test("ignores a late result after dispose", async () => {
  const gate = deferred<CopilotResult>()
  let askCount = 0
  const controller = createCopilotController({
    ask: () => {
      askCount += 1
      return gate.promise
    },
  })

  controller.setQuestion("q")
  const pending = controller.submit()
  assert.equal(askCount, 1)

  const stateBeforeDispose = controller.getState()
  controller.dispose()
  gate.resolve(makeAnswered("q"))
  await pending

  assert.equal(controller.getState(), stateBeforeDispose)
  assert.equal(controller.getState().status, "loading")
})

test("dispose prevents later state changes and subscriptions", () => {
  const controller = createCopilotController({
    ask: async () => makeAnswered("q"),
  })

  controller.setQuestion("q")
  const stateBeforeDispose = controller.getState()
  const unsubscribe = controller.subscribe(() => {
    assert.fail("a disposed controller must not notify listeners")
  })
  controller.dispose()
  unsubscribe()

  assert.equal(controller.isDisposed(), true)
  controller.setQuestion("other")
  assert.equal(controller.getState(), stateBeforeDispose)
})

test("sanitizes error results into the error state", async () => {
  const controller = createCopilotController({
    ask: async () => ({
      kind: "error",
      code: "busy",
      message: "<b>Service busy</b>  \n  Try <script>bad()</script> again.",
    }),
  })

  controller.setQuestion("q")
  await controller.submit()

  const state = controller.getState()
  assert.equal(state.status, "error")
  assert.equal(state.errorMessage, "Service busy Try bad() again.")
  assert.equal(state.errorMessage?.includes("<"), false)
})

test("converts a thrown ask into a sanitized error state", async () => {
  const controller = createCopilotController({
    ask: async () => {
      throw new Error("transport exploded")
    },
  })

  controller.setQuestion("q")
  await controller.submit()

  const state = controller.getState()
  assert.equal(state.status, "error")
  assert.equal(state.errorMessage, "The retention analyst request failed.")
})

test("never submits on its own after a state change", async () => {
  let askCount = 0
  const controller = createCopilotController({
    ask: async () => {
      askCount += 1
      return makeAnswered("q")
    },
  })
  controller.subscribe(() => {
    // A listener that only observes must not trigger submissions.
  })

  controller.setQuestion("q")
  controller.applyExample("What does MRVL mean?")
  await Promise.resolve()

  assert.equal(askCount, 0)
  assert.equal(controller.getState().status, "idle")
})

test("caps the draft value without trimming it", () => {
  const controller = createCopilotController({
    ask: async () => makeAnswered("q"),
  })

  controller.setQuestion("   ")
  assert.equal(controller.getState().question, "   ")

  controller.setQuestion(`  ${"a".repeat(500)}  `)
  const question = controller.getState().question
  assert.equal(question.length, MAX_COPILOT_QUESTION_LENGTH)
  assert.equal(question.startsWith("  a"), true)
  assert.equal(question.endsWith("a"), true)
})

test("keeps internal spaces across successive keystrokes", () => {
  const controller = createCopilotController({
    ask: async () => makeAnswered("q"),
  })
  const target = "What is churn?"

  for (const character of target) {
    const current = controller.getState().question
    controller.setQuestion(current + character)
    assert.equal(
      controller.getState().question,
      target.slice(0, current.length + 1)
    )
  }

  assert.equal(controller.getState().question, "What is churn?")
  assert.equal(controller.getState().question.includes("is churn"), true)
})

test("trims surrounding whitespace only on submit", async () => {
  const calls: string[] = []
  const controller = createCopilotController({
    ask: async (input) => {
      calls.push(input.question)
      return makeAnswered(input.question)
    },
  })

  controller.setQuestion("  What is churn?  ")
  assert.equal(controller.getState().question, "  What is churn?  ")
  assert.deepEqual(calls, [])

  await controller.submit()
  assert.deepEqual(calls, ["What is churn?"])
})

test("a whitespace-only draft never calls the service", async () => {
  let calls = 0
  const controller = createCopilotController({
    ask: async () => {
      calls += 1
      return makeAnswered("q")
    },
  })

  controller.setQuestion("   ")
  await controller.submit()

  assert.equal(calls, 0)
  assert.equal(controller.getState().status, "idle")
})
