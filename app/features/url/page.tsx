import type { Metadata } from "next";
import { FeatureWorkspaceShell } from "@/components/features/feature-workspace-shell";
import { UrlScannerWorkspace } from "@/components/features/url-scanner-workspace";

export const metadata: Metadata = {
  title: "URL Phishing & Malware Scanner — Vanguard AV",
  description:
    "Inspect single or batch HTTP(S) URLs and bare domains offline for phishing patterns, suspicious subdomains, and obfuscated paths without visiting destinations.",
};

export default function UrlFeaturePage() {
  return (
    <FeatureWorkspaceShell slug="url">
      <UrlScannerWorkspace />
    </FeatureWorkspaceShell>
  );
}
