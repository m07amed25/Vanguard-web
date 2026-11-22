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
  EmailScanDetails,
  ScanOutcome,
} from "@/lib/features/types";
import { CopyButton } from "./copy-button";

interface EmailScanResultProps {
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

function InertLedgerList({
  title,
  items,
  emptyLabel = "None found",
}: {
  title: string;
  items: string[];
  emptyLabel?: string;
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
                  className="min-w-0 flex-1 truncate py-1 font-mono"
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

function EmailAttachmentsLedger({
  attachments,
}: {
  attachments: EmailScanDetails["attachments"];
}) {
  const [showAll, setShowAll] = useState(false);
  const hasMore = attachments.length > DEFAULT_VISIBLE_ITEMS;
  const visible = showAll
    ? attachments
    : attachments.slice(0, DEFAULT_VISIBLE_ITEMS);

  return (
    <div className="space-y-2 py-3.5">
      <h4 className="text-xs font-medium text-muted-foreground tabular-nums">
        Attachments ({attachments.length})
      </h4>

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No attachments detected.</p>
      ) : (
        <>
          <div
            data-lenis-prevent
            className="workspace-scroll overflow-x-auto border-t border-outline/60"
          >
            <table className="w-full text-left text-xs">
              <thead className="border-b border-outline/60 text-muted-foreground">
                <tr>
                  <th className="py-2 pe-3 font-medium">Filename</th>
                  <th className="px-3 py-2 font-medium">MIME type</th>
                  <th className="px-3 py-2 font-medium">Disposition</th>
                  <th className="py-2 ps-3 text-end font-medium">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline/60">
                {visible.map((att, idx) => (
                  <tr key={idx}>
                    <td
                      title={att.filename ?? "(unnamed)"}
                      className="max-w-[24ch] truncate py-2 pe-3 font-mono text-foreground sm:max-w-[36ch]"
                    >
                      {att.filename ?? "(unnamed)"}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {att.contentType}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {att.disposition ?? "—"}
                    </td>
                    <td className="py-2 ps-3 text-end font-mono tabular-nums text-foreground">
                      {formatBytes(att.sizeBytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="border-t border-outline/60 pt-1">
              <button
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll((prev) => !prev)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-accent motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground"
              >
                <span>
                  {showAll ? "Show less" : `Show all (${attachments.length})`}
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

export function EmailScanResult({ outcome, onReset }: EmailScanResultProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsPanelId = useId();

  const verdictMeta = VERDICT_META[outcome.verdict];
  const emailDetails: EmailScanDetails | null =
    outcome.details.kind === "email" ? outcome.details : null;

  const detailsSummaryHint =
    outcome.riskScore !== null
      ? `Risk ${formatPercent(outcome.riskScore)}${
          outcome.confidence !== null
            ? ` · ${formatPercent(outcome.confidence)} conf`
            : ""
        }`
      : outcome.coverageLabel;

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

          {emailDetails && (
            <>
              {emailDetails.reasonCodes.length > 0 && (
                <div className="py-3.5">
                  <InertLedgerList
                    title="Reason codes"
                    items={emailDetails.reasonCodes}
                  />
                </div>
              )}

              <div className="grid gap-6 py-3.5 lg:grid-cols-2">
                <InertLedgerList
                  title="Extracted email addresses (inert)"
                  items={emailDetails.emailAddresses}
                />
                <InertLedgerList
                  title="Extracted links (inert, non-clickable)"
                  items={emailDetails.links}
                />
              </div>

              <EmailAttachmentsLedger attachments={emailDetails.attachments} />

              <div className="space-y-1.5 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Cleaned text excerpt (inert)
                  </h4>
                  <CopyButton
                    value={`Subject: ${emailDetails.cleanedSubject || "(empty)"}\n\n${emailDetails.cleanedBodyExcerpt || "(empty body)"}`}
                    label="Copy excerpt"
                    ariaLabel="Copy cleaned subject and body excerpt"
                  />
                </div>
                <p className="text-xs">
                  <span className="text-muted-foreground">Subject: </span>
                  <span className="break-words font-mono text-foreground">
                    {emailDetails.cleanedSubject || "(empty)"}
                  </span>
                </p>
                <pre
                  data-lenis-prevent
                  className="workspace-scroll max-h-48 overflow-auto border-t border-outline/60 pt-2 font-mono text-xs whitespace-pre-wrap break-words text-muted-foreground"
                >
                  {emailDetails.cleanedBodyExcerpt || "(empty body)"}
                </pre>
              </div>
            </>
          )}

          {/* Model & scan reference footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-muted-foreground">
              {emailDetails && (
                <>
                  <span>{emailDetails.mode}</span>
                  <span>· {emailDetails.action}</span>
                  {emailDetails.threshold !== null && (
                    <span className="tabular-nums">
                      · thr {emailDetails.threshold.toFixed(4)}
                    </span>
                  )}
                  {emailDetails.severeScore !== null && (
                    <span className="tabular-nums">
                      · severe {formatPercent(emailDetails.severeScore)}
                    </span>
                  )}
                  {emailDetails.modelVersion && (
                    <span>· {emailDetails.modelVersion}</span>
                  )}
                  {emailDetails.policyVersion && (
                    <span>· {emailDetails.policyVersion}</span>
                  )}
                </>
              )}
              <span>
                {emailDetails ? "· " : ""}ID{" "}
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
