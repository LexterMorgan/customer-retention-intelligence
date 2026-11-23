import { useId } from "react"

import { SectionCard } from "@/components/dashboard/section-card"
import {
  dashboardTableCellClass,
  dashboardTableHeadClass,
  dashboardTableWrapClass,
} from "@/components/dashboard/table-styles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useCopilot } from "@/hooks/use-copilot"
import type {
  CopilotAnswered,
  CopilotModel,
  CopilotUnsupported,
} from "@/lib/copilot-contract"
import { MAX_COPILOT_QUESTION_LENGTH } from "@/lib/copilot-controller"
import {
  artifactHashFull,
  artifactHashShort,
  describeOperation,
  describeScope,
  evidenceRows,
  isAnswered,
  isError,
  isUnsupported,
} from "@/lib/copilot-view"

const SCOPE_NOTICE =
  "Q2 2022 snapshot · Full-dataset answers · Dashboard selections highlight charts; they do not filter copilot answers."

const EXAMPLE_PROMPTS = [
  "What is the overall churn rate?",
  "Compare One Year and Two Year contracts.",
  "What does MRVL mean?",
] as const

function ModelMetadataDetails({
  model,
  elapsedMs,
}: {
  readonly model: CopilotModel
  readonly elapsedMs: number
}) {
  const usageEntries = model.usage === null ? [] : Object.entries(model.usage)

  return (
    <details className="rounded-lg border border-dashed border-border/70 px-3 py-2">
      <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
        Model call metadata — not analytical evidence
      </summary>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-[11px] leading-snug text-muted-foreground sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="dashboard-label">Provider</dt>
          <dd className="break-words">{model.provider}</dd>
        </div>
        <div className="min-w-0">
          <dt className="dashboard-label">Configured route</dt>
          <dd className="break-words">{model.configuredRoute}</dd>
        </div>
        <div className="min-w-0">
          <dt className="dashboard-label">Gateway-reported model</dt>
          <dd className="break-words">
            {model.gatewayReportedModel ?? "Not reported"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="dashboard-label">HTTP status</dt>
          <dd>{model.status ?? "Not reported"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="dashboard-label">Client-observed elapsed</dt>
          <dd>{elapsedMs} ms</dd>
        </div>
        {usageEntries.length > 0 ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="dashboard-label">Reported usage</dt>
            <dd className="flex flex-wrap gap-x-3 gap-y-0.5">
              {usageEntries.map(([key, value]) => (
                <span key={key} className="font-mono">
                  {key}: {value}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  )
}

function AnsweredResult({ result }: { readonly result: CopilotAnswered }) {
  const rows = evidenceRows(result.evidence)
  const artifactSha256 = result.evidence.artifact.sha256
  const evidenceSummary =
    rows.definitions.length > 0
      ? `Evidence — ${rows.definitions.length} definition${rows.definitions.length === 1 ? "" : "s"}`
      : `Evidence — ${rows.facts.length} fact${rows.facts.length === 1 ? "" : "s"}`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="dashboard-label">Submitted question</span>
        <p className="text-sm leading-relaxed text-foreground">
          {result.question}
        </p>
      </div>

      <div className="dashboard-panel px-3.5 py-3">
        <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
          {result.answerText}
        </p>
      </div>

      <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="dashboard-label">Operation</dt>
          <dd className="text-foreground">
            {describeOperation(result.request)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="dashboard-label">Scope</dt>
          <dd className="text-pretty text-foreground">
            {describeScope(result.evidence.scope)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="dashboard-label">Snapshot</dt>
          <dd className="text-foreground">{result.evidence.snapshot}</dd>
        </div>
        <div className="min-w-0">
          <dt className="dashboard-label">Elapsed</dt>
          <dd className="tabular-nums">{result.elapsedMs} ms</dd>
        </div>
      </dl>

      {result.evidence.caveats.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="dashboard-label">Caveats</span>
          <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-pretty text-muted-foreground">
            {result.evidence.caveats.map((caveat, index) => (
              <li key={`${index}-${caveat}`}>{caveat}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="rounded-lg border border-border/70 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-foreground">
          {evidenceSummary}
        </summary>

        <div className="mt-2 flex flex-col gap-3">
          {rows.facts.length > 0 ? (
            <div className={dashboardTableWrapClass()}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={dashboardTableHeadClass}>
                      Metric
                    </TableHead>
                    <TableHead className={dashboardTableHeadClass}>
                      Contract / scope
                    </TableHead>
                    <TableHead
                      className={`${dashboardTableHeadClass} text-right`}
                    >
                      Value
                    </TableHead>
                    <TableHead className={dashboardTableHeadClass}>
                      Unit
                    </TableHead>
                    <TableHead className={dashboardTableHeadClass}>
                      Citation
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.facts.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/40">
                      <TableCell className={dashboardTableCellClass}>
                        {row.metric}
                      </TableCell>
                      <TableCell className={dashboardTableCellClass}>
                        {row.scope}
                      </TableCell>
                      <TableCell
                        className={`${dashboardTableCellClass} text-right font-medium tabular-nums`}
                      >
                        {row.value}
                      </TableCell>
                      <TableCell className={dashboardTableCellClass}>
                        {row.unit}
                      </TableCell>
                      <TableCell
                        className={`${dashboardTableCellClass} font-mono text-[11px] break-all`}
                      >
                        {row.citationId}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {rows.definitions.length > 0 ? (
            <div className="flex flex-col gap-2">
              {rows.definitions.map((definition) => (
                <div
                  key={definition.id}
                  className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                >
                  <p className="text-xs font-medium text-foreground">
                    {definition.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-pretty text-muted-foreground">
                    {definition.text}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed break-words text-muted-foreground">
                    Source: {definition.source}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-1 border-t border-border/70 pt-2 text-[11px] leading-relaxed text-muted-foreground">
            <p className="break-words">
              Artifact:{" "}
              <code className="break-all">
                {result.evidence.artifact.source}
              </code>
            </p>
            <p>
              SHA-256:{" "}
              <span
                className="font-mono"
                title={artifactHashFull(artifactSha256)}
              >
                {artifactHashShort(artifactSha256)}…
              </span>
            </p>
            <details>
              <summary className="cursor-pointer">Full artifact hash</summary>
              <code className="mt-1 block font-mono break-all">
                {artifactHashFull(artifactSha256)}
              </code>
            </details>
          </div>
        </div>
      </details>

      <ModelMetadataDetails model={result.model} elapsedMs={result.elapsedMs} />
    </div>
  )
}

function UnsupportedResult({
  result,
}: {
  readonly result: CopilotUnsupported
}) {
  return (
    <div className="dashboard-panel flex flex-col gap-2 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Outside supported scope</Badge>
      </div>
      <p className="text-sm leading-relaxed text-foreground">
        {result.message}
      </p>
      <p className="dashboard-footnote">
        Try an overall KPI, contract-type metrics, a contract comparison, or one
        of the supported definitions.
      </p>
    </div>
  )
}

function ErrorResult({
  message,
  code,
  onRetry,
}: {
  readonly message: string
  readonly code?: string
  readonly onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="dashboard-panel flex flex-col gap-2 border-destructive/40 px-3.5 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">Error</Badge>
        {code ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {code}
          </span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-destructive">{message}</p>
      <div>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  )
}

export function CopilotPanel() {
  const { state, setQuestion, submit, retry, applyExample } = useCopilot()
  const inputId = useId()
  const noticeId = useId()
  const isLoading = state.status === "loading"
  const canSubmit = !isLoading && state.question.trim().length > 0

  return (
    <SectionCard
      id="copilot"
      title="Ask the retention analyst"
      description="Ask about overall KPIs, contract-type metrics, contract comparisons, or canonical definitions."
      actions={<Badge variant="outline">Evidence-backed</Badge>}
      footnote="Supported scope is fixed: no arbitrary filters, time trends, forecasts, or customer-level data."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="dashboard-label">
            Question
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={inputId}
              type="text"
              className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={state.question}
              onChange={(event) => {
                setQuestion(event.target.value)
              }}
              maxLength={MAX_COPILOT_QUESTION_LENGTH}
              autoComplete="off"
              aria-describedby={noticeId}
              placeholder="What is the churn rate for One Year contracts?"
            />
            <Button
              type="submit"
              size="sm"
              className="shrink-0 sm:self-start"
              disabled={!canSubmit}
            >
              {isLoading ? "Asking…" : "Ask"}
            </Button>
          </div>
          <p id={noticeId} className="dashboard-footnote">
            {SCOPE_NOTICE}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="dashboard-label">Examples</span>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto max-w-full justify-start py-1.5 text-left text-[11px] leading-snug whitespace-normal"
                onClick={() => {
                  applyExample(prompt)
                }}
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>
      </form>

      {isLoading ? (
        <p
          role="status"
          aria-live="polite"
          className="dashboard-panel px-3.5 py-3 text-xs text-muted-foreground"
        >
          Asking the retention analyst…
        </p>
      ) : null}

      {state.status === "answered" && isAnswered(state.result) ? (
        <AnsweredResult result={state.result} />
      ) : null}

      {state.status === "unsupported" && isUnsupported(state.result) ? (
        <UnsupportedResult result={state.result} />
      ) : null}

      {state.status === "error" ? (
        <ErrorResult
          message={
            state.errorMessage ?? "The retention analyst request failed."
          }
          code={isError(state.result) ? state.result.code : undefined}
          onRetry={() => {
            void retry()
          }}
        />
      ) : null}
    </SectionCard>
  )
}
