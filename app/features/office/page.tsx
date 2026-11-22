import type { Metadata } from "next";
import { FeatureWorkspaceShell } from "@/components/features/feature-workspace-shell";
import { FileScannerWorkspace } from "@/components/features/file-scanner-workspace";

export const metadata: Metadata = {
  title: "Office Document Scanner — Vanguard AV",
  description:
    "Static analysis for Microsoft Office documents and RTF files without opening or running embedded code.",
};

export default function OfficeFeaturePage() {
  return (
    <FeatureWorkspaceShell slug="office">
      <FileScannerWorkspace slug="office" />
    </FeatureWorkspaceShell>
  );
}
