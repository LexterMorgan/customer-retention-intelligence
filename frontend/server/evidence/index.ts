/**
 * Public entry point for the deterministic evidence layer.
 *
 * Milestone 1 has no model calls, API endpoint, UI, deployment, or secrets.
 * Callers validate and resolve typed requests against the fixed aggregate
 * dashboard payload only.
 */
export {
  CONTRACT_METRIC_IDS,
  DEFINITION_IDS,
  DEFAULT_ARTIFACT_SOURCE,
  KPI_METRIC_IDS,
  SUPPORTED_CONTRACTS,
} from "./types.ts"
export type {
  Citation,
  ContractMetricId,
  DefinitionEvidence,
  DefinitionId,
  DefinitionSource,
  EvidenceContractRow,
  EvidenceEnvelope,
  EvidenceError,
  EvidenceErrorCode,
  EvidenceErrorKind,
  EvidenceFact,
  EvidencePayload,
  EvidenceRequest,
  EvidenceResult,
  FactLocator,
  FactPopulation,
  FactScope,
  FactUnit,
  HighestChurnSelection,
  KpiMetricId,
  MrvlDefinitionState,
  PopulationId,
  SupportedContract,
} from "./types.ts"
export { DEFINITIONS } from "./definitions.ts"
export { parseEvidenceRequest } from "./requests.ts"
export type { ParseRequestResult } from "./requests.ts"
export { createEvidenceResolver, validateEvidencePayload } from "./resolver.ts"
export type {
  CreateResolverResult,
  EvidenceIdentity,
  EvidenceResolver,
  ValidatePayloadResult,
} from "./resolver.ts"
export {
  loadEvidence,
  loadEvidenceFromBytes,
  loadPayloadArtifact,
} from "./payload.ts"
export type {
  EvidenceService,
  LoadEvidenceResult,
  PayloadArtifact,
} from "./payload.ts"
