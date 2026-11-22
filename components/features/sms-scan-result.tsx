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
  SmsItemOutcome,
  SmsScanDetails,
} from "@/lib/features/types";
import { CopyButton } from "./copy-button";

interface SmsScanResultProps {
  outcome: ScanOutcome;
  onReset: () => void;
}

const DEFAULT_VISIBLE_ITEMS = 5;

const VERDICT_META: Record<
  AdvisoryVerdict,
  { shapeClass: string; textClass: string; itemLabel: string }
> = {
  benign: {
    shapeClass:
      "size-2 shrink-0 rounded-full border border-transparent bg-positive forced-colors:border-[CanvasText]",
    textClass: "text-positive",
    itemLabel: "Clean",
  },
  review: {
    shapeClass:
      "size-2 shrink-0 rotate-45 border border-transparent bg-caution forced-colors:border-[CanvasText]",
    textClass: "text-caution",
    itemLabel: "Needs review",
  },
  malicious: {
    shapeClass:
      "size-2 shrink-0 rounded-[2px] border border-transparent bg-danger forced-colors:border-[CanvasText]",
    textClass: "text-danger",
    itemLabel: "Spam / Smishing",
  },
};

function InertLedgerList({
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
                  className={`min-w-0 flex-1 truncate py-1 ${mono ? "font-mono" : ""}`}
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

function getItemUrls(item: SmsItemOutcome): string[] {
  return Array.from(
    new Set([...item.entities.urls, ...item.entities.shortenedUrls]),
  );
}

function SmsItemBreakdown({
  item,
  showTextExcerpt,
}: {
  item: SmsItemOutcome;
  showTextExcerpt: boolean;
}) {
  const allUrls = getItemUrls(item);
  const hasMetadata = Boolean(
    item.language ||
      item.script ||
      item.looksLikeOtp ||
      item.hasObfuscation ||
      item.truncatedMiddle,
  );
  const hasSecondaryEntities =
    item.entities.emails.length > 0 || item.entities.otpCodes.length > 0;

  return (
    <div className="space-y-3.5 text-xs">
      {hasMetadata && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          {(item.language || item.script) && (
            <span>
              Script:{" "}
              <span className="font-mono text-foreground">
                {[item.language, item.script].filter(Boolean).join(" · ")}
              </span>
            </span>
          )}
          {item.looksLikeOtp && <span>OTP pattern detected</span>}
          {item.hasObfuscation && (
            <span className="text-caution">
              Obfuscation / lookalike cues detected
            </span>
          )}
          {item.truncatedMiddle && <span>Dual-window scoring applied</span>}
        </div>
      )}

      {item.heuristicSignals.length > 0 && (
        <div className={hasMetadata ? "border-t border-outline/60 pt-3" : ""}>
          <InertLedgerList
            title="Heuristic signals"
            items={item.heuristicSignals}
            mono={false}
          />
        </div>
      )}

      {(showTextExcerpt ||
        allUrls.length > 0 ||
        item.entities.phoneNumbers.length > 0) && (
        <div
          className={`grid gap-6 lg:grid-cols-2 ${
            hasMetadata || item.heuristicSignals.length > 0
              ? "border-t border-outline/60 pt-3"
              : ""
          }`}
        >
          <InertLedgerList
            title="Extracted URLs (inert, non-clickable)"
            items={allUrls}
          />
          <InertLedgerList
            title="Extracted phone numbers (inert)"
            items={item.entities.phoneNumbers}
          />
        </div>
      )}

      {hasSecondaryEntities && (
        <div className="grid gap-6 border-t border-outline/60 pt-3 lg:grid-cols-2">
          <InertLedgerList
            title="Extracted email addresses (inert)"
            items={item.entities.emails}
          />
          <InertLedgerList
            title="Verification codes"
            items={item.entities.otpCodes}
          />
        </div>
      )}

      {showTextExcerpt && (
        <div className="space-y-1.5 border-t border-outline/60 pt-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              Inspected SMS text (inert excerpt)
            </h4>
            <CopyButton
              value={item.textExcerpt}
              label="Copy excerpt"
              ariaLabel="Copy inspected SMS text excerpt"
            />
          </div>
          <pre
            dir="auto"
            data-lenis-prevent
            className="workspace-scroll max-h-48 overflow-auto border-t border-outline/60 pt-2 whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground"
          >
            {item.textExcerpt || "(empty message)"}
          </pre>
        </div>
      )}
    </div>
  );
}

function BatchSmsRow({ item }: { item: SmsItemOutcome }) {
  const verdictMeta = VERDICT_META[item.verdict];
  const allUrls = getItemUrls(item);
  const hasBreakdown = Boolean(
    item.language ||
      item.script ||
      item.looksLikeOtp ||
      item.hasObfuscation ||
      item.truncatedMiddle ||
      item.heuristicSignals.length > 0 ||
      allUrls.length > 0 ||
      item.entities.phoneNumbers.length > 0 ||
      item.entities.emails.length > 0 ||
      item.entities.otpCodes.length > 0,
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
            <span>{verdictMeta.itemLabel}</span>
          </span>
          {item.id && (
            <span className="font-mono text-muted-foreground break-all">
              · {item.id}
            </span>
          )}
          {item.sender && (
            <span className="font-mono text-foreground break-all">
              · {item.sender}
            </span>
          )}
        </div>

        <span className="font-mono tabular-nums text-foreground">
          {formatPercent(item.spamProbability)}
        </span>
      </div>

      <pre
        dir="auto"
        className="mt-1.5 whitespace-pre-wrap break-words font-mono text-xs text-foreground"
      >
        {item.textExcerpt || "(empty message)"}
      </pre>

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
            <SmsItemBreakdown item={item} showTextExcerpt={false} />
          </div>
        </details>
      )}
    </div>
  );
}

export function SmsScanResult({ outcome, onReset }: SmsScanResultProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsPanelId = useId();

  const verdictMeta = VERDICT_META[outcome.verdict];
  const smsDetails: SmsScanDetails | null =
    outcome.details.kind === "sms" ? outcome.details : null;
  const isBatch = smsDetails?.mode === "batch";
  const singleItem =
    smsDetails && !isBatch && smsDetails.items.length === 1
      ? smsDetails.items[0]
      : null;

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
            {outcome.latencyMs !== null
              ? ` · ${Math.round(outcome.latencyMs)}ms`
              : ""}
          </p>
        </div>

        {smsDetails?.batchSummary && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
            <span className="text-foreground">
              {smsDetails.batchSummary.totalMessages} checked
            </span>
            <span
              className={
                smsDetails.batchSummary.spamCount > 0
                  ? "text-danger"
                  : "text-muted-foreground"
              }
            >
              {smsDetails.batchSummary.spamCount} flagged
            </span>
            {smsDetails.batchSummary.uncertainCount > 0 && (
              <span className="text-caution">
                {smsDetails.batchSummary.uncertainCount} review
              </span>
            )}
            <span
              className={
                smsDetails.batchSummary.hamCount > 0
                  ? "text-positive"
                  : "text-muted-foreground"
              }
            >
              {smsDetails.batchSummary.hamCount} clean
            </span>
          </div>
        )}
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
          <span className="font-medium text-muted-foreground">
            {isBatch && smsDetails
              ? `Details (${smsDetails.items.length} messages)`
              : "Details"}
          </span>

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

          {singleItem && (
            <div className="py-3.5">
              <SmsItemBreakdown item={singleItem} showTextExcerpt />
            </div>
          )}

          {isBatch && smsDetails && (
            <div className="divide-y divide-outline/60 py-3.5">
              {smsDetails.items.map((item) => (
                <BatchSmsRow key={item.index} item={item} />
              ))}
            </div>
          )}

          {/* Model & scan reference footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-muted-foreground">
              {smsDetails?.modelId && <span>{smsDetails.modelId}</span>}
              {smsDetails?.thresholdUsed !== null &&
                smsDetails?.thresholdUsed !== undefined && (
                  <span className="tabular-nums">
                    {smsDetails.modelId ? "· " : ""}thr{" "}
                    {smsDetails.thresholdUsed.toFixed(4)}
                  </span>
                )}
              <span>
                {smsDetails?.modelId ||
                (smsDetails?.thresholdUsed !== null &&
                  smsDetails?.thresholdUsed !== undefined)
                  ? "· "
                  : ""}
                ID <span className="text-foreground">{outcome.scanId}</span>
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
