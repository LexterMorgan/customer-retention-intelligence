/**
 * Public entry point for the server-side retention copilot service.
 *
 * Milestone 3B provides a runnable local flow: question -> one 9router request
 * -> validated EvidenceRequest -> existing evidence resolver -> deterministic
 * cited answer. There is no HTTP endpoint, UI, deployment, or streaming.
 */
export { createCopilotService, UNSUPPORTED_SCOPE_MESSAGE } from "./service.ts"
export type { CopilotService, CopilotServiceDeps } from "./service.ts"
export { formatAnswer, formatFactValue } from "./format.ts"
export { validateQuestionInput } from "./question.ts"
export { createNineRouterTransport } from "./transport.ts"
export type { NineRouterTransportDeps } from "./transport.ts"
export {
  CONFIGURED_PROVIDER,
  CONFIGURED_ROUTE,
  CREDENTIAL_ENV_VAR,
  MAX_QUESTION_LENGTH,
  NINE_ROUTER_ENDPOINT,
} from "./types.ts"
export type {
  CopilotAnswered,
  CopilotError,
  CopilotErrorCode,
  CopilotResult,
  CopilotUnsupported,
  ModelCallResult,
  ModelFailureCategory,
  ModelMetadata,
  ModelTransport,
  QuestionValidation,
} from "./types.ts"
