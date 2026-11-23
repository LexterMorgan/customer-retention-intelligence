/**
 * Runtime validation for the supported request union.
 *
 * Validation is strict by construction: exact key allowlists per operation, no
 * coercion, no defaults, no passthrough of unknown properties. Malformed input
 * is never repaired into a valid request, and no field can name a file, a
 * filter, an arbitrary section, or an arbitrary metric path.
 */
import {
  describeValue,
  isPlainObject,
  isSupportedContract,
  requestError,
  unexpectedKeys,
} from "./guards.ts"
import {
  DEFINITION_IDS,
  KPI_METRIC_IDS,
  SUPPORTED_CONTRACTS,
  type DefinitionId,
  type EvidenceError,
  type EvidenceRequest,
  type KpiMetricId,
  type SupportedContract,
} from "./types.ts"

const OPERATION_FIELDS = {
  get_kpi: ["operation", "metric"],
  get_contract_metrics: ["operation", "contract"],
  compare_contracts: ["operation", "contracts"],
  highest_churn_contract: ["operation"],
  get_definition: ["operation", "definition"],
} as const

type Operation = keyof typeof OPERATION_FIELDS

export type ParseRequestResult =
  | { readonly ok: true; readonly request: EvidenceRequest }
  | { readonly ok: false; readonly error: EvidenceError }

function isOperation(value: string): value is Operation {
  return Object.prototype.hasOwnProperty.call(OPERATION_FIELDS, value)
}

function isKpiMetricId(value: string): value is KpiMetricId {
  return (KPI_METRIC_IDS as readonly string[]).includes(value)
}

function isDefinitionId(value: string): value is DefinitionId {
  return (DEFINITION_IDS as readonly string[]).includes(value)
}

function invalidRequest(
  message: string,
  details?: Readonly<Record<string, unknown>>
): ParseRequestResult {
  return { ok: false, error: requestError("invalid_request", message, details) }
}

function unsupportedContract(value: string, field: string): ParseRequestResult {
  return {
    ok: false,
    error: requestError(
      "unsupported_contract",
      `Unsupported contract in '${field}': ${describeValue(value)}.`,
      { field, supported: SUPPORTED_CONTRACTS }
    ),
  }
}

/**
 * Parse untrusted input into a normalized request. Accepts `unknown` so callers
 * cannot bypass validation by pre-typing their input.
 */
export function parseEvidenceRequest(input: unknown): ParseRequestResult {
  if (!isPlainObject(input)) {
    return invalidRequest("Request must be a plain object.", {
      received: describeValue(input),
    })
  }

  const operationValue = input["operation"]
  if (typeof operationValue !== "string") {
    return invalidRequest("Request must include a string 'operation' field.", {
      received: describeValue(operationValue),
    })
  }
  if (!isOperation(operationValue)) {
    return {
      ok: false,
      error: requestError(
        "unsupported_operation",
        `Unsupported operation: ${describeValue(operationValue)}.`,
        { supported: Object.keys(OPERATION_FIELDS).sort() }
      ),
    }
  }

  const operation = operationValue
  const allowed = new Set<string>(["operation", ...OPERATION_FIELDS[operation]])
  const extra = unexpectedKeys(input, allowed)
  if (extra.length > 0) {
    return invalidRequest(
      `Request for '${operation}' contains unsupported properties: ${extra.join(", ")}.`,
      { unexpected: extra }
    )
  }

  switch (operation) {
    case "highest_churn_contract": {
      return { ok: true, request: { operation } }
    }

    case "get_kpi": {
      const metric = input["metric"]
      if (typeof metric !== "string") {
        return invalidRequest("'metric' must be a string.", {
          received: describeValue(metric),
        })
      }
      if (!isKpiMetricId(metric)) {
        return {
          ok: false,
          error: requestError(
            "unsupported_metric",
            `Unsupported KPI metric: ${describeValue(metric)}.`,
            { supported: KPI_METRIC_IDS }
          ),
        }
      }
      return { ok: true, request: { operation, metric } }
    }

    case "get_contract_metrics": {
      const contract = input["contract"]
      if (typeof contract !== "string") {
        return invalidRequest("'contract' must be a string.", {
          received: describeValue(contract),
        })
      }
      if (!isSupportedContract(contract)) {
        return unsupportedContract(contract, "contract")
      }
      return { ok: true, request: { operation, contract } }
    }

    case "compare_contracts": {
      const contracts = input["contracts"]
      if (!Array.isArray(contracts)) {
        return invalidRequest(
          "'contracts' must be an array of two contracts.",
          {
            received: describeValue(contracts),
          }
        )
      }
      if (contracts.length !== 2) {
        return invalidRequest(
          "'contracts' must contain exactly two contracts.",
          { receivedLength: contracts.length }
        )
      }
      for (const [index, value] of contracts.entries()) {
        if (typeof value !== "string") {
          return invalidRequest(`'contracts[${index}]' must be a string.`, {
            received: describeValue(value),
          })
        }
        if (!isSupportedContract(value)) {
          return unsupportedContract(value, `contracts[${index}]`)
        }
      }
      const [first, second] = contracts as [
        SupportedContract,
        SupportedContract,
      ]
      if (first === second) {
        return {
          ok: false,
          error: requestError(
            "identical_contracts",
            "Comparison requires two distinct contract types.",
            { contracts: [first, second] }
          ),
        }
      }
      return { ok: true, request: { operation, contracts: [first, second] } }
    }

    case "get_definition": {
      const definition = input["definition"]
      if (typeof definition !== "string") {
        return invalidRequest("'definition' must be a string.", {
          received: describeValue(definition),
        })
      }
      if (!isDefinitionId(definition)) {
        return {
          ok: false,
          error: requestError(
            "unsupported_definition",
            `Unsupported definition: ${describeValue(definition)}.`,
            { supported: DEFINITION_IDS }
          ),
        }
      }
      return { ok: true, request: { operation, definition } }
    }
  }
}
