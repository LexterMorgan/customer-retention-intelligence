/**
 * Evaluation dataset contract for the local retention copilot (Milestone 5).
 *
 * Cases are frozen expectations authored for review; they are never sent to the
 * model and never edited to match observed output. Expected evidence is
 * expressed with semantic locators, not values copied from a run.
 */
import type {
  ContractMetricId,
  DefinitionId,
  EvidenceRequest,
  KpiMetricId,
  SupportedContract,
} from "../../evidence/index.ts"

export const EVALUATION_DATASET_VERSION = "1.0.0"

export const EVALUATION_CATEGORIES = [
  "supported_paraphrase",
  "comparison_ranking",
  "unsupported_scope",
  "ambiguous_compound",
  "adversarial",
] as const

export type EvaluationCategory = (typeof EVALUATION_CATEGORIES)[number]

export const EXPECTED_CATEGORY_COUNTS: Readonly<
  Record<EvaluationCategory, number>
> = {
  supported_paraphrase: 12,
  comparison_ranking: 6,
  unsupported_scope: 6,
  ambiguous_compound: 6,
  adversarial: 6,
}

export const EXPECTED_TOTAL_CASES = 36

export type EvidenceLocator =
  | { readonly section: "kpis"; readonly field: KpiMetricId }
  | {
      readonly section: "by_contract"
      readonly category: SupportedContract
      readonly field: ContractMetricId
    }
  | { readonly section: "definition"; readonly id: DefinitionId }

export type EvaluationOrigin =
  "regression_probe" | "regression_smoke" | "new_evaluation_example"

export type EvaluationCase = {
  /** Stable identifier; unique across the dataset. */
  readonly id: string
  readonly category: EvaluationCategory
  readonly question: string
  readonly expectedDisposition: "answered" | "unsupported"
  /**
   * Exact acceptable interpreted requests. `compare_contracts` order may be
   * reversed by the model; that equivalence is handled by the scorer.
   */
  readonly acceptableRequests: readonly EvidenceRequest[]
  /** Semantic expectation for selected facts/definitions from trusted evidence. */
  readonly evidenceAssertions: readonly EvidenceLocator[]
  /** Brief capability-grounded rationale for the expectation. */
  readonly rationale: string
  readonly origin: EvaluationOrigin
}

export type ScoredClassification =
  | "correct"
  | "semantic_routing_failure"
  | "unsupported_scope_acceptance"
  | "incorrect_refusal"
  | "malformed_model_response"
  | "evidence_answer_mismatch"
  | "operational_error"
  | "unattempted"

export type EvaluationMode = "offline" | "live"
