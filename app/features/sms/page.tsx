import type { Metadata } from "next";
import {
  SmsReadinessInline,
  SmsScannerWorkspace,
} from "@/components/features/sms-scanner-workspace";

export const metadata: Metadata = {
  title: "SMS Scanner — Vanguard AV",
  description:
    "Analyze single or batch multilingual SMS messages offline for spam, text-message phishing (smishing) links, and obfuscation.",
};

export default function SmsFeaturePage() {
  return (
    <div className="w-full space-y-8 sm:pt-2">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-[1.75rem] sm:leading-tight">
            SMS Scanner
          </h1>
          <SmsReadinessInline />
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          Checked offline — extracted links, numbers, and codes stay non-clickable.
        </p>
      </header>

      <SmsScannerWorkspace />
    </div>
  );
}
