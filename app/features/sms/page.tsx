import type { Metadata } from "next";
import { FeatureWorkspaceShell } from "@/components/features/feature-workspace-shell";
import { SmsScannerWorkspace } from "@/components/features/sms-scanner-workspace";

export const metadata: Metadata = {
  title: "SMS Spam & Smishing Scanner — Vanguard AV",
  description:
    "Analyze single or batch multilingual SMS messages offline for spam, text-message phishing (smishing) links, and obfuscation.",
};

export default function SmsFeaturePage() {
  return (
    <FeatureWorkspaceShell slug="sms">
      <SmsScannerWorkspace />
    </FeatureWorkspaceShell>
  );
}
