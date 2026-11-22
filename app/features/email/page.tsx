import type { Metadata } from "next";
import {
  EmailReadinessInline,
  EmailScannerWorkspace,
} from "@/components/features/email-scanner-workspace";

export const metadata: Metadata = {
  title: "Email Scanner — Vanguard AV",
  description:
    "Statically inspect raw .eml email files for phishing, fraud, inert links, and attachments.",
};

export default function EmailFeaturePage() {
  return (
    <div className="w-full space-y-8 sm:pt-2">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-[1.75rem] sm:leading-tight">
            Email Scanner
          </h1>
          <EmailReadinessInline />
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          Checked statically — links are never fetched and attachments are never opened.
        </p>
      </header>

      <EmailScannerWorkspace />
    </div>
  );
}
