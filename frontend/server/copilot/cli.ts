/**
 * Manual CLI entry point for the retention copilot service.
 *
 * Usage (from `frontend/`):
 *   RETENTION_COPILOT_API_KEY="<server-side bearer token>" \
 *     node server/copilot/cli.ts "What is the overall churn rate?"
 *
 * The credential comes only from the project-specific server-side environment
 * variable. This module never prints credentials, headers, or raw model output;
 * importing it does not start the CLI.
 */
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { createCopilotService } from "./service.ts"
import { CREDENTIAL_ENV_VAR, type CopilotResult } from "./types.ts"

export const CLI_USAGE = `Usage: ${CREDENTIAL_ENV_VAR}="<server-side bearer token>" node server/copilot/cli.ts "<question>"`

function invalidQuestionError(message: string): CopilotResult {
  return {
    kind: "error",
    code: "invalid_question",
    message,
    details: { usage: CLI_USAGE },
  }
}

async function main(argv: readonly string[]): Promise<void> {
  const question = argv.join(" ").trim()
  if (question === "") {
    console.log(
      JSON.stringify(
        invalidQuestionError("A single question argument is required."),
        null,
        2
      )
    )
    process.exitCode = 2
    return
  }

  const credential = process.env[CREDENTIAL_ENV_VAR]?.trim() ?? ""
  const service = createCopilotService({ credential })
  const result = await service.ask({ question })
  console.log(JSON.stringify(result, null, 2))

  if (result.kind === "error") {
    process.exitCode = result.code === "missing_credential" ? 2 : 1
    return
  }
  // Answered and unsupported results are both completed requests.
  process.exitCode = 0
}

const isDirectRun =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
  void main(process.argv.slice(2))
}
