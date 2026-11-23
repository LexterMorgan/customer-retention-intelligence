/**
 * Sanitized evaluation artifact builder.
 *
 * Records dataset and payload identity, git/runtime source identity, request
 * controls, per-case sanitized outcomes, and the summary. It never records
 * credentials, authorization headers, environment contents, customer records,
 * raw provider bodies, or hidden reasoning.
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { extname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { CONFIGURED_ROUTE, NINE_ROUTER_ENDPOINT } from "../types.ts"
import type { CaseScore, EvaluationSummary } from "./scoring.ts"
import { EVALUATION_DATASET_VERSION, type EvaluationCase } from "./types.ts"
import { datasetHash } from "./validation.ts"

const FRONTEND_ROOT = fileURLToPath(new URL("../../..", import.meta.url))
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url))
const RUNTIME_SOURCE_ROOTS = [
  resolve(FRONTEND_ROOT, "server/copilot"),
  resolve(FRONTEND_ROOT, "server/evidence"),
]

export const REQUEST_CONTROLS = {
  endpoint: NINE_ROUTER_ENDPOINT,
  configuredRoute: CONFIGURED_ROUTE,
  stream: false,
  responseFormat: "json_object",
  maxTokens: 4096,
  reasoning: { effort: "low", exclude: true },
  timeoutMs: 90_000,
  maxResponseBytes: 262_144,
  retries: 0,
} as const

export type RuntimeSourceIdentity = {
  readonly algorithm: "sha256"
  readonly files: Readonly<Record<string, string>>
  readonly combined: string
}

function listRuntimeSources(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      found.push(...listRuntimeSources(full))
      continue
    }
    if (extname(entry.name) !== ".ts" || entry.name.endsWith(".test.ts")) {
      continue
    }
    found.push(full)
  }
  return found
}

/** Hash the actual runtime TypeScript sources used by a live run. */
export function hashRuntimeSources(): RuntimeSourceIdentity {
  const files: Record<string, string> = {}
  const combined = createHash("sha256")
  const paths = RUNTIME_SOURCE_ROOTS.flatMap((root) => listRuntimeSources(root))
    .map((path) => relative(FRONTEND_ROOT, path).split(sep).join("/"))
    .sort()
  for (const path of paths) {
    const absolute = resolve(FRONTEND_ROOT, path)
    const sha256 = createHash("sha256")
      .update(readFileSync(absolute))
      .digest("hex")
    files[path] = sha256
    combined.update(path).update("\0").update(sha256).update("\n")
  }
  return { algorithm: "sha256", files, combined: combined.digest("hex") }
}

export type GitIdentity = {
  readonly revision: string | null
  readonly dirty: boolean | null
}

export function readGitIdentity(): GitIdentity {
  try {
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      timeout: 10_000,
    }).trim()
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      timeout: 10_000,
    })
    return {
      revision: revision === "" ? null : revision,
      dirty: status.trim() !== "",
    }
  } catch {
    return { revision: null, dirty: null }
  }
}

export type EvaluationArtifact = {
  readonly kind: "live-evaluation-artifact"
  readonly dataset: {
    readonly version: string
    readonly sha256: string
    readonly totalCases: number
  }
  readonly aggregatePayloadSha256: string
  readonly runTimestampUtc: string
  readonly git: GitIdentity
  readonly runtimeSource: RuntimeSourceIdentity
  readonly configuredRoute: string
  readonly requestControls: typeof REQUEST_CONTROLS
  readonly mode: "live"
  readonly cases: readonly CaseScore[]
  readonly summary: EvaluationSummary
  readonly limitations: readonly string[]
}

export type BuildArtifactInput = {
  readonly cases: readonly EvaluationCase[]
  readonly scores: readonly CaseScore[]
  readonly summary: EvaluationSummary
  readonly aggregatePayloadSha256: string
  readonly runTimestampUtc: string
  readonly git: GitIdentity
  readonly runtimeSource: RuntimeSourceIdentity
  readonly limitations: readonly string[]
}

export function buildEvaluationArtifact(
  input: BuildArtifactInput
): EvaluationArtifact {
  return {
    kind: "live-evaluation-artifact",
    dataset: {
      version: EVALUATION_DATASET_VERSION,
      sha256: datasetHash(input.cases),
      totalCases: input.cases.length,
    },
    aggregatePayloadSha256: input.aggregatePayloadSha256,
    runTimestampUtc: input.runTimestampUtc,
    git: input.git,
    runtimeSource: input.runtimeSource,
    configuredRoute: CONFIGURED_ROUTE,
    requestControls: REQUEST_CONTROLS,
    mode: "live",
    cases: input.scores.map((score) => ({ ...score })),
    summary: input.summary,
    limitations: [...input.limitations],
  }
}
