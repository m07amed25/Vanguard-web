"use client";

import { RefreshCw } from "lucide-react";
import type { FeatureSlug } from "@/lib/features/types";
import { ReadinessBadge } from "./readiness-badge";
import { useReadiness } from "./workspace-provider";

interface FeatureReadinessClientProps {
  slug: FeatureSlug;
}

export function FeatureReadinessClient({ slug }: FeatureReadinessClientProps) {
  const {
    snapshot,
    isChecking,
    isInitialLoading,
    refreshError,
    refreshHealth,
  } = useReadiness();

  const current = snapshot.features[slug];
  const badgeStatus = isInitialLoading
    ? "checking"
    : current?.ready
      ? "ready"
      : "unavailable";

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-2"
      >
        <ReadinessBadge
          status={badgeStatus}
          latencyMs={current?.latencyMs ?? null}
        />
        <button
          type="button"
          onClick={() => void refreshHealth()}
          disabled={isChecking}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border-control bg-canvas px-3 text-xs font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected disabled:cursor-default disabled:opacity-60"
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-3.5 shrink-0 ${
              isChecking ? "motion-safe:animate-spin motion-reduce:hidden" : ""
            }`}
            strokeWidth={1.75}
          />
          <span>{isChecking ? "Checking..." : "Refresh"}</span>
        </button>
      </div>

      {refreshError && (
        <p role="status" aria-live="polite" className="text-xs text-caution">
          {refreshError}
        </p>
      )}
    </div>
  );
}
