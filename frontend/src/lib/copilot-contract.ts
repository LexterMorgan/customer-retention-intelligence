/**
 * Browser-safe contract for the local retention copilot.
 *
 * Mirrors the allowed surface of `server/copilot/types.ts` without importing any
 * runtime server module, so Vite can bundle only this file for the dashboard.
 * Runtime validation is strict about the nested fields the UI renders; unknown
 * top-level kinds and malformed shapes are rejected rather than repaired.
 */

export type CopilotUnit =
  | { readonly kind: "count" }
  | { readonly kind: "percentage" }
  | {
      readonly kind: "currency"
      readonly currency: "USD"
      readonly period: "month"
    }

export type CopilotFact = {
  readonly id: string
  readonly citation: { readonly id: string; readonly artifactSha256: string }
  readonly metric: { readonly id: string; readonly label: string }
  readonly value: number
  readonly unit: CopilotUnit
  readonly scope:
    | { readonly kind: "overall" }
    | { readonly kind: "contract"; readonly contract: string }
  readonly population: { readonly id: string; readonly definition: string }
  readonly locator: {
    readonly section: string
    readonly field?: string
    readonly key?: { readonly category?: string }
  }
}

export type CopilotDefinitionSource =
  | {
      readonly kind: "repository_document"
      readonly path: string
      readonly section: string
      readonly versioning: "separate_from_payload"
    }
  | {
      readonly kind: "payload_field"
      readonly section: string
      readonly field: string
      readonly versioning: "payload"
      readonly artifactSha256: string
    }

export type CopilotDefinition = {
  readonly id: string
  readonly title: string
  readonly text: string
  readonly source: CopilotDefinitionSource
  readonly caveats: readonly string[]
}

export type CopilotRequest =
  | { readonly operation: "get_kpi"; readonly metric: string }
  | { readonly operation: "get_contract_metrics"; readonly contract: string }
  | {
      readonly operation: "compare_contracts"
      readonly contracts: readonly [string, string]
    }
  | { readonly operation: "highest_churn_contract" }
  | { readonly operation: "get_definition"; readonly definition: string }

export type CopilotEvidence = {
  readonly snapshot: string
  readonly scope: {
    readonly kind: "full_snapshot"
    readonly description: string
  }
  readonly artifact: { readonly source: string; readonly sha256: string }
  readonly request: CopilotRequest
  readonly facts: readonly CopilotFact[]
  readonly definitions: readonly CopilotDefinition[]
  readonly caveats: readonly string[]
  readonly selection?: {
    readonly metric: string
    readonly contracts: readonly string[]
    readonly tie: boolean
  }
}

export type CopilotModel = {
  readonly provider: string
  readonly configuredRoute: string
  readonly status: number | null
  readonly gatewayReportedModel: string | null
  readonly usage: Readonly<Record<string, number>> | null
}

export type CopilotAnswered = {
  readonly kind: "answered"
  readonly question: string
  readonly answerText: string
  readonly request: CopilotRequest
  readonly evidence: CopilotEvidence
  readonly model: CopilotModel
  readonly elapsedMs: number
}

export type CopilotUnsupported = {
  readonly kind: "unsupported"
  readonly question: string
  readonly reason: "unsupported_scope"
  readonly message: string
  readonly model: CopilotModel
  readonly elapsedMs: number
}

export type CopilotError = {
  readonly kind: "error"
  readonly code: string
  readonly message: string
  readonly details?: Readonly<Record<string, unknown>>
}

export type CopilotResult = CopilotAnswered | CopilotUnsupported | CopilotError

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

function isUsage(
  value: unknown
): value is Readonly<Record<string, number>> | null {
  if (value === null) {
    return true
  }
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every(isFiniteNumber)
}

function parseUnit(value: unknown): CopilotUnit | null {
  if (!isRecord(value)) {
    return null
  }
  if (value["kind"] === "count" || value["kind"] === "percentage") {
    return { kind: value["kind"] }
  }
  if (
    value["kind"] === "currency" &&
    value["currency"] === "USD" &&
    value["period"] === "month"
  ) {
    return { kind: "currency", currency: "USD", period: "month" }
  }
  return null
}

function parseFact(value: unknown): CopilotFact | null {
  if (!isRecord(value)) {
    return null
  }
  const citation = value["citation"]
  const metric = value["metric"]
  const scope = value["scope"]
  const population = value["population"]
  const locator = value["locator"]
  const unit = parseUnit(value["unit"])
  if (
    !isString(value["id"]) ||
    !isRecord(citation) ||
    !isString(citation["id"]) ||
    !isString(citation["artifactSha256"]) ||
    !isRecord(metric) ||
    !isString(metric["id"]) ||
    !isString(metric["label"]) ||
    !isFiniteNumber(value["value"]) ||
    unit === null ||
    !isRecord(scope) ||
    !isRecord(population) ||
    !isString(population["definition"]) ||
    !isRecord(locator) ||
    !isString(locator["section"])
  ) {
    return null
  }
  const parsedScope: CopilotFact["scope"] =
    scope["kind"] === "overall"
      ? { kind: "overall" }
      : scope["kind"] === "contract" && isString(scope["contract"])
        ? { kind: "contract", contract: scope["contract"] }
        : (null as never)
  if (parsedScope === null) {
    return null
  }
  const key = locator["key"]
  const parsedKey =
    isRecord(key) && isString(key["category"])
      ? { category: key["category"] }
      : undefined
  if (key !== undefined && parsedKey === undefined) {
    return null
  }
  return {
    id: value["id"],
    citation: {
      id: citation["id"],
      artifactSha256: citation["artifactSha256"],
    },
    metric: { id: metric["id"], label: metric["label"] },
    value: value["value"],
    unit,
    scope: parsedScope,
    population: {
      id: isString(population["id"]) ? population["id"] : "unknown",
      definition: population["definition"],
    },
    locator: {
      section: locator["section"],
      ...(isString(locator["field"]) ? { field: locator["field"] } : {}),
      ...(parsedKey === undefined ? {} : { key: parsedKey }),
    },
  }
}

function parseDefinitionSource(value: unknown): CopilotDefinitionSource | null {
  if (!isRecord(value)) {
    return null
  }
  if (
    value["kind"] === "repository_document" &&
    isString(value["path"]) &&
    isString(value["section"]) &&
    value["versioning"] === "separate_from_payload"
  ) {
    return {
      kind: "repository_document",
      path: value["path"],
      section: value["section"],
      versioning: "separate_from_payload",
    }
  }
  if (
    value["kind"] === "payload_field" &&
    isString(value["section"]) &&
    isString(value["field"]) &&
    value["versioning"] === "payload" &&
    isString(value["artifactSha256"])
  ) {
    return {
      kind: "payload_field",
      section: value["section"],
      field: value["field"],
      versioning: "payload",
      artifactSha256: value["artifactSha256"],
    }
  }
  return null
}

function parseDefinition(value: unknown): CopilotDefinition | null {
  if (!isRecord(value)) {
    return null
  }
  const source = parseDefinitionSource(value["source"])
  if (
    !isString(value["id"]) ||
    !isString(value["title"]) ||
    !isString(value["text"]) ||
    source === null ||
    !isStringArray(value["caveats"])
  ) {
    return null
  }
  return {
    id: value["id"],
    title: value["title"],
    text: value["text"],
    source,
    caveats: value["caveats"],
  }
}

function parseRequest(value: unknown): CopilotRequest | null {
  if (!isRecord(value)) {
    return null
  }
  switch (value["operation"]) {
    case "get_kpi":
      return isString(value["metric"])
        ? { operation: "get_kpi", metric: value["metric"] }
        : null
    case "get_contract_metrics":
      return isString(value["contract"])
        ? { operation: "get_contract_metrics", contract: value["contract"] }
        : null
    case "compare_contracts": {
      const contracts = value["contracts"]
      return Array.isArray(contracts) &&
        contracts.length === 2 &&
        contracts.every(isString)
        ? {
            operation: "compare_contracts",
            contracts: [contracts[0], contracts[1]],
          }
        : null
    }
    case "highest_churn_contract":
      return { operation: "highest_churn_contract" }
    case "get_definition":
      return isString(value["definition"])
        ? { operation: "get_definition", definition: value["definition"] }
        : null
    default:
      return null
  }
}

function parseModel(value: unknown): CopilotModel | null {
  if (!isRecord(value)) {
    return null
  }
  const usage = value["usage"]
  if (!isUsage(usage)) {
    return null
  }
  const gatewayModel = value["gatewayReportedModel"]
  const status = value["status"]
  if (
    !isString(value["provider"]) ||
    !isString(value["configuredRoute"]) ||
    !(status === null || isFiniteNumber(status)) ||
    !(gatewayModel === null || isString(gatewayModel))
  ) {
    return null
  }
  return {
    provider: value["provider"],
    configuredRoute: value["configuredRoute"],
    status: status as number | null,
    gatewayReportedModel: gatewayModel as string | null,
    usage,
  }
}

function parseEvidence(value: unknown): CopilotEvidence | null {
  if (!isRecord(value)) {
    return null
  }
  const scope = value["scope"]
  const artifact = value["artifact"]
  const request = parseRequest(value["request"])
  const factsValue = value["facts"]
  const definitionsValue = value["definitions"]
  if (
    !isString(value["snapshot"]) ||
    !isRecord(scope) ||
    scope["kind"] !== "full_snapshot" ||
    !isString(scope["description"]) ||
    !isRecord(artifact) ||
    !isString(artifact["source"]) ||
    !isString(artifact["sha256"]) ||
    request === null ||
    !Array.isArray(factsValue) ||
    !Array.isArray(definitionsValue) ||
    !isStringArray(value["caveats"])
  ) {
    return null
  }
  const facts: CopilotFact[] = []
  for (const rawFact of factsValue) {
    const fact = parseFact(rawFact)
    if (fact === null) {
      return null
    }
    facts.push(fact)
  }
  const definitions: CopilotDefinition[] = []
  for (const rawDefinition of definitionsValue) {
    const definition = parseDefinition(rawDefinition)
    if (definition === null) {
      return null
    }
    definitions.push(definition)
  }
  const selection = value["selection"]
  const parsedSelection = isRecord(selection)
    ? {
        metric: isString(selection["metric"]) ? selection["metric"] : "",
        contracts: isStringArray(selection["contracts"])
          ? selection["contracts"]
          : [],
        tie: selection["tie"] === true,
      }
    : undefined
  return {
    snapshot: value["snapshot"],
    scope: { kind: "full_snapshot", description: scope["description"] },
    artifact: { source: artifact["source"], sha256: artifact["sha256"] },
    request,
    facts,
    definitions,
    caveats: value["caveats"],
    ...(parsedSelection === undefined ? {} : { selection: parsedSelection }),
  }
}

/** Parse an untrusted response body into the browser-facing result union. */
export function parseCopilotResult(value: unknown): CopilotResult | null {
  if (!isRecord(value)) {
    return null
  }
  const kind = value["kind"]
  if (kind === "answered") {
    const request = parseRequest(value["request"])
    const evidence = parseEvidence(value["evidence"])
    const model = parseModel(value["model"])
    if (
      !request ||
      !evidence ||
      !model ||
      !isString(value["question"]) ||
      !isString(value["answerText"]) ||
      !isFiniteNumber(value["elapsedMs"])
    ) {
      return null
    }
    return {
      kind: "answered",
      question: value["question"],
      answerText: value["answerText"],
      request,
      evidence,
      model,
      elapsedMs: value["elapsedMs"],
    }
  }
  if (kind === "unsupported") {
    const model = parseModel(value["model"])
    if (
      !model ||
      !isString(value["question"]) ||
      value["reason"] !== "unsupported_scope" ||
      !isString(value["message"]) ||
      !isFiniteNumber(value["elapsedMs"])
    ) {
      return null
    }
    return {
      kind: "unsupported",
      question: value["question"],
      reason: "unsupported_scope",
      message: value["message"],
      model,
      elapsedMs: value["elapsedMs"],
    }
  }
  if (kind === "error") {
    if (!isString(value["code"]) || !isString(value["message"])) {
      return null
    }
    const details = value["details"]
    return {
      kind: "error",
      code: value["code"],
      message: value["message"],
      ...(isRecord(details) ? { details } : {}),
    }
  }
  return null
}
