import fs from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/**
 * Keep the frontend on the canonical Milestone 2 artifact without duplicating
 * analytics. Copies data/processed/dashboard_payload.json into public/data for
 * fetch() during dev and production builds.
 */
function syncDashboardPayload(): Plugin {
  const rootDir = import.meta.dirname
  const source = path.resolve(rootDir, "../data/processed/dashboard_payload.json")
  const targetDir = path.resolve(rootDir, "public/data")
  const target = path.join(targetDir, "dashboard_payload.json")

  const sync = () => {
    if (!fs.existsSync(source)) {
      console.warn(`[sync-dashboard-payload] Missing source: ${source}`)
      return
    }
    fs.mkdirSync(targetDir, { recursive: true })
    fs.copyFileSync(source, target)
  }

  return {
    name: "sync-dashboard-payload",
    buildStart() {
      sync()
    },
    configureServer(server) {
      sync()
      server.watcher.add(source)
      server.watcher.on("change", (file) => {
        if (path.resolve(file) === source) {
          sync()
          server.ws.send({ type: "full-reload" })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), syncDashboardPayload()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
