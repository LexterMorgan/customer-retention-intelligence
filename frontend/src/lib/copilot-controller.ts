/**
 * Headless state machine for the dashboard copilot panel.
 *
 * React-free on purpose: the panel only renders this state, and the behavior
 * (single submit, manual retry, stale-result rejection, disposal) is tested
 * under `node --test` without JSX or a DOM.
 */
import type { CopilotResult } from "./copilot-contract.ts"
import { sanitizeCopilotMessage } from "./copilot-view.ts"

/** Mirrors the server's maximum question length. */
export const MAX_COPILOT_QUESTION_LENGTH = 400

const GENERIC_FAILURE_MESSAGE = "The retention analyst request failed."

export type CopilotStatus =
  "idle" | "loading" | "answered" | "unsupported" | "error"

export type CopilotState = {
  readonly status: CopilotStatus
  /** Current draft input, capped but otherwise exactly as typed. */
  readonly question: string
  /** Terminal result for the answered / unsupported / error statuses. */
  readonly result?: CopilotResult
  /** Sanitized display message for the error status. */
  readonly errorMessage?: string
}

export type AskCopilot = (input: {
  readonly question: string
  readonly signal?: AbortSignal
}) => Promise<CopilotResult>

export type CopilotListener = (state: CopilotState) => void

export type CreateCopilotControllerOptions = {
  readonly ask: AskCopilot
  readonly onStateChange?: CopilotListener
}

export type CopilotController = {
  /**
   * Replace the draft input. The value is capped to the maximum length but is
   * otherwise preserved exactly (spaces included); trimming happens only when
   * the question is validated/submitted.
   */
  setQuestion: (value: string) => void
  /** Submit the current question once; no-op when blank or already loading. */
  submit: () => Promise<void>
  /** Re-submit the last submitted question; never automatic. */
  retry: () => Promise<void>
  /** Fill the input from an example prompt without submitting it. */
  applyExample: (prompt: string) => void
  getState: () => CopilotState
  subscribe: (listener: CopilotListener) => () => void
  /** Permanently stop state updates for this controller instance. */
  dispose: () => void
  isDisposed: () => boolean
}

function noop(): void {
  // Intentionally empty: used for already-disposed subscriptions.
}

function capQuestion(value: string): string {
  return value.slice(0, MAX_COPILOT_QUESTION_LENGTH)
}

export function createCopilotController({
  ask,
  onStateChange,
}: CreateCopilotControllerOptions): CopilotController {
  let state: CopilotState = { status: "idle", question: "" }
  let disposed = false
  let generation = 0
  let lastSubmittedQuestion: string | null = null
  const listeners = new Set<CopilotListener>()

  function transition(next: CopilotState): void {
    if (disposed) {
      return
    }
    state = next
    onStateChange?.(next)
    for (const listener of [...listeners]) {
      listener(next)
    }
  }

  async function run(question: string): Promise<void> {
    if (disposed) {
      return
    }
    generation += 1
    const requestGeneration = generation
    lastSubmittedQuestion = question
    transition({ status: "loading", question })

    let result: CopilotResult
    try {
      result = await ask({ question })
    } catch {
      if (disposed || requestGeneration !== generation) {
        return
      }
      transition({
        status: "error",
        question,
        errorMessage: GENERIC_FAILURE_MESSAGE,
      })
      return
    }

    // A result may only update the submission that produced it.
    if (disposed || requestGeneration !== generation) {
      return
    }

    if (result.kind === "error") {
      transition({
        status: "error",
        question,
        result,
        errorMessage: sanitizeCopilotMessage(result.message),
      })
      return
    }

    transition({ status: result.kind, question, result })
  }

  async function submit(): Promise<void> {
    if (disposed || state.status === "loading") {
      return
    }
    const question = state.question.trim()
    if (question.length === 0) {
      return
    }
    await run(question)
  }

  async function retry(): Promise<void> {
    if (disposed || state.status === "loading") {
      return
    }
    if (lastSubmittedQuestion === null) {
      return
    }
    await run(lastSubmittedQuestion)
  }

  function setQuestion(value: string): void {
    if (disposed) {
      return
    }
    const question = capQuestion(value)
    if (question === state.question) {
      return
    }
    transition({ ...state, question })
  }

  function applyExample(prompt: string): void {
    setQuestion(prompt)
  }

  function getState(): CopilotState {
    return state
  }

  function subscribe(listener: CopilotListener): () => void {
    if (disposed) {
      return noop
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function dispose(): void {
    if (disposed) {
      return
    }
    disposed = true
    generation += 1
    listeners.clear()
  }

  function isDisposed(): boolean {
    return disposed
  }

  return {
    setQuestion,
    submit,
    retry,
    applyExample,
    getState,
    subscribe,
    dispose,
    isDisposed,
  }
}
