/**
 * Vite plugin for the development-only copilot HTTP route.
 *
 * The plugin exists only through `configureServer`: there is deliberately no
 * `configurePreviewServer` or build hook, so a production build or preview
 * server never exposes the route. One service instance is created per dev
 * server, and the bound port is resolved lazily from the HTTP server address.
 */
import type { Plugin, ViteDevServer } from "vite"

import { attachCopilotDevRoute } from "./dev-route.ts"
import { createCopilotService } from "./service.ts"
import { CREDENTIAL_ENV_VAR } from "./types.ts"

/** Actual listening port, or null while the dev server is not bound. */
function boundPortOf(server: ViteDevServer): number | null {
  const address = server.httpServer?.address()
  if (
    address === null ||
    address === undefined ||
    typeof address === "string"
  ) {
    return null
  }
  return address.port
}

/**
 * Mount `POST /api/copilot` on the dev server. The credential is read on the
 * server only (never from client input); a missing credential is a sanitized
 * 503 from the service, not a startup failure.
 */
export function copilotDevRoutePlugin(): Plugin {
  return {
    name: "copilot-dev-route",
    configureServer(server) {
      const service = createCopilotService({
        credential: process.env[CREDENTIAL_ENV_VAR] ?? "",
      })
      attachCopilotDevRoute(server, {
        ask: service.ask,
        getBoundPort: () => boundPortOf(server),
      })
    },
  }
}
