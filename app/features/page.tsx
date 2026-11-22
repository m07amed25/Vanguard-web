import type { Metadata } from "next";
import { FeatureHubDirectory } from "@/components/features/feature-hub-directory";
import { ImmediateTriageWorkbench } from "@/components/features/immediate-triage-workbench";

export const metadata: Metadata = {
  title: "Security Scanners — Vanguard AV",
  description:
    "Inspect suspicious URLs, emails, SMS messages, Office documents, PDFs, or Windows executables statically without executing files or visiting links.",
};

export default function FeaturesHubPage() {
  return (
    <div className="mx-auto w-full max-w-[42rem] space-y-10 sm:pt-4">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-[1.75rem] sm:leading-tight">
          Security Scanners
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Static inspection only — files never run, links never open.
        </p>
      </header>

      <ImmediateTriageWorkbench />

      <FeatureHubDirectory />
    </div>
  );
}
