"use client";

import { ChevronDown, Download, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { formatBytes, formatPercent } from "@/lib/features/catalog";
import {
  downloadScanSummaryReport,
  serializeScanSummaryReport,
} from "@/lib/features/report-download";
import type {
  AdvisoryVerdict,
  PdfScanDetails,
  ScanOutcome,
} from "@/lib/features/types";
import { CopyButton } from "./copy-button";

interface PdfScanResultProps {
  outcome: ScanOutcome;
  onReset: () => void;
}

const DEFAULT_VISIBLE_ITEMS = 5;

const VERDICT_META: Record<
  AdvisoryVerdict,
  { shapeClass: string; textClass: string }
> = {
  benign: {
    shapeClass:
      "size-2 shrink-0 rounded-full border border-transparent bg-positive forced-colors:border-[CanvasText]",
    textClass: "text-positive",
  },
  review: {
    shapeClass:
      "size-2 shrink-0 rotate-45 border border-transparent bg-caution forced-colors:border-[CanvasText]",
    textClass: "text-caution",
  },
  malicious: {
    shapeClass:
      "size-2 shrink-0 rounded-[2px] border border-transparent bg-danger forced-colors:border-[CanvasText]",
    textClass: "text-danger",
  },
};

function PdfTokenList({
  title,
  items,
  emptyLabel = "None found",
  mono = true,
}: {
  title: string;
  items: string[];
  emptyLabel?: string;
  mono?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const hasMore = items.length > DEFAULT_VISIBLE_ITEMS;
  const visibleItems = showAll ? items : items.slice(0, DEFAULT_VISIBLE_ITEMS);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-muted-foreground tabular-nums">
          {title} ({items.length})
        </h4>
        {items.length > 1 && (
          <CopyButton
            value={items.join("\n")}
            label="Copy all"
            ariaLabel={`Copy all ${title.toLowerCase()}`}
          />
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <>
          <ul className="divide-y divide-outline/60 border-t border-outline/60">
            {visibleItems.map((item, index) => (
              <li
                key={`${title}-${index}`}
                className="flex min-w-0 items-center justify-between gap-2 py-0.5 text-xs text-foreground"
              >
                <span
                  title={item}
                  className={`min-w-0 flex-1 truncate py-1 ${
                    mono ? "font-mono" : ""
                  }`}
                >
                  {item}
                </span>
                <CopyButton
                  value={item}
                  ariaLabel={`Copy ${title.toLowerCase()} item ${index + 1}`}
                />
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="border-t border-outline/60 pt-1">
              <button
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll((prev) => !prev)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-accent motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground"
              >
                <span>
                  {showAll
                    ? "Show less"
                    : `Show all (${items.length}) · +${hiddenCount} more`}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`size-3 shrink-0 motion-safe:transition-transform motion-safe:duration-150 ${
                    showAll ? "rotate-180" : ""
                  }`}
                  strokeWidth={1.75}
                />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function PdfScanResult({ outcome, onReset }: PdfScanResultProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsPanelId = useId();

  const verdictMeta = VERDICT_META[outcome.verdict];
  const pdfDetails: PdfScanDetails | null =
    outcome.details.kind === "pdf" ? outcome.details : null;

  const detailsSummaryHint =
    outcome.riskScore !== null
      ? `Risk ${formatPercent(outcome.riskScore)}${
          outcome.confidence !== null
            ? ` · ${formatPercent(outcome.confidence)} conf`
            : ""
        }`
      : outcome.coverageLabel;

  const hashes = pdfDetails?.hashes
    ? (
        [
          ["SHA-256", pdfDetails.hashes.sha256],
          ["SHA-1", pdfDetails.hashes.sha1],
          ["MD5", pdfDetails.hashes.md5],
        ] as const
      ).filter(([, val]) => Boolean(val))
    : [];

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
              <span>{outcome.verdictLabel}</span>
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
            {outcome.inputSizeBytes !== null
              ? ` · ${formatBytes(outcome.inputSizeBytes)}`
              : ""}
            {outcome.latencyMs !== null
              ? ` · ${Math.round(outcome.latencyMs)}ms`
              : ""}
          </p>
        </div>
      </div>

      {/* Coverage or uncertainty notice (only when applicable) */}
      {(outcome.coverageDetail || outcome.uncertaintyReasons.length > 0) && (
        <div className="space-y-1.5 py-3.5 text-xs">
          {outcome.coverageDetail && (
            <p className="max-w-[65ch] text-foreground">
              {outcome.coverageDetail}
            </p>
          )}
          {outcome.uncertaintyReasons.length > 0 && (
            <ul className="list-disc space-y-1 ps-4 text-muted-foreground">
              {outcome.uncertaintyReasons.map((reason, idx) => (
                <li key={idx} className="break-words">
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Recommended next steps + advisory note */}
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
          <span className="font-medium text-muted-foreground">Details</span>

          <span className="flex items-center gap-2 font-mono tabular-nums text-muted-foreground">
            <span>{detailsSummaryHint}</span>
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

          {pdfDetails && (
            <>
              {/* Estimator & threshold parameters */}
              <dl className="grid grid-cols-2 gap-4 py-3.5 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Malicious probability</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                    {formatPercent(pdfDetails.maliciousProbability)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Estimator</dt>
                  <dd className="mt-0.5 font-mono text-foreground">
                    {pdfDetails.estimatorUsed ?? "ensemble"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Threshold</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                    {pdfDetails.threshold !== null
                      ? pdfDetails.threshold.toFixed(4)
                      : "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Consensus</dt>
                  <dd className="mt-0.5 font-mono text-foreground">
                    {pdfDetails.models?.consensus ?? "Unavailable"}
                  </dd>
                </div>
              </dl>

              {/* PDF structural metadata */}
              {pdfDetails.metadata && (
                <div className="space-y-3 py-3.5">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    PDF metadata
                  </h4>
                  <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">Version</dt>
                      <dd className="mt-0.5 font-mono text-foreground">
                        {pdfDetails.metadata.pdfVersion ?? "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Pages</dt>
                      <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                        {pdfDetails.metadata.numPages ?? "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Encrypted</dt>
                      <dd className="mt-0.5 font-mono text-foreground">
                        {pdfDetails.metadata.isEncrypted ? "Yes" : "No"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Parsed cleanly</dt>
                      <dd className="mt-0.5 font-mono text-foreground">
                        {pdfDetails.metadata.parseSuccess ? "Yes" : "No"}
                      </dd>
                    </div>
                  </dl>

                  {pdfDetails.metadata.parserErrors.length > 0 && (
                    <PdfTokenList
                      title="Parser notices"
                      items={pdfDetails.metadata.parserErrors}
                      mono={false}
                    />
                  )}
                </div>
              )}

              {/* Active-content indicators & inert extracted artifacts */}
              {pdfDetails.securityIndicators && (
                <div className="space-y-4 py-3.5">
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground">
                      Active-content indicators
                    </h4>
                    <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-muted-foreground">JavaScript</dt>
                        <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                          {pdfDetails.securityIndicators.javascriptCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">OpenAction / AA</dt>
                        <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                          {pdfDetails.securityIndicators.openActionCount} /{" "}
                          {pdfDetails.securityIndicators.aaCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Launch / Embedded</dt>
                        <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                          {pdfDetails.securityIndicators.launchCount} /{" "}
                          {pdfDetails.securityIndicators.embeddedFileCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          AcroForm / XFA / URI
                        </dt>
                        <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                          {pdfDetails.securityIndicators.acroFormCount} /{" "}
                          {pdfDetails.securityIndicators.xfaCount} /{" "}
                          {pdfDetails.securityIndicators.uriCount}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <PdfTokenList
                      title="Extracted URLs (inert, non-clickable)"
                      items={pdfDetails.securityIndicators.extractedUrls}
                    />
                    <PdfTokenList
                      title="Heuristic flags & suspicious strings"
                      items={[
                        ...pdfDetails.securityIndicators.heuristicRedFlags,
                        ...pdfDetails.securityIndicators.suspiciousStrings,
                      ]}
                    />
                  </div>
                </div>
              )}

              {/* Cryptographic fingerprints */}
              {hashes.length > 0 && (
                <div className="space-y-1.5 py-3.5">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Cryptographic fingerprints
                  </h4>
                  <dl className="space-y-1 font-mono text-xs">
                    {hashes.map(([label, val]) => (
                      <div key={label} className="flex flex-wrap gap-x-2">
                        <dt className="w-20 shrink-0 text-muted-foreground">
                          {label}:
                        </dt>
                        <dd className="min-w-0 flex-1 break-all text-foreground">
                          {val}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* Top contributing risk features */}
              {pdfDetails.topContributingFeatures.length > 0 && (
                <div className="space-y-1.5 py-3.5">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Top contributing risk features
                  </h4>
                  <ul className="divide-y divide-outline/60 border-t border-outline/60">
                    {pdfDetails.topContributingFeatures
                      .slice(0, 12)
                      .map((item, idx) => (
                        <li
                          key={`${item.feature}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 py-1.5 font-mono text-xs"
                        >
                          <span className="break-all text-foreground">
                            {item.feature}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            val={item.value ?? "—"} · {item.direction}
                            {item.contribution !== null
                              ? ` (${item.contribution.toFixed(4)})`
                              : ""}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {/* Raw static feature vector (when requested via Options) */}
              {pdfDetails.rawFeatures &&
                Object.keys(pdfDetails.rawFeatures).length > 0 && (
                  <div className="space-y-1.5 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-medium text-muted-foreground tabular-nums">
                        Extracted static feature vector (
                        {Object.keys(pdfDetails.rawFeatures).length})
                      </h4>
                      <CopyButton
                        value={() =>
                          JSON.stringify(pdfDetails.rawFeatures, null, 2)
                        }
                        label="Copy JSON"
                        ariaLabel="Copy extracted static feature vector JSON"
                      />
                    </div>
                    <pre
                      data-lenis-prevent
                      className="workspace-scroll max-h-56 overflow-auto border-t border-outline/60 pt-2 font-mono text-xs text-muted-foreground"
                    >
                      {JSON.stringify(pdfDetails.rawFeatures, null, 2)}
                    </pre>
                  </div>
                )}
            </>
          )}

          {/* Model & scan reference footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-muted-foreground">
              {pdfDetails?.models?.modelVersion && (
                <span>{pdfDetails.models.modelVersion}</span>
              )}
              <span>
                {pdfDetails?.models?.modelVersion ? "· " : ""}ID{" "}
                <span className="text-foreground">{outcome.scanId}</span>
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
