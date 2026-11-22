import type { Metadata } from "next";
import { FeatureWorkspaceShell } from "@/components/features/feature-workspace-shell";
import { FileScannerWorkspace } from "@/components/features/file-scanner-workspace";

export const metadata: Metadata = {
  title: "PDF Document Scanner — Vanguard AV",
  description:
    "Statically inspect PDF documents for embedded scripts, auto-actions, launch triggers, and malicious payloads.",
};

export default function PdfFeaturePage() {
  return (
    <FeatureWorkspaceShell slug="pdf">
      <FileScannerWorkspace slug="pdf" />
    </FeatureWorkspaceShell>
  );
}
