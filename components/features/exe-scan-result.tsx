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
  ExeScanDetails,
  ScanOutcome,
} from "@/lib/features/types";
import { CopyButton } from "./copy-button";

interface ExeScanResultProps {
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

function ExeTokenList({
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

export function ExeScanResult({ outcome, onReset }: ExeScanResultProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsPanelId = useId();

  const verdictMeta = VERDICT_META[outcome.verdict];
  const exeDetails: ExeScanDetails | null =
    outcome.details.kind === "exe" ? outcome.details : null;

  const detailsSummaryHint =
    outcome.riskScore !== null
      ? `Risk ${formatPercent(outcome.riskScore)}${
          outcome.confidence !== null
            ? ` · ${formatPercent(outcome.confidence)} conf`
            : ""
        }`
      : outcome.coverageLabel;

  const hashes = exeDetails?.hashes
    ? (
        [
          ["SHA-256", exeDetails.hashes.sha256],
          ["SHA-1", exeDetails.hashes.sha1],
          ["MD5", exeDetails.hashes.md5],
          ["Imphash", exeDetails.hashes.imphash],
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

      {/* Tucked metrics + PE technical evidence */}
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

          {exeDetails && (
            <>
              {/* Model probabilities & operating threshold */}
              <dl className="grid grid-cols-2 gap-4 py-3.5 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Malware probability</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                    {formatPercent(exeDetails.malwareProbability)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Model disagreement</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                    {exeDetails.modelDisagreement !== null
                      ? exeDetails.modelDisagreement.toFixed(4)
                      : "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Operating point</dt>
                  <dd className="mt-0.5 font-mono text-foreground">
                    {exeDetails.operatingPoint ?? "Default"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Threshold</dt>
                  <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                    {exeDetails.threshold !== null
                      ? exeDetails.threshold.toFixed(4)
                      : "Unavailable"}
                  </dd>
                </div>
              </dl>

              {exeDetails.models && (
                <dl className="grid grid-cols-2 gap-4 py-3.5 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Hybrid probability</dt>
                    <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                      {formatPercent(exeDetails.models.hybridProbability)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">GBDT probability</dt>
                    <dd className="mt-0.5 font-mono tabular-nums text-foreground">
                      {formatPercent(exeDetails.models.gbdtProbability)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Consensus</dt>
                    <dd className="mt-0.5 font-mono text-foreground">
                      {exeDetails.models.consensus ?? "Unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Entry section</dt>
                    <dd className="mt-0.5 font-mono text-foreground">
                      {exeDetails.peHeaders?.entryPointSection ?? "Unavailable"}
                    </dd>
                  </div>
                </dl>
              )}

              {/* PE header & Authenticode */}
              {exeDetails.peHeaders && (
                <div className="space-y-2 py-3.5">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    PE header &amp; signature
                  </h4>
                  <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">
                        Architecture / subsystem
                      </dt>
                      <dd className="mt-0.5 font-mono text-foreground">
                        {[
                          exeDetails.peHeaders.machine,
                          exeDetails.peHeaders.subsystem,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Authenticode</dt>
                      <dd className="mt-0.5 font-mono text-foreground">
                        {exeDetails.peHeaders.isSigned === undefined
                          ? "Unavailable"
                          : exeDetails.peHeaders.isSigned
                            ? "Present"
                            : "Unsigned"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Compilation timestamp
                      </dt>
                      <dd className="mt-0.5 font-mono text-foreground">
                        {exeDetails.peHeaders.compilationTimestamp ??
                          "Unavailable"}
                        {exeDetails.peHeaders.isTimestomped
                          ? " (timestomp anomaly)"
                          : ""}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* PE sections table */}
              {exeDetails.sections.length > 0 && (
                <div className="space-y-1.5 py-3.5">
                  <h4 className="text-xs font-medium text-muted-foreground tabular-nums">
                    PE sections ({exeDetails.sections.length})
                  </h4>
                  <div
                    data-lenis-prevent
                    className="workspace-scroll overflow-x-auto border-t border-outline/60"
                  >
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-outline/60 text-muted-foreground">
                        <tr>
                          <th className="py-2 pe-3 font-medium">Section</th>
                          <th className="px-3 py-2 text-end font-medium">
                            Entropy
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            Raw size
                          </th>
                          <th className="py-2 ps-3 font-medium">Flags</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline/60 font-mono">
                        {exeDetails.sections.map((sec, idx) => (
                          <tr key={`${sec.name}-${idx}`}>
                            <td className="py-1.5 pe-3 text-foreground">
                              {sec.name || "(unnamed)"}
                            </td>
                            <td className="px-3 py-1.5 text-end tabular-nums text-foreground">
                              {sec.entropy !== null
                                ? sec.entropy.toFixed(2)
                                : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-end tabular-nums text-muted-foreground">
                              {formatBytes(sec.rawSize)}
                            </td>
                            <td className="py-1.5 ps-3 text-muted-foreground">
                              {[
                                sec.isRead ? "R" : "",
                                sec.isWrite ? "W" : "",
                                sec.isExec ? "X" : "",
                                sec.isWx ? "(W+X)" : "",
                              ]
                                .filter(Boolean)
                                .join(" ") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Security indicators & flagged APIs */}
              {exeDetails.securityIndicators && (
                <div className="grid gap-6 py-3.5 lg:grid-cols-2">
                  <ExeTokenList
                    title="Heuristic flags & indicators"
                    items={[
                      ...exeDetails.securityIndicators.heuristicRedFlags,
                      ...exeDetails.securityIndicators.topIndicators,
                    ]}
                    mono={false}
                  />
                  <ExeTokenList
                    title="Flagged system APIs"
                    items={exeDetails.securityIndicators.suspiciousApis}
                  />
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

              {/* Top explanation factors */}
              {exeDetails.topFactors.length > 0 && (
                <div className="space-y-1.5 py-3.5">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Top explanation factors
                  </h4>
                  <ul className="divide-y divide-outline/60 border-t border-outline/60">
                    {exeDetails.topFactors.slice(0, 10).map((factor, idx) => (
                      <li
                        key={`${factor.feature}-${idx}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-xs"
                      >
                        <span className="break-all font-mono text-foreground">
                          {factor.feature}
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {factor.direction}
                          {factor.contribution !== null
                            ? ` (${factor.contribution.toFixed(4)})`
                            : ""}
                        </span>
                        {factor.description && (
                          <span className="w-full text-muted-foreground">
                            {factor.description}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Model & scan reference footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-muted-foreground">
              {exeDetails?.models?.activeRunId && (
                <span className="break-all">
                  {exeDetails.models.activeRunId}
                </span>
              )}
              <span>
                {exeDetails?.models?.activeRunId ? "· " : ""}ID{" "}
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
