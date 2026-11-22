"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { formatBytes, formatPercent } from "@/lib/features/catalog";
import type {
  AdvisoryVerdict,
  EmailScanDetails,
  ExeScanDetails,
  FeatureSpecificDetails,
  OfficeScanDetails,
  PdfScanDetails,
  SmsScanDetails,
  UrlScanDetails,
} from "@/lib/features/types";
import { CopyButton } from "./copy-button";

interface ScanTechnicalDetailsProps {
  details: FeatureSpecificDetails;
  scanId: string;
}

const DEFAULT_VISIBLE_ITEMS = 5;

function VerdictInline({
  verdict,
  label,
}: {
  verdict: AdvisoryVerdict;
  label: string;
}) {
  if (verdict === "malicious") {
    return (
      <span className="workspace-badge inline-flex items-center gap-1.5 text-xs font-medium text-danger">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-[2px] border border-transparent bg-danger forced-colors:border-[CanvasText]"
        />
        <span>{label}</span>
      </span>
    );
  }
  if (verdict === "review") {
    return (
      <span className="workspace-badge inline-flex items-center gap-1.5 text-xs font-medium text-caution">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rotate-45 border border-transparent bg-caution forced-colors:border-[CanvasText]"
        />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="workspace-badge inline-flex items-center gap-1.5 text-xs font-medium text-positive">
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full border border-transparent bg-positive forced-colors:border-[CanvasText]"
      />
      <span>{label}</span>
    </span>
  );
}

function InertList({
  title,
  items,
  emptyLabel = "None found",
  mono = true,
  initialLimit = DEFAULT_VISIBLE_ITEMS,
}: {
  title: string;
  items: string[];
  emptyLabel?: string;
  mono?: boolean;
  initialLimit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const hasMore = items.length > initialLimit;
  const visibleItems = showAll ? items : items.slice(0, initialLimit);
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

function EmailDetailsView({ details }: { details: EmailScanDetails }) {
  const [showAllAttachments, setShowAllAttachments] = useState(false);
  const hasMoreAttachments =
    details.attachments.length > DEFAULT_VISIBLE_ITEMS;
  const visibleAttachments = showAllAttachments
    ? details.attachments
    : details.attachments.slice(0, DEFAULT_VISIBLE_ITEMS);

  return (
    <div className="divide-y divide-outline/70">
      <div className="pb-3.5">
        <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Scoring mode</dt>
            <dd className="mt-0.5 font-mono text-foreground">{details.mode}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Policy action</dt>
            <dd className="mt-0.5 font-mono text-foreground">{details.action}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Threshold</dt>
            <dd className="mt-0.5 font-mono text-foreground tabular-nums">
              {details.threshold !== null ? details.threshold.toFixed(4) : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Severe score</dt>
            <dd className="mt-0.5 font-mono text-foreground tabular-nums">
              {formatPercent(details.severeScore)}
            </dd>
          </div>
        </dl>

        {(details.modelVersion || details.policyVersion) && (
          <p className="mt-2.5 font-mono text-xs text-muted-foreground">
            Model: {details.modelVersion ?? "Unavailable"} · Policy:{" "}
            {details.policyVersion ?? "Unavailable"}
          </p>
        )}
      </div>

      {details.reasonCodes.length > 0 && (
        <div className="py-3.5">
          <InertList title="Reason codes" items={details.reasonCodes} />
        </div>
      )}

      <div className="grid gap-6 py-3.5 lg:grid-cols-2">
        <InertList
          title="Extracted email addresses (inert)"
          items={details.emailAddresses}
        />
        <InertList
          title="Extracted links (inert, non-clickable)"
          items={details.links}
        />
      </div>

      <div className="space-y-2 py-3.5">
        <h4 className="text-xs font-medium text-muted-foreground tabular-nums">
          Attachments ({details.attachments.length})
        </h4>
        {details.attachments.length === 0 ? (
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
                  {visibleAttachments.map((att, idx) => (
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
                      <td className="py-2 ps-3 text-end font-mono text-foreground tabular-nums">
                        {formatBytes(att.sizeBytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMoreAttachments && (
              <div className="border-t border-outline/60 pt-1">
                <button
                  type="button"
                  aria-expanded={showAllAttachments}
                  onClick={() => setShowAllAttachments((prev) => !prev)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-accent motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground"
                >
                  <span>
                    {showAllAttachments
                      ? "Show less"
                      : `Show all (${details.attachments.length})`}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-3 shrink-0 motion-safe:transition-transform motion-safe:duration-150 ${
                      showAllAttachments ? "rotate-180" : ""
                    }`}
                    strokeWidth={1.75}
                  />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="space-y-1.5 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            Cleaned text excerpt (inert)
          </h4>
          <CopyButton
            value={`Subject: ${details.cleanedSubject || "(empty)"}\n\n${details.cleanedBodyExcerpt || "(empty body)"}`}
            label="Copy excerpt"
            ariaLabel="Copy cleaned subject and body excerpt"
          />
        </div>
        <p className="text-xs">
          <span className="text-muted-foreground">Subject: </span>
          <span className="font-mono text-foreground break-words">
            {details.cleanedSubject || "(empty)"}
          </span>
        </p>
        <pre
          data-lenis-prevent
          className="workspace-scroll max-h-48 overflow-auto border-t border-outline/60 pt-2 whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground"
        >
          {details.cleanedBodyExcerpt || "(empty body)"}
        </pre>
      </div>
    </div>
  );
}

function ExeDetailsView({ details }: { details: ExeScanDetails }) {
  return (
    <div className="divide-y divide-outline/70">
      <dl className="grid grid-cols-2 gap-4 pb-3.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Malware probability</dt>
          <dd className="mt-0.5 font-mono text-foreground tabular-nums">
            {formatPercent(details.malwareProbability)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Model disagreement</dt>
          <dd className="mt-0.5 font-mono text-foreground tabular-nums">
            {details.modelDisagreement !== null
              ? details.modelDisagreement.toFixed(4)
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Operating point</dt>
          <dd className="mt-0.5 font-mono text-foreground">
            {details.operatingPoint ?? "Default"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Threshold</dt>
          <dd className="mt-0.5 font-mono text-foreground tabular-nums">
            {details.threshold !== null ? details.threshold.toFixed(4) : "Unavailable"}
          </dd>
        </div>
      </dl>

      {details.models && (
        <dl className="grid grid-cols-2 gap-4 py-3.5 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Hybrid probability</dt>
            <dd className="mt-0.5 font-mono text-foreground tabular-nums">
              {formatPercent(details.models.hybridProbability)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">GBDT probability</dt>
            <dd className="mt-0.5 font-mono text-foreground tabular-nums">
              {formatPercent(details.models.gbdtProbability)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Consensus</dt>
            <dd className="mt-0.5 font-mono text-foreground">
              {details.models.consensus ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Active run</dt>
            <dd className="mt-0.5 font-mono text-foreground break-all">
              {details.models.activeRunId ?? "Unavailable"}
            </dd>
          </div>
        </dl>
      )}

      {details.hashes && (
        <div className="space-y-1.5 py-3.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Cryptographic fingerprints
          </h4>
          <dl className="space-y-1 font-mono text-xs">
            {(
              [
                ["SHA-256", details.hashes.sha256],
                ["SHA-1", details.hashes.sha1],
                ["MD5", details.hashes.md5],
                ["Imphash", details.hashes.imphash],
              ] as const
            )
              .filter(([, val]) => Boolean(val))
              .map(([label, val]) => (
                <div key={label} className="flex flex-wrap gap-x-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">{label}:</dt>
                  <dd className="min-w-0 flex-1 text-foreground break-all">{val}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}

      {details.peHeaders && (
        <div className="space-y-1.5 py-3.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            PE header & signature
          </h4>
          <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Architecture / subsystem</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {[details.peHeaders.machine, details.peHeaders.subsystem]
                  .filter(Boolean)
                  .join(" · ") || "Unavailable"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Authenticode</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {details.peHeaders.isSigned === undefined
                  ? "Unavailable"
                  : details.peHeaders.isSigned
                    ? "Present"
                    : "Unsigned"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Compilation timestamp</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {details.peHeaders.compilationTimestamp ?? "Unavailable"}
                {details.peHeaders.isTimestomped ? " (timestomp anomaly)" : ""}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {details.sections.length > 0 && (
        <div className="space-y-1.5 py-3.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            PE sections ({details.sections.length})
          </h4>
          <div
            data-lenis-prevent
            className="workspace-scroll overflow-x-auto border-t border-outline/60"
          >
            <table className="w-full text-left text-xs">
              <thead className="border-b border-outline/60 text-muted-foreground">
                <tr>
                  <th className="py-2 pe-3 font-medium">Section</th>
                  <th className="px-3 py-2 font-medium">Entropy</th>
                  <th className="px-3 py-2 font-medium">Raw size</th>
                  <th className="py-2 ps-3 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline/60 font-mono">
                {details.sections.map((sec, idx) => (
                  <tr key={`${sec.name}-${idx}`}>
                    <td className="py-1.5 pe-3 text-foreground">{sec.name || "(unnamed)"}</td>
                    <td className="px-3 py-1.5 text-foreground tabular-nums">
                      {sec.entropy !== null ? sec.entropy.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
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

      {details.securityIndicators && (
        <div className="grid gap-4 py-3.5 lg:grid-cols-2">
          <InertList
            title="Heuristic flags & indicators"
            items={[
              ...details.securityIndicators.heuristicRedFlags,
              ...details.securityIndicators.topIndicators,
            ]}
            mono={false}
          />
          <InertList
            title="Flagged system APIs"
            items={details.securityIndicators.suspiciousApis}
          />
        </div>
      )}

      {details.topFactors.length > 0 && (
        <div className="space-y-1.5 pt-3.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Top explanation factors
          </h4>
          <ul className="divide-y divide-outline/60 border-t border-outline/60">
            {details.topFactors.slice(0, 10).map((factor, idx) => (
              <li
                key={`${factor.feature}-${idx}`}
                className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-xs"
              >
                <span className="font-mono text-foreground break-all">
                  {factor.feature}
                </span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {factor.direction}
                  {factor.contribution !== null
                    ? ` (${factor.contribution.toFixed(4)})`
                    : ""}
                </span>
                {factor.description && (
                  <span className="w-full text-muted-foreground">{factor.description}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OfficeDetailsView({ details }: { details: OfficeScanDetails }) {
  return (
    <div className="divide-y divide-outline/70">
      <dl className="grid grid-cols-2 gap-4 pb-3.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Observed format</dt>
          <dd className="mt-0.5 font-mono text-foreground">{details.observedFormat}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Raw scan status</dt>
          <dd className="mt-0.5 font-mono text-foreground">{details.rawScanStatus}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Branch disagreement</dt>
          <dd className="mt-0.5 font-mono text-foreground tabular-nums">
            {details.disagreement !== null
              ? details.disagreement.toFixed(4)
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Model version</dt>
          <dd className="mt-0.5 font-mono text-foreground">
            {details.modelVersion ?? "Unavailable"}
          </dd>
        </div>
      </dl>

      {details.primaryAttribution && (
        <div className="py-3.5 text-xs">
          <p className="font-medium text-foreground">
            Primary threat attribution:{" "}
            <span className="font-mono text-caution">{details.primaryAttribution}</span>
            {details.primaryAttributionScore !== null
              ? ` (${formatPercent(details.primaryAttributionScore)})`
              : ""}
          </p>
          {details.lowConfidenceAttribution && (
            <p className="mt-1 text-muted-foreground">
              Attribution confidence is low — treat the family label as advisory only.
            </p>
          )}
        </div>
      )}

      {details.threatCategories.length > 0 && (
        <div className="space-y-1.5 py-3.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            9-class threat attribution scores
          </h4>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {details.threatCategories.map(({ category, score }) => (
              <div
                key={category}
                className="flex items-center justify-between border-b border-outline/50 py-1 font-mono text-xs"
              >
                <dt className="truncate text-muted-foreground">{category}</dt>
                <dd className="text-foreground tabular-nums">{formatPercent(score)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {details.modalityAvailability && (
        <div className="space-y-1.5 py-3.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Static modality coverage
          </h4>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
            {Object.entries(details.modalityAvailability).map(([mod, available]) => (
              <span key={mod} className="text-muted-foreground">
                Modality {mod}:{" "}
                <span className="text-foreground">
                  {available ? "Inspected" : "Unavailable"}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 pt-3.5 lg:grid-cols-2">
        <InertList title="Reason codes" items={details.reasonCodes} />
        <InertList title="Format candidates" items={details.formatCandidates} />
      </div>
    </div>
  );
}

function PdfDetailsView({ details }: { details: PdfScanDetails }) {
  return (
    <div className="divide-y divide-outline/70">
      <dl className="grid grid-cols-2 gap-4 pb-3.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Malicious probability</dt>
          <dd className="mt-0.5 font-mono text-foreground tabular-nums">
            {formatPercent(details.maliciousProbability)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Estimator</dt>
          <dd className="mt-0.5 font-mono text-foreground">
            {details.estimatorUsed ?? "ensemble"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Threshold</dt>
          <dd className="mt-0.5 font-mono text-foreground tabular-nums">
            {details.threshold !== null ? details.threshold.toFixed(4) : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Consensus</dt>
          <dd className="mt-0.5 font-mono text-foreground">
            {details.models?.consensus ?? "Unavailable"}
          </dd>
        </div>
      </dl>

      {details.metadata && (
        <div className="space-y-2 py-3.5">
          <h4 className="text-xs font-medium text-muted-foreground">PDF metadata</h4>
          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Version</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {details.metadata.pdfVersion ?? "Unavailable"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pages</dt>
              <dd className="mt-0.5 font-mono text-foreground tabular-nums">
                {details.metadata.numPages ?? "Unavailable"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Encrypted</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {details.metadata.isEncrypted ? "Yes" : "No"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Parsed cleanly</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {details.metadata.parseSuccess ? "Yes" : "No"}
              </dd>
            </div>
          </dl>
          {details.metadata.parserErrors.length > 0 && (
            <InertList
              title="Parser notices"
              items={details.metadata.parserErrors}
              mono={false}
            />
          )}
        </div>
      )}

      {details.securityIndicators && (
        <div className="space-y-3.5 py-3.5">
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">
              Active-content indicators
            </h4>
            <dl className="grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
              <div>
                <dt className="font-sans text-muted-foreground">JavaScript</dt>
                <dd className="mt-0.5 text-foreground tabular-nums">
                  {details.securityIndicators.javascriptCount}
                </dd>
              </div>
              <div>
                <dt className="font-sans text-muted-foreground">OpenAction / AA</dt>
                <dd className="mt-0.5 text-foreground tabular-nums">
                  {details.securityIndicators.openActionCount} /{" "}
                  {details.securityIndicators.aaCount}
                </dd>
              </div>
              <div>
                <dt className="font-sans text-muted-foreground">Launch / Embedded</dt>
                <dd className="mt-0.5 text-foreground tabular-nums">
                  {details.securityIndicators.launchCount} /{" "}
                  {details.securityIndicators.embeddedFileCount}
                </dd>
              </div>
              <div>
                <dt className="font-sans text-muted-foreground">AcroForm / XFA / URI</dt>
                <dd className="mt-0.5 text-foreground tabular-nums">
                  {details.securityIndicators.acroFormCount} /{" "}
                  {details.securityIndicators.xfaCount} /{" "}
                  {details.securityIndicators.uriCount}
                </dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <InertList
              title="Extracted URLs (inert, non-clickable)"
              items={details.securityIndicators.extractedUrls}
            />
            <InertList
              title="Heuristic flags & suspicious strings"
              items={[
                ...details.securityIndicators.heuristicRedFlags,
                ...details.securityIndicators.suspiciousStrings,
              ]}
            />
          </div>
        </div>
      )}

      {details.hashes && (
        <div className="space-y-1.5 py-3.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Cryptographic fingerprints
          </h4>
          <dl className="space-y-1 font-mono text-xs">
            {(
              [
                ["SHA-256", details.hashes.sha256],
                ["SHA-1", details.hashes.sha1],
                ["MD5", details.hashes.md5],
              ] as const
            )
              .filter(([, val]) => Boolean(val))
              .map(([label, val]) => (
                <div key={label} className="flex flex-wrap gap-x-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">{label}:</dt>
                  <dd className="min-w-0 flex-1 text-foreground break-all">{val}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}

      {details.topContributingFeatures.length > 0 && (
        <div className="space-y-1.5 py-3.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Top contributing risk features
          </h4>
          <ul className="divide-y divide-outline/60 border-t border-outline/60">
            {details.topContributingFeatures.slice(0, 12).map((item, idx) => (
              <li
                key={`${item.feature}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5 font-mono text-xs"
              >
                <span className="text-foreground break-all">{item.feature}</span>
                <span className="text-muted-foreground tabular-nums">
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

      {details.rawFeatures && Object.keys(details.rawFeatures).length > 0 && (
        <div className="space-y-1.5 pt-3.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Extracted static feature vector ({Object.keys(details.rawFeatures).length})
          </h4>
          <pre
            data-lenis-prevent
            className="workspace-scroll max-h-56 overflow-auto border-t border-outline/60 pt-2 font-mono text-xs text-muted-foreground"
          >
            {JSON.stringify(details.rawFeatures, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function SmsDetailsView({ details }: { details: SmsScanDetails }) {
  const singleItem =
    details.mode === "single" && details.items.length === 1
      ? details.items[0]
      : null;

  return (
    <div className="divide-y divide-outline/70">
      <div className="pb-3.5">
        <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="mt-0.5 font-mono text-foreground">
              {details.modelId ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Threshold</dt>
            <dd className="mt-0.5 font-mono text-foreground tabular-nums">
              {details.thresholdUsed !== null
                ? details.thresholdUsed.toFixed(4)
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Inspection mode</dt>
            <dd className="mt-0.5 font-mono text-foreground">
              {details.mode === "batch"
                ? `Batch (${details.items.length} messages)`
                : "Single message"}
            </dd>
          </div>
          {singleItem && (
            <div>
              <dt className="text-muted-foreground">Language & script</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {[singleItem.language, singleItem.script]
                  .filter(Boolean)
                  .join(" · ") || "Unavailable"}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {details.batchSummary && (
        <dl className="grid grid-cols-2 gap-4 py-3.5 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Total checked</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground tabular-nums">
              {details.batchSummary.totalMessages}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Spam / smishing</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-danger tabular-nums">
              {details.batchSummary.spamCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Clean</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-positive tabular-nums">
              {details.batchSummary.hamCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Review</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-caution tabular-nums">
              {details.batchSummary.uncertainCount}
            </dd>
          </div>
        </dl>
      )}

      {singleItem ? (
        <>
          {(singleItem.looksLikeOtp ||
            singleItem.hasObfuscation ||
            singleItem.truncatedMiddle ||
            singleItem.heuristicSignals.length > 0) && (
            <div className="space-y-2 py-3.5">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {singleItem.looksLikeOtp && <span>OTP pattern detected</span>}
                {singleItem.hasObfuscation && (
                  <span className="text-caution">
                    Obfuscation / lookalike cues detected
                  </span>
                )}
                {singleItem.truncatedMiddle && (
                  <span>Dual-window scoring applied</span>
                )}
              </div>
              {singleItem.heuristicSignals.length > 0 && (
                <InertList
                  title="Heuristic signals"
                  items={singleItem.heuristicSignals}
                  mono={false}
                />
              )}
            </div>
          )}

          <div className="grid gap-6 py-3.5 lg:grid-cols-2">
            <InertList
              title="Extracted URLs (inert, non-clickable)"
              items={Array.from(
                new Set([
                  ...singleItem.entities.urls,
                  ...singleItem.entities.shortenedUrls,
                ]),
              )}
            />
            <InertList
              title="Extracted phone numbers (inert)"
              items={singleItem.entities.phoneNumbers}
            />
          </div>

          {(singleItem.entities.emails.length > 0 ||
            singleItem.entities.otpCodes.length > 0) && (
            <div className="grid gap-6 py-3.5 lg:grid-cols-2">
              <InertList
                title="Extracted email addresses (inert)"
                items={singleItem.entities.emails}
              />
              <InertList
                title="Verification codes"
                items={singleItem.entities.otpCodes}
              />
            </div>
          )}

          <div className="space-y-1.5 pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-medium text-muted-foreground">
                Inspected SMS text (inert excerpt)
              </h4>
              <CopyButton
                value={singleItem.textExcerpt}
                label="Copy excerpt"
                ariaLabel="Copy inspected SMS text excerpt"
              />
            </div>
            <pre
              dir="auto"
              data-lenis-prevent
              className="workspace-scroll max-h-48 overflow-auto border-t border-outline/60 pt-2 whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground"
            >
              {singleItem.textExcerpt || "(empty message)"}
            </pre>
          </div>
        </>
      ) : (
        <div className="divide-y divide-outline/60 pt-1">
          {details.items.map((item) => {
            const allUrls = Array.from(
              new Set([
                ...item.entities.urls,
                ...item.entities.shortenedUrls,
              ]),
            );
            return (
              <div key={item.index} className="space-y-2 py-3.5 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-muted-foreground tabular-nums">
                      #{item.index + 1}
                    </span>
                    {item.id && (
                      <span className="font-mono text-muted-foreground break-all">
                        ID: {item.id}
                      </span>
                    )}
                    {item.sender && (
                      <span className="font-mono text-foreground break-all">
                        Sender: {item.sender}
                      </span>
                    )}
                    <VerdictInline
                      verdict={item.verdict}
                      label={
                        item.verdict === "malicious"
                          ? "Spam / Smishing"
                          : item.verdict === "review"
                            ? "Needs review"
                            : "Clean"
                      }
                    />
                    <span className="font-mono text-muted-foreground">
                      · {item.riskTier}
                    </span>
                  </div>

                  <span className="font-mono text-xs text-foreground tabular-nums">
                    {formatPercent(item.spamProbability)}
                  </span>
                </div>

                <pre
                  dir="auto"
                  className="font-mono text-xs text-foreground whitespace-pre-wrap break-words"
                >
                  {item.textExcerpt}
                </pre>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Language: {item.language ?? "Unavailable"}</span>
                  <span>Script: {item.script ?? "Unavailable"}</span>
                  {item.looksLikeOtp && <span>OTP pattern</span>}
                  {item.hasObfuscation && (
                    <span className="text-caution">
                      Obfuscation / lookalike cues
                    </span>
                  )}
                </div>

                {(allUrls.length > 0 ||
                  item.entities.phoneNumbers.length > 0 ||
                  item.entities.emails.length > 0 ||
                  item.entities.otpCodes.length > 0 ||
                  item.heuristicSignals.length > 0) && (
                  <div className="grid gap-4 pt-1 sm:grid-cols-2">
                    {allUrls.length > 0 && (
                      <InertList
                        title="Extracted URLs (inert)"
                        items={allUrls}
                      />
                    )}
                    {item.entities.phoneNumbers.length > 0 && (
                      <InertList
                        title="Phone numbers (inert)"
                        items={item.entities.phoneNumbers}
                      />
                    )}
                    {item.entities.emails.length > 0 && (
                      <InertList
                        title="Email addresses (inert)"
                        items={item.entities.emails}
                      />
                    )}
                    {item.entities.otpCodes.length > 0 && (
                      <InertList
                        title="Verification codes"
                        items={item.entities.otpCodes}
                      />
                    )}
                    {item.heuristicSignals.length > 0 && (
                      <InertList
                        title="Heuristic signals"
                        items={item.heuristicSignals}
                        mono={false}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const BRANCH_LABELS: Record<string, string> = {
  byte: "Byte Transformer",
  subword: "Subword RoBERTa",
  catboost_d6: "CatBoost (d6)",
  catboost_d8: "CatBoost (d8)",
  tfidf: "Char TF-IDF",
};

function UrlDetailsView({ details }: { details: UrlScanDetails }) {
  return (
    <div className="divide-y divide-outline/70">
      <div className="pb-3.5">
        <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Model & route</dt>
            <dd className="mt-0.5 font-mono text-foreground">
              {[details.modelId, details.route ? `route:${details.route}` : null]
                .filter(Boolean)
                .join(" · ") || "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Threshold</dt>
            <dd className="mt-0.5 font-mono text-foreground tabular-nums">
              {details.thresholdUsed !== null
                ? `${details.thresholdUsed.toFixed(4)}${details.thresholdOverridden ? " (custom)" : details.thresholdSource ? ` (${details.thresholdSource})` : ""}`
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bundle policy</dt>
            <dd className="mt-0.5 font-mono text-foreground">
              {[details.policyMode, details.policyStatus]
                .filter(Boolean)
                .join(" · ") || "shadow_only"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Mode</dt>
            <dd className="mt-0.5 font-mono text-foreground">
              {details.mode === "batch"
                ? `Batch (${details.items.length} URLs)`
                : "Single URL"}
            </dd>
          </div>
        </dl>

        {(details.bundleId || details.policyVersion) && (
          <p className="mt-2.5 font-mono text-xs text-muted-foreground break-all">
            {details.bundleId ? `Bundle: ${details.bundleId.slice(0, 16)}` : ""}
            {details.bundleId && details.policyVersion ? " · " : ""}
            {details.policyVersion
              ? `Policy SHA: ${details.policyVersion.slice(0, 16)}`
              : ""}
          </p>
        )}
      </div>

      {details.batchSummary && (
        <dl className="grid grid-cols-2 gap-4 py-3.5 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Total checked</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground tabular-nums">
              {details.batchSummary.totalUrls}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Malicious</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-danger tabular-nums">
              {details.batchSummary.maliciousCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Needs review</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-caution tabular-nums">
              {details.batchSummary.uncertainCount +
                details.batchSummary.unsupportedCount +
                details.batchSummary.unavailableCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Benign</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-positive tabular-nums">
              {details.batchSummary.benignCount}
            </dd>
          </div>
        </dl>
      )}

      <div className="divide-y divide-outline/60">
        {details.items.map((item) => {
          const branchEntries = item.branches
            ? Object.entries(item.branches.branchProbabilities)
            : [];
          const lexicalEntries = item.lexicalFeatures
            ? Object.entries(item.lexicalFeatures)
            : [];

          return (
            <div key={item.index} className="space-y-3 py-3.5 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-muted-foreground tabular-nums">
                    #{item.index + 1}
                  </span>
                  {item.id && (
                    <span className="font-mono text-muted-foreground break-all">
                      ID: {item.id}
                    </span>
                  )}
                  <VerdictInline
                    verdict={item.verdict}
                    label={
                      item.verdict === "malicious"
                        ? "Malicious"
                        : item.verdict === "review"
                          ? "Needs review"
                          : "Benign"
                    }
                  />
                  <span className="font-mono text-muted-foreground">
                    · <span className="text-foreground">{item.riskTier}</span>
                  </span>
                  <span className="font-mono text-muted-foreground">
                    · <span className="text-foreground">{item.inputKind}</span>
                  </span>
                  {item.parsedUrl?.isIp && (
                    <span className="font-mono text-xs text-caution">
                      · IP literal
                    </span>
                  )}
                  {item.parsedUrl?.isIdna && (
                    <span className="font-mono text-xs text-caution">
                      · IDNA
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
                  <span className="text-foreground">
                    {formatPercent(item.maliciousProbability)}
                  </span>
                  {item.predictionEntropy !== null && (
                    <span className="text-muted-foreground">
                      {item.predictionEntropy.toFixed(3)} nats
                    </span>
                  )}
                </div>
              </div>

              {/* Inert URL display row */}
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 flex-1 font-mono text-xs text-foreground break-all">
                  {item.url || "(empty)"}
                </span>
                {item.url && (
                  <CopyButton
                    value={item.url}
                    ariaLabel={`Copy inert URL #${item.index + 1}`}
                  />
                )}
              </div>

              {/* Parsed Host & Path Breakdown */}
              {item.parsedUrl && (
                <div className="space-y-1.5 border-t border-outline/50 pt-2">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Host &amp; Path Breakdown ({item.parsedUrl.status} ·{" "}
                    <span className="font-mono">{item.parsedUrl.reasonCode}</span>)
                  </h4>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-0.5 font-mono text-xs sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <dt className="font-sans text-muted-foreground">Scheme</dt>
                      <dd className="mt-0.5 text-foreground">
                        {item.parsedUrl.scheme || "(bare host)"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-sans text-muted-foreground">Host</dt>
                      <dd className="mt-0.5 text-foreground break-all">
                        {item.parsedUrl.host || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-sans text-muted-foreground">Model host</dt>
                      <dd className="mt-0.5 text-foreground break-all">
                        {item.parsedUrl.modelHost || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-sans text-muted-foreground">Public suffix</dt>
                      <dd className="mt-0.5 text-foreground">
                        {item.parsedUrl.suffix || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-sans text-muted-foreground">Port</dt>
                      <dd className="mt-0.5 text-foreground tabular-nums">
                        {item.parsedUrl.port ?? "Default"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-sans text-muted-foreground">Form</dt>
                      <dd className="mt-0.5 text-foreground">
                        {item.parsedUrl.inputForm}
                      </dd>
                    </div>
                    {item.parsedUrl.path && (
                      <div className="col-span-2 sm:col-span-3">
                        <dt className="font-sans text-muted-foreground">Path (inert)</dt>
                        <dd className="mt-0.5 text-foreground break-all">
                          {item.parsedUrl.path}
                        </dd>
                      </div>
                    )}
                    {item.parsedUrl.query && (
                      <div className="col-span-2 sm:col-span-3">
                        <dt className="font-sans text-muted-foreground">Query (inert)</dt>
                        <dd className="mt-0.5 text-foreground break-all">
                          {item.parsedUrl.query}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* 5-Branch Ensemble Breakdown */}
              {branchEntries.length > 0 && item.branches && (
                <div className="space-y-1.5 border-t border-outline/50 pt-2">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    5-branch fusion (route:{" "}
                    <span className="font-mono text-foreground">
                      {item.branches.route}
                    </span>
                    {item.branches.fusionLogit !== null
                      ? ` · logit: ${item.branches.fusionLogit.toFixed(4)}`
                      : ""}
                    )
                  </h4>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-0.5 text-xs sm:grid-cols-3 lg:grid-cols-5">
                    {branchEntries.map(([branchKey, prob]) => {
                      const logit = item.branches?.branchLogits[branchKey];
                      return (
                        <div key={branchKey}>
                          <dt className="truncate text-muted-foreground">
                            {BRANCH_LABELS[branchKey] ?? branchKey}
                          </dt>
                          <dd className="mt-0.5 font-mono text-foreground tabular-nums">
                            {formatPercent(prob)}
                            {typeof logit === "number" && (
                              <span className="ms-1 text-[0.6875rem] text-muted-foreground">
                                ({logit >= 0 ? "+" : ""}
                                {logit.toFixed(2)})
                              </span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              )}

              {/* 18 Static Lexical Features */}
              {lexicalEntries.length > 0 && (
                <details className="group border-t border-outline/50 pt-1.5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-medium text-accent hover:text-foreground">
                    <span>
                      Static lexical features ({lexicalEntries.length})
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="size-3 shrink-0 motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-180"
                      strokeWidth={1.75}
                    />
                  </summary>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-outline/50 pt-2 font-mono text-xs sm:grid-cols-3 lg:grid-cols-6">
                    {lexicalEntries.map(([featKey, featVal]) => (
                      <div key={featKey} className="flex min-w-0 items-baseline justify-between gap-2">
                        <dt className="truncate text-muted-foreground" title={featKey}>
                          {featKey}
                        </dt>
                        <dd className="shrink-0 text-foreground tabular-nums">
                          {Number.isInteger(featVal)
                            ? featVal
                            : featVal.toFixed(3)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScanTechnicalDetails({
  details,
  scanId,
}: ScanTechnicalDetailsProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-start text-xs font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground sm:px-5"
      >
        <span>
          {details.kind === "sms" && details.mode === "batch"
            ? `Technical evidence (${details.items.length} messages)`
            : details.kind === "url" && details.mode === "batch"
              ? `Technical evidence (${details.items.length} URLs)`
              : "Technical evidence"}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={1.75}
        />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="border-t border-outline px-4 py-4 sm:px-5"
      >
        {details.kind === "email" && <EmailDetailsView details={details} />}
        {details.kind === "exe" && <ExeDetailsView details={details} />}
        {details.kind === "office" && <OfficeDetailsView details={details} />}
        {details.kind === "pdf" && <PdfDetailsView details={details} />}
        {details.kind === "sms" && <SmsDetailsView details={details} />}
        {details.kind === "url" && <UrlDetailsView details={details} />}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-outline/70 pt-2.5">
          <p className="font-mono text-xs text-muted-foreground">
            Scan ID: <span className="text-foreground">{scanId}</span>
          </p>
          <CopyButton
            value={scanId}
            label="Copy ID"
            ariaLabel="Copy transient scan reference ID"
          />
        </div>
      </div>
    </div>
  );
}
