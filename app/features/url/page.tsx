import type { Metadata } from "next";
import {
  UrlReadinessInline,
  UrlScannerWorkspace,
} from "@/components/features/url-scanner-workspace";

export const metadata: Metadata = {
  title: "URL Scanner — Vanguard AV",
  description:
    "Inspect HTTP(S) URLs and bare domains offline for phishing and malware without visiting destinations.",
};

export default function UrlFeaturePage() {
  return (
    <div className="w-full space-y-8 sm:pt-2">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-[1.75rem] sm:leading-tight">
            URL Scanner
          </h1>
          <UrlReadinessInline />
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          Checked offline — links are never fetched or opened.
        </p>
      </header>

      <UrlScannerWorkspace />
    </div>
  );
}
