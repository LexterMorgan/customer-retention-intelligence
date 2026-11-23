/**
 * Manual evaluation CLI for the local retention copilot.
 *
 * Offline (default, no gateway or credential access):
 *   node server/copilot/evaluation/cli.ts
 *
 * Live (one bounded run; requires a server-side credential in the environment):
 *   RETENTION_COPILOT_API_KEY="<token>" \
 *     node server/copilot/evaluation/cli.ts --live --artifact <path>
 *
 * Live runs are manual only and never part of CI.
 */
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { CREDENTIAL_ENV_VAR } from "../types.ts"
import { runLiveEvaluation, runOfflineEvaluation } from "./runner.ts"

export const EVALUATION_USAGE = `Usage: ${CREDENTIAL_ENV_VAR}="<server-side token>" node server/copilot/evaluation/cli.ts [--live] [--artifact <path>]`

type ParsedArgs =
  | {
      readonly ok: true
      readonly live: boolean
      readonly artifactPath?: string
    }
  | { readonly ok: false; readonly message: string }

function parseArgs(argv: readonly string[]): ParsedArgs {
  let live = false
  let artifactPath: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--live") {
      live = true
      continue
    }
    if (argument === "--artifact") {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, message: "--artifact requires a path value" }
      }
      artifactPath = resolve(value)
      index += 1
      continue
    }
    if (argument === "--help" || argument === "-h") {
      return { ok: false, message: EVALUATION_USAGE }
    }
    return { ok: false, message: `Unknown argument: ${argument}` }
  }
  if (!live && artifactPath !== undefined) {
    return {
      ok: false,
      message:
        "--artifact is only valid with --live (offline mode writes no artifact)",
    }
  }
  return {
    ok: true,
    live,
    ...(artifactPath === undefined ? {} : { artifactPath }),
  }
}

async function main(argv: readonly string[]): Promise<void> {
  const parsed = parseArgs(argv)
  if (!parsed.ok) {
    console.log(
      JSON.stringify(
        { mode: "none", error: parsed.message, usage: EVALUATION_USAGE },
        null,
        2
      )
    )
    process.exitCode = 2
    return
  }

  if (!parsed.live) {
    const report = runOfflineEvaluation()
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.exitCode
    return
  }

  const credential = process.env[CREDENTIAL_ENV_VAR]?.trim() ?? ""
  let result: Awaited<ReturnType<typeof runLiveEvaluation>>
  try {
    result = await runLiveEvaluation({
      credential,
      ...(parsed.artifactPath === undefined
        ? {}
        : { artifactPath: parsed.artifactPath }),
    })
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          mode: "live",
          blockedReason: "checkpoint_persistence_failed",
          message:
            error instanceof Error
              ? error.message
              : "The evaluation checkpoint could not be persisted.",
        },
        null,
        2
      )
    )
    process.exitCode = 1
    return
  }

  for (const score of result.scores) {
    console.log(
      JSON.stringify({
        caseId: score.caseId,
        category: score.category,
        classification: score.classification,
        passed: score.passed,
        request: score.request,
        elapsedMs: score.elapsedMs,
        gatewayModel: score.gatewayModel,
        citations: score.citations,
      })
    )
  }
  console.log(
    JSON.stringify(
      {
        mode: result.mode,
        scheduledRoute: "manual",
        blockedReason: result.blockedReason,
        artifactPath: result.artifactPath,
        summary: result.summary,
      },
      null,
      2
    )
  )
  process.exitCode = result.exitCode
}

const isDirectRun =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
  void main(process.argv.slice(2))
}
