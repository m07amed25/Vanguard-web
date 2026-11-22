import type { Metadata } from "next";
import { EmailScannerWorkspace } from "@/components/features/email-scanner-workspace";
import { FeatureWorkspaceShell } from "@/components/features/feature-workspace-shell";

export const metadata: Metadata = {
  title: "Email Scanner — Vanguard AV",
  description:
    "Statically inspect raw .eml email files for phishing, fraud, inert links, and attachments.",
};

export default function EmailFeaturePage() {
  return (
    <FeatureWorkspaceShell slug="email">
      <EmailScannerWorkspace />
    </FeatureWorkspaceShell>
  );
}
