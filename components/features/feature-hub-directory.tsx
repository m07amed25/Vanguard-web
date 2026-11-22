"use client";

import { ArrowUpRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { FEATURE_CATALOG } from "@/lib/features/catalog";
import type { FeatureSlug } from "@/lib/features/types";
import { FeatureIcon } from "./feature-icon";
import { ReadinessBadge } from "./readiness-badge";
import { useReadiness } from "./workspace-provider";

const SCANNER_CUES: Record<FeatureSlug, string> = {
  url: "Links & domains",
  email: "Raw .eml messages",
  sms: "Text messages",
  office: "Word, Excel, PowerPoint, RTF",
  pdf: "PDF documents",
  exe: "Windows .exe, .dll, .sys",
};

function getAggregateMessage(
  overallStatus: "healthy" | "degraded" | "down" | "unconfigured",
): string | null {
  switch (overallStatus) {
    case "unconfigured":
      return "Scanning services are not connected in this environment.";
    case "down":
      return "Scanning services could not be reached.";
    case "degraded":
      return "Some scanning services are temporarily unavailable.";
    case "healthy":
      return null;
  }
}

export function FeatureHubDirectory() {
  const {
    snapshot,
    isChecking,
    isInitialLoading,
    refreshError,
    refreshHealth,
  } = useReadiness();

  const degradedDetail = isInitialLoading
    ? null
    : getAggregateMessage(snapshot.overallStatus);

  return (
    <section aria-labelledby="hub-scanners-heading" className="space-y-1.5">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 px-2 sm:px-3">
          <h2
            id="hub-scanners-heading"
            className="text-xs font-medium text-muted-foreground"
          >
            Scanners
          </h2>

          <div className="flex items-center gap-1">
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-xs"
            >
              {isInitialLoading ? (
                <>
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full border border-info bg-info/40 motion-safe:animate-pulse forced-colors:border-[CanvasText]"
                  />
                  <span className="text-muted-foreground">Checking…</span>
                </>
              ) : snapshot.overallStatus === "healthy" ? (
                <>
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full border border-transparent bg-positive forced-colors:border-[CanvasText]"
                  />
                  <span className="text-muted-foreground tabular-nums">
                    {snapshot.readyCount}/{snapshot.totalCount} ready
                  </span>
                </>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rotate-45 border border-transparent bg-caution forced-colors:border-[CanvasText]"
                  />
                  <span className="font-medium text-caution tabular-nums">
                    {snapshot.readyCount}/{snapshot.totalCount} ready
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              disabled={isChecking}
              aria-label="Refresh scanner status"
              title="Refresh scanner status"
              onClick={() => void refreshHealth()}
              className="-me-3 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface hover:text-foreground active:bg-surface-selected disabled:cursor-default disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-3.5 shrink-0 ${
                  isChecking ? "motion-safe:animate-spin motion-reduce:hidden" : ""
                }`}
                strokeWidth={1.75}
              />
            </button>
          </div>
        </div>

        {(degradedDetail || refreshError) && (
          <p
            role="status"
            aria-live="polite"
            className="px-2 text-xs text-caution sm:px-3"
          >
            {refreshError ?? degradedDetail}
          </p>
        )}
      </div>

      <ul className="divide-y divide-outline border-y border-outline">
        {FEATURE_CATALOG.map((feature) => {
          const readiness = snapshot.features[feature.slug];
          const badgeStatus = isInitialLoading
            ? "checking"
            : readiness?.ready
              ? "ready"
              : "unavailable";

          return (
            <li key={feature.slug}>
              <Link
                href={feature.route}
                className="group flex min-h-12 items-center justify-between gap-4 px-2 py-3 motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface sm:px-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FeatureIcon
                    iconKey={feature.iconKey}
                    className="size-4 shrink-0 text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 group-hover:text-accent"
                  />

                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 sm:flex-nowrap sm:gap-x-3">
                    <span className="text-sm font-medium text-foreground group-hover:text-accent sm:w-24 sm:shrink-0">
                      {feature.shortLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {SCANNER_CUES[feature.slug]}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <ReadinessBadge status={badgeStatus} compact />
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent"
                    strokeWidth={1.75}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
