import { useCallback, useEffect, useState } from "react"

import {
  isKpiLayerEmpty,
  loadDashboardPayload,
} from "@/lib/load-dashboard-payload"
import type { DashboardPayload } from "@/types/dashboard"

export type DashboardPayloadStatus =
  | "loading"
  | "ready"
  | "empty"
  | "error"

export type DashboardPayloadState = {
  status: DashboardPayloadStatus
  payload: DashboardPayload | null
  error: string | null
  reload: () => void
}

export function useDashboardPayload(): DashboardPayloadState {
  const [status, setStatus] = useState<DashboardPayloadStatus>("loading")
  const [payload, setPayload] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(0)

  const reload = useCallback(() => {
    setStatus("loading")
    setError(null)
    setRequestId((id) => id + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    void loadDashboardPayload()
      .then((data) => {
        if (cancelled) {
          return
        }

        if (isKpiLayerEmpty(data)) {
          setPayload(data)
          setStatus("empty")
          return
        }

        setPayload(data)
        setStatus("ready")
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return
        }

        const message =
          err instanceof Error ? err.message : "Unknown payload load error."
        setPayload(null)
        setError(message)
        setStatus("error")
      })

    return () => {
      cancelled = true
    }
  }, [requestId])

  return { status, payload, error, reload }
}
