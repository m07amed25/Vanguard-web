"use client";

import { Download, RotateCcw } from "lucide-react";
import { formatBytes, formatPercent } from "@/lib/features/catalog";
import {
  downloadScanSummaryReport,
  serializeScanSummaryReport,
} from "@/lib/features/report-download";
import type { AdvisoryVerdict, ScanOutcome } from "@/lib/features/types";
import { CopyButton } from "./copy-button";
import { ScanTechnicalDetails } from "./scan-technical-details";

interface ScanResultPanelProps {
  outcome: ScanOutcome;
  onReset: () => void;
}

const VERDICT_STYLES: Record<
  AdvisoryVerdict,
  {
    dotClass: string;
    textClass: string;
  }
> = {
  benign: {
    dotClass:
      "size-2 shrink-0 rounded-full border border-transparent bg-positive forced-colors:border-[CanvasText]",
    textClass: "text-positive",
  },
  review: {
    dotClass:
      "size-2 shrink-0 rotate-45 border border-transparent bg-caution forced-colors:border-[CanvasText]",
    textClass: "text-caution",
  },
  malicious: {
    dotClass:
      "size-2 shrink-0 rounded-[2px] border border-transparent bg-danger forced-colors:border-[CanvasText]",
    textClass: "text-danger",
  },
};

export function ScanResultPanel({ outcome, onReset }: ScanResultPanelProps) {
  const verdictStyle = VERDICT_STYLES[outcome.verdict];

  return (
    <section
      aria-labelledby="scan-outcome-heading"
      className="workspace-panel overflow-hidden rounded-2xl border border-outline bg-surface"
    >
      {/* Top verdict header — minimal status indicator, zero tinted banner noise */}
      <div className="border-b border-outline px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
              <span
                className={`workspace-badge inline-flex items-center gap-1.5 font-medium ${verdictStyle.textClass}`}
              >
                <span aria-hidden="true" className={verdictStyle.dotClass} />
                <span>{outcome.verdictLabel}</span>
              </span>

              {outcome.coverage !== "complete" && (
                <>
                  <span aria-hidden="true" className="text-border-control">
                    ·
                  </span>
                  <span className="font-medium text-caution">
                    Coverage: {outcome.coverageLabel}
                  </span>
                </>
              )}

              {outcome.riskTier !== "UNAVAILABLE" && (
                <>
                  <span aria-hidden="true" className="text-border-control">
                    ·
                  </span>
                  <span className="font-mono text-muted-foreground">
                    Tier: <span className="text-foreground">{outcome.riskTier}</span>
                  </span>
                </>
              )}
            </div>

            <h2
              id="scan-outcome-heading"
              className="text-lg font-medium tracking-[-0.02em] text-foreground sm:text-xl"
            >
              {outcome.summary}
            </h2>

            <p className="font-mono text-xs text-muted-foreground break-all">
              {outcome.inputLabel}
              {outcome.inputSizeBytes !== null
                ? ` · ${formatBytes(outcome.inputSizeBytes)}`
                : ""}
              {outcome.latencyMs !== null
                ? ` · ${Math.round(outcome.latencyMs)}ms`
                : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CopyButton
              variant="secondary"
              label="Copy"
              ariaLabel="Copy scan report JSON"
              value={() => serializeScanSummaryReport(outcome)}
            />
            <button
              type="button"
              onClick={() => downloadScanSummaryReport(outcome)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border-control bg-surface px-3 text-xs font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected"
            >
              <Download aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              <span>Export</span>
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border-control bg-surface px-3 text-xs font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hairline-divided structured content — zero nested cards */}
      <div className="divide-y divide-outline">
        {/* Key quantitative indicators strip */}
        <dl className="grid grid-cols-2 divide-y divide-outline sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3 sm:px-5">
            <dt className="text-xs text-muted-foreground">Risk score</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground tabular-nums">
              {formatPercent(outcome.riskScore)}
            </dd>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <dt className="text-xs text-muted-foreground">Confidence</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground tabular-nums">
              {formatPercent(outcome.confidence)}
            </dd>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <dt className="text-xs text-muted-foreground">Coverage</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {outcome.coverageLabel}
            </dd>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <dt className="text-xs text-muted-foreground">Uncertainty</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {outcome.isUncertain ? "Elevated" : "Normal"}
            </dd>
          </div>
        </dl>

        {/* Coverage limitation or uncertainty callout */}
        {(outcome.coverageDetail || outcome.uncertaintyReasons.length > 0) && (
          <div className="space-y-1.5 bg-caution-bg/15 px-4 py-3 text-xs sm:px-5">
            {outcome.coverageDetail && (
              <p className="max-w-[70ch] text-foreground">{outcome.coverageDetail}</p>
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

        {/* Recommended next steps */}
        <div className="px-4 py-3.5 sm:px-5">
          <h3 className="text-xs font-semibold text-muted-foreground">
            Recommended next steps
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground/90">
            {outcome.recommendedActions.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1 shrink-0 rounded-full bg-accent"
                />
                <span className="max-w-[70ch]">{step}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Advisory-only disclaimer */}
        <div className="px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          <p className="max-w-[75ch]">{outcome.advisoryNotice}</p>
        </div>

        {/* Expandable technical evidence */}
        <ScanTechnicalDetails details={outcome.details} scanId={outcome.scanId} />
      </div>
    </section>
  );
}
