import type { Metadata } from "next";
import { FeatureWorkspaceShell } from "@/components/features/feature-workspace-shell";
import { FileScannerWorkspace } from "@/components/features/file-scanner-workspace";

export const metadata: Metadata = {
  title: "Windows Executable Scanner — Vanguard AV",
  description:
    "Statically inspect Windows PE binaries (.exe, .dll, .sys) for malware indicators, packing, and suspicious imports.",
};

export default function ExeFeaturePage() {
  return (
    <FeatureWorkspaceShell slug="exe">
      <FileScannerWorkspace slug="exe" />
    </FeatureWorkspaceShell>
  );
}
