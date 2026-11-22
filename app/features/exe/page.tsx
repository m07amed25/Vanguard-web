import type { Metadata } from "next";
import {
  ExeReadinessInline,
  ExeScannerWorkspace,
} from "@/components/features/exe-scanner-workspace";

export const metadata: Metadata = {
  title: "Executable Scanner — Vanguard AV",
  description:
    "Statically inspect Windows PE binaries (.exe, .dll, .sys) for malware indicators, packing, and suspicious imports.",
};

export default function ExeFeaturePage() {
  return (
    <div className="w-full space-y-8 sm:pt-2">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-[1.75rem] sm:leading-tight">
            Executable Scanner
          </h1>
          <ExeReadinessInline />
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          Checked statically — uploaded binaries are never executed, and bytes are discarded after scoring.
        </p>
      </header>

      <ExeScannerWorkspace />
    </div>
  );
}
