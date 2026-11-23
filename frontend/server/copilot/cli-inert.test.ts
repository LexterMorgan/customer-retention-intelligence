/**
 * Offline inertness tests for the copilot CLI and its import graph.
 *
 * Import probes replace global fetch with a throwing spy, and CLI subprocesses
 * run with the credential variable removed from the inherited environment, so
 * every path here fails closed before any transport can be opened.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const CREDENTIAL_ENV_VAR = "RETENTION_COPILOT_API_KEY"
const CLI_RELATIVE_PATH = join("server", "copilot", "cli.ts")
const QUESTION = "What is the overall churn rate?"
const FRONTEND_DIR = fileURLToPath(new URL("../..", import.meta.url))

type CliRun = {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text)
  if (!isRecord(parsed)) {
    assert.fail(`expected a JSON object, received ${text}`)
  }
  return parsed
}

function runCli(args: readonly string[]): CliRun {
  const env = { ...process.env }
  delete env[CREDENTIAL_ENV_VAR]

  const result = spawnSync(process.execPath, [CLI_RELATIVE_PATH, ...args], {
    cwd: FRONTEND_DIR,
    env,
    encoding: "utf8",
  })
  if (result.error !== undefined) {
    assert.fail(`failed to spawn the CLI: ${result.error.message}`)
  }

  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

test("importing the CLI, service, and index modules performs no fetch", async () => {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = () => {
    fetchCalls += 1
    throw new Error("network access attempted during module import")
  }

  try {
    const specifiers = [
      new URL("./cli.ts?import-probe", import.meta.url).href,
      new URL("./service.ts?import-probe", import.meta.url).href,
      new URL("./index.ts?import-probe", import.meta.url).href,
    ]
    for (const specifier of specifiers) {
      const imported: unknown = await import(specifier)
      assert.ok(imported)
    }
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(globalThis.fetch, originalFetch)
})

test("runs without arguments as an invalid-question error with status 2", () => {
  const run = runCli([])
  assert.equal(run.status, 2)

  const output = parseJsonObject(run.stdout)
  assert.equal(output["kind"], "error")
  assert.equal(output["code"], "invalid_question")
  assert.equal(typeof output["message"], "string")
})

test("fails closed without a credential and prints no credential material", () => {
  const run = runCli([QUESTION])
  assert.equal(run.status, 2)

  const output = parseJsonObject(run.stdout)
  assert.equal(output["kind"], "error")
  assert.equal(output["code"], "missing_credential")

  const combined = `${run.stdout}\n${run.stderr}`
  assert.equal(combined.includes("Bearer"), false)
  assert.equal(combined.toLowerCase().includes("bearer"), false)
  assert.equal(combined.includes("Authorization"), false)
  assert.doesNotMatch(
    combined,
    /(?:authorization|bearer|cookie|proxy-authorization)\s*:/i
  )
})
