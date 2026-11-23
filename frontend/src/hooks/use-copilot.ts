import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { askCopilot } from "@/lib/ask-copilot"
import {
  createCopilotController,
  type CopilotController,
  type CopilotState,
} from "@/lib/copilot-controller"

export type CopilotApi = {
  readonly state: CopilotState
  readonly setQuestion: (value: string) => void
  readonly submit: () => Promise<void>
  readonly retry: () => Promise<void>
  readonly applyExample: (prompt: string) => void
}

function createController(): CopilotController {
  return createCopilotController({ ask: askCopilot })
}

/**
 * Bind the headless copilot controller to React.
 *
 * The controller is created once per component instance and disposed when the
 * component unmounts. Nothing here submits a question; only user interaction
 * does.
 */
export function useCopilot(): CopilotApi {
  const [controller] = useState<CopilotController>(createController)
  const mountedRef = useRef(false)

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Defer disposal by one microtask so React StrictMode's
      // mount -> cleanup -> mount cycle does not kill the live controller.
      // A real unmount has no follow-up mount, so it still disposes.
      queueMicrotask(() => {
        if (!mountedRef.current) {
          controller.dispose()
        }
      })
    }
  }, [controller])

  return {
    state,
    setQuestion: (value) => {
      controller.setQuestion(value)
    },
    submit: () => controller.submit(),
    retry: () => controller.retry(),
    applyExample: (prompt) => {
      controller.applyExample(prompt)
    },
  }
}
