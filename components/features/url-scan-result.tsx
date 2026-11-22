"use client";

import { ChevronDown, Download, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { formatPercent } from "@/lib/features/catalog";
import {
  downloadScanSummaryReport,
  serializeScanSummaryReport,
} from "@/lib/features/report-download";
import type {
  AdvisoryVerdict,
  ScanOutcome,
  UrlItemOutcome,
  UrlScanDetails,
} from "@/lib/features/types";
import { CopyButton } from "./copy-button";

interface UrlScanResultProps {
  outcome: ScanOutcome;
  onReset: () => void;
}

type BinaryVerdict = "benign" | "malicious";

const VERDICT_META: Record<
  BinaryVerdict,
  { shapeClass: string; textClass: string; label: string }
> = {
  benign: {
    shapeClass:
      "size-2 shrink-0 rounded-full border border-transparent bg-positive forced-colors:border-[CanvasText]",
    textClass: "text-positive",
    label: "Benign",
  },
  malicious: {
    shapeClass:
      "size-2 shrink-0 rounded-[2px] border border-transparent bg-danger forced-colors:border-[CanvasText]",
    textClass: "text-danger",
    label: "Malicious",
  },
};

function toBinaryVerdict(verdict: AdvisoryVerdict): BinaryVerdict {
  return verdict === "malicious" ? "malicious" : "benign";
}

const BRANCH_LABELS: Record<string, string> = {
  byte: "Byte Transformer",
  subword: "Subword RoBERTa",
  catboost_d6: "CatBoost (d6)",
  catboost_d8: "CatBoost (d8)",
  tfidf: "Char TF-IDF",
};

function UrlItemTechnicalBreakdown({ item }: { item: UrlItemOutcome }) {
  const branchEntries = item.branches
    ? Object.entries(item.branches.branchProbabilities)
    : [];
  const lexicalEntries = item.lexicalFeatures
    ? Object.entries(item.lexicalFeatures)
    : [];

  return (
    <div className="space-y-3.5 text-xs">
      {item.parsedUrl && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-medium text-muted-foreground">Parsed URL</h4>
            <span className="font-mono text-muted-foreground">
              {item.parsedUrl.status} · {item.parsedUrl.inputForm}
              {item.parsedUrl.isIp ? " · IP" : ""}
              {item.parsedUrl.isIdna ? " · IDNA" : ""}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono sm:grid-cols-3">
            <div>
              <dt className="font-sans text-muted-foreground">Scheme</dt>
              <dd className="mt-0.5 text-foreground">
                {item.parsedUrl.scheme || "(bare host)"}
              </dd>
            </div>
            <div>
              <dt className="font-sans text-muted-foreground">Host</dt>
              <dd className="mt-0.5 break-all text-foreground">
                {item.parsedUrl.host || "—"}
              </dd>
            </div>
            <div>
              <dt className="font-sans text-muted-foreground">Public suffix</dt>
              <dd className="mt-0.5 text-foreground">
                {item.parsedUrl.suffix || "—"}
              </dd>
            </div>
            {item.parsedUrl.modelHost &&
              item.parsedUrl.modelHost !== item.parsedUrl.host && (
                <div>
                  <dt className="font-sans text-muted-foreground">
                    Model host
                  </dt>
                  <dd className="mt-0.5 break-all text-foreground">
                    {item.parsedUrl.modelHost}
                  </dd>
                </div>
              )}
            {item.parsedUrl.port !== null && (
              <div>
                <dt className="font-sans text-muted-foreground">Port</dt>
                <dd className="mt-0.5 tabular-nums text-foreground">
                  {item.parsedUrl.port}
                </dd>
              </div>
            )}
            {item.parsedUrl.path && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="font-sans text-muted-foreground">Path</dt>
                <dd className="mt-0.5 break-all text-foreground">
                  {item.parsedUrl.path}
                </dd>
              </div>
            )}
            {item.parsedUrl.query && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="font-sans text-muted-foreground">Query</dt>
                <dd className="mt-0.5 break-all text-foreground">
                  {item.parsedUrl.query}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {branchEntries.length > 0 && item.branches && (
        <div className="space-y-2 border-t border-outline/60 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-medium text-muted-foreground">
              5-branch fusion
            </h4>
            <span className="font-mono text-muted-foreground tabular-nums">
              {item.branches.route}
              {item.branches.fusionLogit !== null
                ? ` · logit ${item.branches.fusionLogit.toFixed(3)}`
                : ""}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
            {branchEntries.map(([branchKey, prob]) => (
              <div key={branchKey}>
                <dt className="truncate text-muted-foreground">
                  {BRANCH_LABELS[branchKey] ?? branchKey}
                </dt>
                <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                  {formatPercent(prob)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {lexicalEntries.length > 0 && (
        <details className="group border-t border-outline/60 pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
            <span>Lexical features ({lexicalEntries.length})</span>
            <ChevronDown
              aria-hidden="true"
              className="size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-180"
              strokeWidth={1.75}
            />
          </summary>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-outline/50 pt-2.5 font-mono sm:grid-cols-3 lg:grid-cols-4">
            {lexicalEntries.map(([featKey, featVal]) => (
              <div
                key={featKey}
                className="flex min-w-0 items-baseline justify-between gap-2"
              >
                <dt className="truncate text-muted-foreground" title={featKey}>
                  {featKey}
                </dt>
                <dd className="shrink-0 tabular-nums text-foreground">
                  {Number.isInteger(featVal) ? featVal : featVal.toFixed(3)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

function BatchUrlRow({ item }: { item: UrlItemOutcome }) {
  const verdictMeta = VERDICT_META[toBinaryVerdict(item.verdict)];
  const hasBreakdown = Boolean(
    item.parsedUrl ||
      (item.branches &&
        Object.keys(item.branches.branchProbabilities).length > 0) ||
      (item.lexicalFeatures && Object.keys(item.lexicalFeatures).length > 0),
  );

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-muted-foreground tabular-nums">
            #{item.index + 1}
          </span>
          <span
            className={`workspace-badge inline-flex items-center gap-1.5 font-medium ${verdictMeta.textClass}`}
          >
            <span aria-hidden="true" className={verdictMeta.shapeClass} />
            <span>{verdictMeta.label}</span>
          </span>
          {item.id && (
            <span className="font-mono text-muted-foreground break-all">
              · {item.id}
            </span>
          )}
        </div>

        <span className="font-mono tabular-nums text-foreground">
          {formatPercent(item.maliciousProbability)}
        </span>
      </div>

      <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
          {item.url || "(empty)"}
        </span>
        {item.url && (
          <CopyButton
            value={item.url}
            ariaLabel={`Copy inert URL #${item.index + 1}`}
          />
        )}
      </div>

      {hasBreakdown && (
        <details className="group mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <span>Inspect breakdown</span>
            <ChevronDown
              aria-hidden="true"
              className="size-3 shrink-0 motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-180"
              strokeWidth={1.75}
            />
          </summary>
          <div className="mt-2 border-t border-outline/50 pt-3">
            <UrlItemTechnicalBreakdown item={item} />
          </div>
        </details>
      )}
    </div>
  );
}

export function UrlScanResult({ outcome, onReset }: UrlScanResultProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsPanelId = useId();

  const verdictMeta = VERDICT_META[toBinaryVerdict(outcome.verdict)];
  const urlDetails: UrlScanDetails | null =
    outcome.details.kind === "url" ? outcome.details : null;
  const isBatch = urlDetails?.mode === "batch";
  const singleItem =
    urlDetails && !isBatch && urlDetails.items.length === 1
      ? urlDetails.items[0]
      : null;

  return (
    <section
      aria-labelledby="scan-outcome-heading"
      className="divide-y divide-outline border-y border-outline"
    >
      {/* Verdict-first header */}
      <div className="space-y-3 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span
              className={`workspace-badge inline-flex items-center gap-1.5 font-medium ${verdictMeta.textClass}`}
            >
              <span aria-hidden="true" className={verdictMeta.shapeClass} />
              <span>{verdictMeta.label}</span>
            </span>

            {outcome.coverage !== "complete" && (
              <>
                <span aria-hidden="true" className="text-border-control">
                  ·
                </span>
                <span className="font-medium text-caution">
                  {outcome.coverageLabel}
                </span>
              </>
            )}
          </div>

          <div className="-my-2 -me-2 flex flex-wrap items-center gap-0.5">
            <CopyButton
              label="Copy"
              ariaLabel="Copy scan report JSON"
              value={() => serializeScanSummaryReport(outcome)}
            />
            <button
              type="button"
              onClick={() => downloadScanSummaryReport(outcome)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground active:bg-surface-selected"
            >
              <Download
                aria-hidden="true"
                className="size-3.5 shrink-0"
                strokeWidth={1.75}
              />
              <span>Export</span>
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground active:bg-surface-selected"
            >
              <RotateCcw
                aria-hidden="true"
                className="size-3.5 shrink-0"
                strokeWidth={1.75}
              />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <h2
            id="scan-outcome-heading"
            className="text-lg font-medium tracking-[-0.02em] text-balance text-foreground"
          >
            {outcome.summary}
          </h2>

          <p className="break-all font-mono text-xs text-muted-foreground">
            {outcome.inputLabel}
            {outcome.latencyMs !== null
              ? ` · ${Math.round(outcome.latencyMs)}ms`
              : ""}
          </p>
        </div>

        {urlDetails?.batchSummary && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
            <span className="text-foreground">
              {urlDetails.batchSummary.totalUrls} checked
            </span>
            <span
              className={
                urlDetails.batchSummary.maliciousCount > 0
                  ? "text-danger"
                  : "text-muted-foreground"
              }
            >
              {urlDetails.batchSummary.maliciousCount} malicious
            </span>
            <span
              className={
                urlDetails.batchSummary.benignCount > 0
                  ? "text-positive"
                  : "text-muted-foreground"
              }
            >
              {urlDetails.batchSummary.benignCount} benign
            </span>
          </div>
        )}
      </div>

      {/* Coverage notice (only when incomplete) */}
      {outcome.coverageDetail && (
        <div className="py-3.5 text-xs">
          <p className="max-w-[65ch] text-muted-foreground">
            {outcome.coverageDetail}
          </p>
        </div>
      )}

      {/* Next step + advisory note */}
      <div className="space-y-3 py-4">
        <ul className="space-y-1.5 text-sm text-foreground/90">
          {outcome.recommendedActions.map((step, idx) => (
            <li key={idx} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-2 size-1 shrink-0 rounded-full bg-accent"
              />
              <span className="max-w-[65ch]">{step}</span>
            </li>
          ))}
        </ul>

        <p className="max-w-[65ch] text-xs text-muted-foreground">
          {outcome.advisoryNotice}
        </p>
      </div>

      {/* Tucked metrics + technical evidence */}
      <div>
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls={detailsPanelId}
          onClick={() => setDetailsOpen((prev) => !prev)}
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-start text-xs motion-safe:transition-colors motion-safe:duration-150 hover:text-foreground"
        >
          <span className="font-medium text-muted-foreground">
            {isBatch && urlDetails
              ? `Details (${urlDetails.items.length} URLs)`
              : "Details"}
          </span>

          <span className="flex items-center gap-2 font-mono tabular-nums text-muted-foreground">
            <span>
              Risk {formatPercent(outcome.riskScore)}
              {outcome.confidence !== null
                ? ` · ${formatPercent(outcome.confidence)} conf`
                : ""}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150 ${
                detailsOpen ? "rotate-180" : ""
              }`}
              strokeWidth={1.75}
            />
          </span>
        </button>

        <div
          id={detailsPanelId}
          hidden={!detailsOpen}
          className="divide-y divide-outline/70 border-t border-outline py-4"
        >
          {/* Quantitative summary */}
          <dl className="grid grid-cols-2 gap-4 pb-3.5 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Risk score</dt>
              <dd className="mt-0.5 font-mono font-medium tabular-nums text-foreground">
                {formatPercent(outcome.riskScore)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Confidence</dt>
              <dd className="mt-0.5 font-mono font-medium tabular-nums text-foreground">
                {formatPercent(outcome.confidence)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Coverage</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {outcome.coverageLabel}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Risk tier</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {outcome.riskTier}
              </dd>
            </div>
          </dl>

          {singleItem && (
            <div className="space-y-3 py-3.5">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                  {singleItem.url || "(empty)"}
                </span>
                {singleItem.url && (
                  <CopyButton
                    value={singleItem.url}
                    ariaLabel="Copy inspected inert URL"
                  />
                )}
              </div>

              <UrlItemTechnicalBreakdown item={singleItem} />
            </div>
          )}

          {isBatch && urlDetails && (
            <div className="divide-y divide-outline/60 py-3.5">
              {urlDetails.items.map((item) => (
                <BatchUrlRow key={item.index} item={item} />
              ))}
            </div>
          )}

          {/* Model & scan reference footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-muted-foreground">
              {urlDetails?.modelId && <span>{urlDetails.modelId}</span>}
              {urlDetails?.thresholdUsed !== null &&
                urlDetails?.thresholdUsed !== undefined && (
                  <span className="tabular-nums">
                    · thr {urlDetails.thresholdUsed.toFixed(4)}
                  </span>
                )}
              <span>
                · ID <span className="text-foreground">{outcome.scanId}</span>
              </span>
            </div>

            <CopyButton
              value={outcome.scanId}
              label="Copy ID"
              ariaLabel="Copy transient scan reference ID"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
