import type { Metadata } from "next";
import {
  PdfReadinessInline,
  PdfScannerWorkspace,
} from "@/components/features/pdf-scanner-workspace";

export const metadata: Metadata = {
  title: "PDF Scanner — Vanguard AV",
  description:
    "Statically inspect PDF documents for embedded scripts, auto-actions, launch triggers, and malicious payloads.",
};

export default function PdfFeaturePage() {
  return (
    <div className="w-full space-y-8 sm:pt-2">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-[1.75rem] sm:leading-tight">
            PDF Scanner
          </h1>
          <PdfReadinessInline />
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          Checked statically — embedded scripts and external URIs are never executed.
        </p>
      </header>

      <PdfScannerWorkspace />
    </div>
  );
}
