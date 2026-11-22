import type { ReactNode } from "react";
import { getFeatureDefinition } from "@/lib/features/catalog";
import type { FeatureSlug } from "@/lib/features/types";
import { FeatureReadinessClient } from "./feature-readiness-client";

interface FeatureWorkspaceShellProps {
  slug: FeatureSlug;
  children: ReactNode;
}

export function FeatureWorkspaceShell({
  slug,
  children,
}: FeatureWorkspaceShellProps) {
  const feature = getFeatureDefinition(slug);

  return (
    <div className="w-full space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl leading-[1.1] font-medium tracking-[-0.025em] text-foreground sm:text-4xl">
            {feature.name}
          </h1>

          <div className="shrink-0">
            <FeatureReadinessClient slug={slug} />
          </div>
        </div>

        <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground">
          {feature.summary}
        </p>

        <p className="max-w-[75ch] text-xs leading-5 text-muted-foreground break-words">
          <span className="font-mono text-foreground/85">
            {feature.formatLabel}
          </span>
          <span aria-hidden="true" className="mx-2 text-outline">
            ·
          </span>
          <span className="tabular-nums">{feature.limitLabel}</span>
          <span aria-hidden="true" className="mx-2 text-outline">
            ·
          </span>
          <span>{feature.staticSafetyNote}</span>
        </p>
      </header>

      {children}
    </div>
  );
}
