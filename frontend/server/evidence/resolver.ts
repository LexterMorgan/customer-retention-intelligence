/**
 * Pure evidence resolver: validated payload + typed request -> evidence envelope.
 *
 * No filesystem, network, model, or UI access happens here. Loading is a separate
 * concern (see payload.ts) so tests can supply fixtures without touching disk.
 * Values are read from the payload exactly as stored; this layer never recomputes,
 * re-derives, or rounds a metric.
 */
import {
  CAVEATS,
  DEFINITIONS,
  MRVL_CAVEAT,
  joinedDenominatorCaveat,
  shareOfChurnCaveat,
  totalIncludesJoinedCaveat,
} from "./definitions.ts"
import {
  describeValue,
  isFiniteNumber,
  isPlainObject,
  isSha256Hex,
  isSupportedContract,
  artifactError,
  requestError,
} from "./guards.ts"
import { parseEvidenceRequest } from "./requests.ts"
import {
  CONTRACT_METRIC_IDS,
  DEFAULT_ARTIFACT_SOURCE,
  KPI_METRIC_IDS,
  SUPPORTED_CONTRACTS,
  type ContractMetricId,
  type DefinitionEvidence,
  type DefinitionId,
  type EvidenceContractRow,
  type EvidenceEnvelope,
  type EvidenceError,
  type EvidenceFact,
  type EvidencePayload,
  type EvidenceRequest,
  type EvidenceResult,
  type FactPopulation,
  type FactUnit,
  type HighestChurnSelection,
  type KpiMetricId,
  type MrvlDefinitionState,
  type PopulationId,
  type SupportedContract,
} from "./types.ts"

const SCOPE_DESCRIPTION_SUFFIX =
  "snapshot (all customers in the cleaned dataset). Dashboard filter selections are highlight-only and are not accepted or applied as aggregate scope."

const POPULATIONS: Record<PopulationId, FactPopulation> = {
  all_customers: {
    id: "all_customers",
    definition:
      "All customers in the cleaned Q2 2022 snapshot, including Joined customers.",
  },
  existing_customers: {
    id: "existing_customers",
    definition:
      "Existing customers = Churned + Stayed; Joined customers are excluded from rate denominators.",
  },
  churned_customers: {
    id: "churned_customers",
    definition:
      "Customer Status = Churned within the existing-customer population.",
  },
  retained_customers: {
    id: "retained_customers",
    definition:
      "Customer Status = Stayed within the existing-customer population.",
  },
  joined_customers: {
    id: "joined_customers",
    definition:
      "Customers acquired during the snapshot quarter; excluded from churn and retention rate denominators.",
  },
  all_churn: {
    id: "all_churn",
    definition:
      "All existing churned customers in the snapshot; the portfolio denominator for share of churn.",
  },
}

type MetricMeta = {
  readonly label: string
  readonly unit: FactUnit
  readonly population: FactPopulation
}

const KPI_META: Record<KpiMetricId, MetricMeta> = {
  total_customers: {
    label: "Total Customers",
    unit: { kind: "count" },
    population: POPULATIONS.all_customers,
  },
  existing_customers: {
    label: "Existing Customers",
    unit: { kind: "count" },
    population: POPULATIONS.existing_customers,
  },
  churned_customers: {
    label: "Churned Customers",
    unit: { kind: "count" },
    population: POPULATIONS.churned_customers,
  },
  retained_customers: {
    label: "Retained Customers",
    unit: { kind: "count" },
    population: POPULATIONS.retained_customers,
  },
  joined_customers: {
    label: "Joined Customers",
    unit: { kind: "count" },
    population: POPULATIONS.joined_customers,
  },
  churn_rate_pct: {
    label: "Churn Rate",
    unit: { kind: "percentage" },
    population: POPULATIONS.existing_customers,
  },
  retention_rate_pct: {
    label: "Retention Rate",
    unit: { kind: "percentage" },
    population: POPULATIONS.existing_customers,
  },
  mrvl: {
    label: "Monthly Recurring Value Lost",
    unit: { kind: "currency", currency: "USD", period: "month" },
    population: POPULATIONS.churned_customers,
  },
}

const CONTRACT_META: Record<ContractMetricId, MetricMeta> = {
  existing_customers: {
    label: "Existing Customers",
    unit: { kind: "count" },
    population: POPULATIONS.existing_customers,
  },
  churned_customers: {
    label: "Churned Customers",
    unit: { kind: "count" },
    population: POPULATIONS.churned_customers,
  },
  retained_customers: {
    label: "Retained Customers",
    unit: { kind: "count" },
    population: POPULATIONS.retained_customers,
  },
  churn_rate_pct: {
    label: "Churn Rate",
    unit: { kind: "percentage" },
    population: POPULATIONS.existing_customers,
  },
  pct_of_total_churn: {
    label: "Share of All Churn",
    unit: { kind: "percentage" },
    population: POPULATIONS.all_churn,
  },
}

/** Definitions relevant to each KPI metric (empty for plain counts). */
const KPI_DEFINITIONS: Partial<Record<KpiMetricId, readonly DefinitionId[]>> = {
  existing_customers: ["existing_customers"],
  churn_rate_pct: ["churn_rate"],
  retention_rate_pct: ["retention_rate"],
  mrvl: ["mrvl"],
}

const CONTRACT_DEFINITIONS: readonly DefinitionId[] = [
  "churn_rate",
  "existing_customers",
]

export type EvidenceIdentity = {
  readonly artifactSha256: string
  readonly artifactSource: string
}

export type EvidenceResolver = (request: unknown) => EvidenceResult

export type CreateResolverResult =
  | { readonly ok: true; readonly resolve: EvidenceResolver }
  | { readonly ok: false; readonly error: EvidenceError }

export type ValidatePayloadResult =
  | { readonly ok: true; readonly payload: EvidencePayload }
  | { readonly ok: false; readonly error: EvidenceError }

function invalidPayload(
  message: string,
  details?: Readonly<Record<string, unknown>>
): ValidatePayloadResult {
  return {
    ok: false,
    error: artifactError("invalid_evidence", message, details),
  }
}

function unavailableEvidence(
  message: string,
  details?: Readonly<Record<string, unknown>>
): EvidenceResult {
  return {
    ok: false,
    error: artifactError("unavailable_evidence", message, details),
  }
}

/**
 * Read the payload-cited MRVL definition text without substituting any local
 * copy. Absence and malformed content are distinct states so the resolver can
 * return different structured errors later.
 */
function readMrvlDefinitionState(
  raw: Record<string, unknown>
): MrvlDefinitionState {
  if (!Object.prototype.hasOwnProperty.call(raw, "mrvl")) {
    return { kind: "missing" }
  }
  const mrvl = raw["mrvl"]
  if (!isPlainObject(mrvl)) {
    return { kind: "malformed" }
  }
  if (!Object.prototype.hasOwnProperty.call(mrvl, "definition")) {
    return { kind: "missing" }
  }
  const value = mrvl["definition"]
  if (typeof value !== "string" || value.trim() === "") {
    return { kind: "malformed" }
  }
  return { kind: "present", text: value }
}

/**
 * Validate the aggregate payload structurally: snapshot label, all supported KPI
 * values finite, and contract rows with known categories, finite metrics, and no
 * duplicate category keys. Extra payload sections are ignored; nothing is
 * recomputed or cross-checked against unrelated values.
 */
export function validateEvidencePayload(raw: unknown): ValidatePayloadResult {
  if (!isPlainObject(raw)) {
    return invalidPayload("The dashboard payload must be a JSON object.")
  }

  const metadata = raw["metadata"]
  if (!isPlainObject(metadata)) {
    return invalidPayload("The dashboard payload is missing 'metadata'.")
  }
  const snapshot = metadata["snapshot"]
  if (typeof snapshot !== "string" || snapshot.trim() === "") {
    return invalidPayload(
      "The dashboard payload is missing a non-empty 'metadata.snapshot' label."
    )
  }

  const kpisRaw = raw["kpis"]
  if (!isPlainObject(kpisRaw)) {
    return invalidPayload("The dashboard payload is missing 'kpis'.")
  }
  for (const metric of KPI_METRIC_IDS) {
    if (!isFiniteNumber(kpisRaw[metric])) {
      return invalidPayload(
        `The dashboard payload has a missing or non-finite 'kpis.${metric}' value.`,
        { field: `kpis.${metric}`, received: describeValue(kpisRaw[metric]) }
      )
    }
  }
  const kpis = Object.fromEntries(
    KPI_METRIC_IDS.map((metric) => [metric, kpisRaw[metric] as number])
  ) as Record<KpiMetricId, number>

  const rowsRaw = raw["by_contract"]
  if (!Array.isArray(rowsRaw)) {
    return invalidPayload(
      "The dashboard payload is missing 'by_contract' rows."
    )
  }
  const seen = new Set<SupportedContract>()
  const byContract: EvidenceContractRow[] = []
  for (const [index, rowRaw] of rowsRaw.entries()) {
    if (!isPlainObject(rowRaw)) {
      return invalidPayload(
        `The dashboard payload has a malformed 'by_contract[${index}]' row.`
      )
    }
    const category = rowRaw["category"]
    if (typeof category !== "string" || !isSupportedContract(category)) {
      return invalidPayload(
        `The dashboard payload has an unsupported 'by_contract[${index}].category'.`,
        { category: describeValue(category) }
      )
    }
    if (seen.has(category)) {
      return invalidPayload(
        `The dashboard payload has a duplicate contract category: ${category}.`,
        { category }
      )
    }
    seen.add(category)
    const values = {} as Record<ContractMetricId, number>
    for (const metric of CONTRACT_METRIC_IDS) {
      const value = rowRaw[metric]
      if (!isFiniteNumber(value)) {
        return invalidPayload(
          `The dashboard payload has a missing or non-finite 'by_contract[${index}].${metric}' value.`,
          { category, field: metric, received: describeValue(value) }
        )
      }
      values[metric] = value
    }
    byContract.push({ category, ...values })
  }

  return {
    ok: true,
    payload: {
      metadata: { snapshot },
      kpis,
      byContract,
      mrvlDefinition: readMrvlDefinitionState(raw),
    },
  }
}

function kpiFact(
  payload: EvidencePayload,
  metric: KpiMetricId,
  artifactSha256: string
): EvidenceFact {
  const meta = KPI_META[metric]
  return {
    id: `kpi:${metric}`,
    citation: { id: `payload:kpis.${metric}`, artifactSha256 },
    metric: { id: metric, label: meta.label },
    value: payload.kpis[metric],
    unit: meta.unit,
    scope: { kind: "overall" },
    population: meta.population,
    locator: { section: "kpis", field: metric },
  }
}

function contractFact(
  row: EvidenceContractRow,
  metric: ContractMetricId,
  artifactSha256: string
): EvidenceFact {
  const meta = CONTRACT_META[metric]
  return {
    id: `contract:${row.category}:${metric}`,
    citation: {
      id: `payload:by_contract[category="${row.category}"].${metric}`,
      artifactSha256,
    },
    metric: { id: metric, label: meta.label },
    value: row[metric],
    unit: meta.unit,
    scope: { kind: "contract", contract: row.category },
    population: meta.population,
    locator: {
      section: "by_contract",
      key: { category: row.category },
      field: metric,
    },
  }
}

type DefinitionBuildResult =
  | { readonly ok: true; readonly definition: DefinitionEvidence }
  | { readonly ok: false; readonly error: EvidenceError }

function buildDefinition(
  id: DefinitionId,
  payload: EvidencePayload,
  artifactSha256: string
): DefinitionBuildResult {
  const template = DEFINITIONS[id]
  if (template.source.kind === "payload_field") {
    const state = payload.mrvlDefinition
    if (state.kind === "missing") {
      return {
        ok: false,
        error: artifactError(
          "unavailable_evidence",
          "The dashboard payload does not provide 'mrvl.definition'; MRVL definition evidence is unavailable.",
          { field: "mrvl.definition" }
        ),
      }
    }
    if (state.kind === "malformed") {
      return {
        ok: false,
        error: artifactError(
          "invalid_evidence",
          "The dashboard payload 'mrvl.definition' must be a non-empty string.",
          { field: "mrvl.definition" }
        ),
      }
    }
    return {
      ok: true,
      definition: {
        id: template.id,
        title: template.title,
        // Cited text is exactly the payload field value.
        text: state.text,
        source: { ...template.source, artifactSha256 },
        caveats: [...template.caveats],
      },
    }
  }
  if (template.text === null) {
    return {
      ok: false,
      error: artifactError(
        "invalid_evidence",
        "Definition template has neither payload-cited text nor a repository document source.",
        { definition: id }
      ),
    }
  }
  return {
    ok: true,
    definition: {
      id: template.id,
      title: template.title,
      text: template.text,
      source: { ...template.source },
      caveats: [...template.caveats],
    },
  }
}

type DefinitionsBuildResult =
  | { readonly ok: true; readonly definitions: DefinitionEvidence[] }
  | { readonly ok: false; readonly error: EvidenceError }

function buildDefinitions(
  ids: readonly DefinitionId[],
  payload: EvidencePayload,
  artifactSha256: string
): DefinitionsBuildResult {
  const seen = new Set<DefinitionId>()
  const definitions: DefinitionEvidence[] = []
  for (const id of ids) {
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    const built = buildDefinition(id, payload, artifactSha256)
    if (!built.ok) {
      return built
    }
    definitions.push(built.definition)
  }
  return { ok: true, definitions }
}

function buildCaveats(
  payload: EvidencePayload,
  facts: readonly EvidenceFact[],
  definitions: readonly DefinitionEvidence[]
): string[] {
  const caveats: string[] = [
    CAVEATS.snapshot,
    CAVEATS.scope,
    CAVEATS.association,
    CAVEATS.unsupported,
  ]
  const metricIds = new Set<string>(facts.map((fact) => fact.metric.id))
  const populationIds = new Set<PopulationId>(
    facts.map((fact) => fact.population.id)
  )
  const definitionIds = new Set<DefinitionId>(
    definitions.map((definition) => definition.id)
  )

  const usesExistingPopulation =
    populationIds.has("existing_customers") ||
    populationIds.has("churned_customers") ||
    populationIds.has("retained_customers")
  if (usesExistingPopulation) {
    caveats.push(joinedDenominatorCaveat(payload.kpis.joined_customers))
  }
  if (metricIds.has("total_customers")) {
    caveats.push(totalIncludesJoinedCaveat(payload.kpis.joined_customers))
  }
  if (metricIds.has("mrvl") || definitionIds.has("mrvl")) {
    caveats.push(MRVL_CAVEAT)
  }
  if (metricIds.has("pct_of_total_churn")) {
    caveats.push(shareOfChurnCaveat(payload.kpis.churned_customers))
  }
  return caveats
}

function buildEnvelope(args: {
  payload: EvidencePayload
  identity: EvidenceIdentity
  request: EvidenceRequest
  facts: readonly EvidenceFact[]
  definitions: readonly DefinitionEvidence[]
  selection?: HighestChurnSelection
}): EvidenceEnvelope {
  const envelope: EvidenceEnvelope = {
    snapshot: args.payload.metadata.snapshot,
    scope: {
      kind: "full_snapshot",
      description: `Full ${args.payload.metadata.snapshot} ${SCOPE_DESCRIPTION_SUFFIX}`,
    },
    artifact: {
      source: args.identity.artifactSource,
      sha256: args.identity.artifactSha256,
    },
    request: args.request,
    facts: args.facts,
    definitions: args.definitions,
    caveats: buildCaveats(args.payload, args.facts, args.definitions),
  }
  return args.selection ? { ...envelope, selection: args.selection } : envelope
}

function findContractRow(
  payload: EvidencePayload,
  contract: SupportedContract
): EvidenceContractRow | undefined {
  return payload.byContract.find((row) => row.category === contract)
}

function resolveValidated(
  payload: EvidencePayload,
  identity: EvidenceIdentity,
  requestInput: unknown
): EvidenceResult {
  const parsed = parseEvidenceRequest(requestInput)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error }
  }
  const request = parsed.request
  const sha = identity.artifactSha256

  switch (request.operation) {
    case "get_kpi": {
      const fact = kpiFact(payload, request.metric, sha)
      const definitions = buildDefinitions(
        KPI_DEFINITIONS[request.metric] ?? [],
        payload,
        sha
      )
      if (!definitions.ok) {
        return definitions
      }
      return {
        ok: true,
        envelope: buildEnvelope({
          payload,
          identity,
          request,
          facts: [fact],
          definitions: definitions.definitions,
        }),
      }
    }

    case "get_contract_metrics": {
      const row = findContractRow(payload, request.contract)
      if (!row) {
        return unavailableEvidence(
          `Contract ${describeValue(request.contract)} is not present in the dashboard payload.`,
          { contract: request.contract }
        )
      }
      const facts = CONTRACT_METRIC_IDS.map((metric) =>
        contractFact(row, metric, sha)
      )
      const definitions = buildDefinitions(CONTRACT_DEFINITIONS, payload, sha)
      if (!definitions.ok) {
        return definitions
      }
      return {
        ok: true,
        envelope: buildEnvelope({
          payload,
          identity,
          request,
          facts,
          definitions: definitions.definitions,
        }),
      }
    }

    case "compare_contracts": {
      const [first, second] = request.contracts
      const firstRow = findContractRow(payload, first)
      if (!firstRow) {
        return unavailableEvidence(
          `Contract ${describeValue(first)} is not present in the dashboard payload.`,
          { contract: first }
        )
      }
      const secondRow = findContractRow(payload, second)
      if (!secondRow) {
        return unavailableEvidence(
          `Contract ${describeValue(second)} is not present in the dashboard payload.`,
          { contract: second }
        )
      }
      const facts = [firstRow, secondRow].flatMap((row) =>
        CONTRACT_METRIC_IDS.map((metric) => contractFact(row, metric, sha))
      )
      const definitions = buildDefinitions(CONTRACT_DEFINITIONS, payload, sha)
      if (!definitions.ok) {
        return definitions
      }
      return {
        ok: true,
        envelope: buildEnvelope({
          payload,
          identity,
          request,
          facts,
          definitions: definitions.definitions,
        }),
      }
    }

    case "highest_churn_contract": {
      // The selection is only meaningful with complete contract evidence; a
      // partial payload must not crown a survivor by omission.
      const present = new Set<SupportedContract>(
        payload.byContract.map((row) => row.category)
      )
      const missing = SUPPORTED_CONTRACTS.filter(
        (contract) => !present.has(contract)
      )
      if (missing.length > 0) {
        return unavailableEvidence(
          `Highest-churn selection requires all supported contract categories; missing: ${missing.join(", ")}.`,
          { missing }
        )
      }
      const highestRate = Math.max(
        ...payload.byContract.map((row) => row.churn_rate_pct)
      )
      const tied = SUPPORTED_CONTRACTS.filter((contract) =>
        payload.byContract.some(
          (row) =>
            row.category === contract && row.churn_rate_pct === highestRate
        )
      )
      const facts = tied.map((contract) =>
        contractFact(
          payload.byContract.find(
            (row) => row.category === contract
          ) as EvidenceContractRow,
          "churn_rate_pct",
          sha
        )
      )
      const selection: HighestChurnSelection = {
        metric: "churn_rate_pct",
        contracts: tied,
        tie: tied.length > 1,
      }
      const definitions = buildDefinitions(["churn_rate"], payload, sha)
      if (!definitions.ok) {
        return definitions
      }
      return {
        ok: true,
        envelope: buildEnvelope({
          payload,
          identity,
          request,
          facts,
          definitions: definitions.definitions,
          selection,
        }),
      }
    }

    case "get_definition": {
      const definitions = buildDefinitions([request.definition], payload, sha)
      if (!definitions.ok) {
        return definitions
      }
      return {
        ok: true,
        envelope: buildEnvelope({
          payload,
          identity,
          request,
          facts: [],
          definitions: definitions.definitions,
        }),
      }
    }

    default: {
      // Unreachable for the validated union; kept so an unexpected operation can
      // never fall through to an unrelated metric.
      return {
        ok: false,
        error: requestError(
          "unsupported_operation",
          "Unsupported evidence operation."
        ),
      }
    }
  }
}

/**
 * Build a resolver from an already-parsed payload and its artifact identity.
 * Tests use this directly with fixtures; production callers use loadEvidence().
 */
export function createEvidenceResolver(input: {
  readonly payload: unknown
  readonly artifactSha256: string
  readonly artifactSource?: string
}): CreateResolverResult {
  if (!isSha256Hex(input.artifactSha256)) {
    return {
      ok: false,
      error: artifactError(
        "invalid_evidence",
        "artifactSha256 must be a 64-character lowercase hexadecimal SHA-256 digest."
      ),
    }
  }
  const artifactSource = input.artifactSource ?? DEFAULT_ARTIFACT_SOURCE
  if (typeof artifactSource !== "string" || artifactSource.trim() === "") {
    return {
      ok: false,
      error: artifactError(
        "invalid_evidence",
        "artifactSource must be a non-empty string."
      ),
    }
  }
  const validated = validateEvidencePayload(input.payload)
  if (!validated.ok) {
    return validated
  }
  const identity: EvidenceIdentity = {
    artifactSha256: input.artifactSha256,
    artifactSource,
  }
  return {
    ok: true,
    resolve: (request: unknown) =>
      resolveValidated(validated.payload, identity, request),
  }
}
