import type { Metadata } from "next";
import {
  OfficeReadinessInline,
  OfficeScannerWorkspace,
} from "@/components/features/office-scanner-workspace";

export const metadata: Metadata = {
  title: "Office Scanner — Vanguard AV",
  description:
    "Statically inspect Word, Excel, PowerPoint, and RTF files for malicious macros, embedded objects, and structural anomalies.",
};

export default function OfficeFeaturePage() {
  return (
    <div className="w-full space-y-8 sm:pt-2">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-[1.75rem] sm:leading-tight">
            Office Scanner
          </h1>
          <OfficeReadinessInline />
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          Checked statically — macros and external templates are never executed.
        </p>
      </header>

      <OfficeScannerWorkspace />
    </div>
  );
}
