"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { formatBytes, getFeatureDefinition } from "@/lib/features/catalog";
import { inspectBrowserFileSignature } from "@/lib/features/file-signature";
import type {
  ExecutionState,
  FileScannerSlug,
  PendingTriageHandoff,
  ScanApiResponse,
  ScanErrorResponse,
  ScanOutcome,
} from "@/lib/features/types";
import { AdvancedOptionsPanel } from "./advanced-options-panel";
import { CopyButton } from "./copy-button";
import { FileDropzone } from "./file-dropzone";
import { ScanResultPanel } from "./scan-result-panel";
import { useTriageHandoff } from "./workspace-provider";

interface FileScannerWorkspaceProps {
  slug: FileScannerSlug;
}

export function FileScannerWorkspace({ slug }: FileScannerWorkspaceProps) {
  const feature = getFeatureDefinition(slug);
  const { claimHandoff } = useTriageHandoff();
  const baseId = useId();
  const submittingRef = useRef(false);
  const selectionSeqRef = useRef(0);
  const scanSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handledHandoffIdRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [execState, setExecState] = useState<ExecutionState>("idle");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorResponse, setErrorResponse] = useState<ScanErrorResponse | null>(
    null,
  );
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [liveStatus, setLiveStatus] = useState("");

  // EXE advanced options (defaults match gateway contract)
  const [operatingPoint, setOperatingPoint] = useState<"fpr_1pct" | "fpr_0.1pct">(
    "fpr_1pct",
  );
  const [exeModelType, setExeModelType] = useState<"both" | "hybrid" | "gbdt">(
    "both",
  );
  const [exeThreshold, setExeThreshold] = useState("");
  const [exeDeepInspection, setExeDeepInspection] = useState(true);

  // PDF advanced options (defaults match gateway contract)
  const [pdfThreshold, setPdfThreshold] = useState("0.5");
  const [pdfEstimator, setPdfEstimator] = useState<
    "ensemble" | "rf" | "et" | "lr" | "lgbm"
  >("ensemble");
  const [pdfDeepInspection, setPdfDeepInspection] = useState(true);
  const [pdfIncludeFeatures, setPdfIncludeFeatures] = useState(false);

  async function handleFileSelect(next: File | null) {
    const seq = ++selectionSeqRef.current;
    setFile(next);
    setErrorResponse(null);

    if (!next) {
      setFieldErrors((prev) => ({ ...prev, file: "" }));
      setLiveStatus("Removed selected file.");
      return;
    }

    setFieldErrors((prev) => ({ ...prev, file: "" }));
    const signature = await inspectBrowserFileSignature(next, slug);
    if (seq !== selectionSeqRef.current) return;

    if (!signature.ok) {
      setFieldErrors((prev) => ({ ...prev, file: signature.message }));
      setLiveStatus(signature.message);
      return;
    }

    setLiveStatus(`Selected ${next.name} (${formatBytes(next.size)}).`);
  }

  async function runScan(overrideFile?: File, supersede = false) {
    if (submittingRef.current && !supersede) return;

    const targetFile = overrideFile ?? file;
    const nextErrors: Record<string, string> = {};
    if (!targetFile) {
      nextErrors.file = `Select a file (${feature.formatLabel}) to inspect.`;
    }

    if (slug === "exe" && exeThreshold.trim() !== "") {
      const parsed = Number(exeThreshold.trim());
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        nextErrors.threshold =
          "Sensitivity threshold must be a number between 0 and 1.";
      }
    }

    if (slug === "pdf" && pdfThreshold.trim() !== "") {
      const parsed = Number(pdfThreshold.trim());
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        nextErrors.threshold =
          "Sensitivity threshold must be a number between 0 and 1.";
      }
    }

    if (Object.keys(nextErrors).length > 0 || !targetFile) {
      setFieldErrors(nextErrors);
      setErrorResponse(null);
      setExecState("idle");
      setLiveStatus("Please fix the highlighted fields before starting the scan.");
      return;
    }

    if (supersede) {
      abortControllerRef.current?.abort();
    }
    const seq = ++scanSeqRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    submittingRef.current = true;
    setFieldErrors({});
    setErrorResponse(null);
    setExecState("submitting");
    setLiveStatus(`Validating and scanning ${targetFile.name} statically. Please wait...`);

    const signature = await inspectBrowserFileSignature(targetFile, slug);
    if (seq !== scanSeqRef.current) return;
    if (!signature.ok) {
      submittingRef.current = false;
      setFieldErrors({ file: signature.message });
      setErrorResponse(null);
      setExecState("idle");
      setLiveStatus(signature.message);
      return;
    }

    const formData = new FormData();
    formData.append("file", targetFile);

    if (slug === "exe") {
      formData.append("operatingPoint", operatingPoint);
      formData.append("modelType", exeModelType);
      if (exeThreshold.trim() !== "") {
        formData.append("threshold", exeThreshold.trim());
      }
      formData.append("deepInspection", String(exeDeepInspection));
    } else if (slug === "pdf") {
      if (pdfThreshold.trim() !== "") {
        formData.append("threshold", pdfThreshold.trim());
      }
      formData.append("estimator", pdfEstimator);
      formData.append("deepInspection", String(pdfDeepInspection));
      formData.append("includeFeatures", String(pdfIncludeFeatures));
    }

    try {
      const response = await fetch(feature.apiPath, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      if (seq !== scanSeqRef.current) return;

      const data = (await response.json()) as ScanApiResponse;
      if (seq !== scanSeqRef.current) return;
      if (!response.ok || data.status === "failed") {
        const err: ScanErrorResponse =
          data.status === "failed"
            ? data
            : {
                status: "failed",
                code: "upstream_error",
                message: "Could not complete this scan. Please try again.",
                retryable: true,
                diagnosticId: "client-fallback",
              };
        setErrorResponse(err);
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
        setExecState("failed");
        setLiveStatus(err.message);
        return;
      }

      setOutcome(data);
      setExecState("completed");
      setLiveStatus(`Scan completed: ${data.verdictLabel}.`);
    } catch {
      if (seq !== scanSeqRef.current) return;
      const networkErr: ScanErrorResponse = {
        status: "failed",
        code: "service_unavailable",
        message:
          "Network connection was interrupted before the scan finished. Your selected file and options were preserved — try again.",
        retryable: true,
        diagnosticId: "network-interrupted",
      };
      setErrorResponse(networkErr);
      setExecState("failed");
      setLiveStatus(networkErr.message);
    } finally {
      if (seq === scanSeqRef.current) {
        submittingRef.current = false;
        abortControllerRef.current = null;
      }
    }
  }

  function runScanWithHandoff(handoff: PendingTriageHandoff) {
    if (handoff.kind !== "file" || handoff.slug !== slug) return;
    selectionSeqRef.current += 1;
    abortControllerRef.current?.abort();
    submittingRef.current = false;
    setOutcome(null);
    setErrorResponse(null);
    setFieldErrors({});
    setExecState("idle");
    setFile(handoff.file);
    if (handoff.autoSubmit) {
      void runScan(handoff.file, true);
    }
  }

  const runScanWithHandoffRef = useRef(runScanWithHandoff);
  useEffect(() => {
    runScanWithHandoffRef.current = runScanWithHandoff;
  });

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const pending = claimHandoff(slug);
      if (!pending || pending.id === handledHandoffIdRef.current) return;
      handledHandoffIdRef.current = pending.id;
      runScanWithHandoffRef.current(pending);
    });
    return () => {
      active = false;
    };
  }, [claimHandoff, slug]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runScan();
  }

  function handleReset() {
    selectionSeqRef.current += 1;
    setFile(null);
    setOutcome(null);
    setErrorResponse(null);
    setFieldErrors({});
    setExecState("idle");
    setLiveStatus("Cleared previous scan. Ready to select another file.");
  }

  const isSubmitting = execState === "submitting";
  const hasFieldError = Boolean(fieldErrors.file || fieldErrors.threshold);

  return (
    <div className="space-y-6">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      <form
        onSubmit={handleSubmit}
        noValidate
        className={`workspace-panel divide-y divide-outline overflow-hidden rounded-2xl border bg-surface motion-safe:transition-colors motion-safe:duration-150 ${
          hasFieldError ? "border-danger" : "border-outline"
        }`}
      >
        <FileDropzone
          label={`File to inspect (${feature.shortLabel})`}
          formatLabel={feature.formatLabel}
          limitLabel={feature.limitLabel}
          acceptedExtensions={feature.acceptedExtensions}
          file={file}
          disabled={isSubmitting}
          submitting={isSubmitting}
          error={fieldErrors.file}
          submitLabel={
            isSubmitting
              ? "Scanning..."
              : `Scan ${feature.shortLabel.toLowerCase()}`
          }
          onFileSelect={(next) => {
            void handleFileSelect(next);
          }}
        />

        {slug === "exe" && (
          <AdvancedOptionsPanel>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label
                  htmlFor={`${baseId}-op`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Alert sensitivity profile
                </label>
                <select
                  id={`${baseId}-op`}
                  value={operatingPoint}
                  disabled={isSubmitting}
                  onChange={(e) =>
                    setOperatingPoint(
                      e.currentTarget.value as "fpr_1pct" | "fpr_0.1pct",
                    )
                  }
                  className="min-h-11 rounded-lg border border-border-control bg-canvas px-3 text-sm text-foreground focus:border-accent disabled:opacity-60"
                >
                  <option value="fpr_1pct">Balanced (fewer missed threats)</option>
                  <option value="fpr_0.1pct">Strict (fewer false alarms)</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor={`${baseId}-model`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Inspection strategy
                </label>
                <select
                  id={`${baseId}-model`}
                  value={exeModelType}
                  disabled={isSubmitting}
                  onChange={(e) =>
                    setExeModelType(
                      e.currentTarget.value as "both" | "hybrid" | "gbdt",
                    )
                  }
                  className="min-h-11 rounded-lg border border-border-control bg-canvas px-3 text-sm text-foreground focus:border-accent disabled:opacity-60"
                >
                  <option value="both">
                    Balanced multi-model scan (recommended)
                  </option>
                  <option value="hybrid">Byte-sequence pattern scan</option>
                  <option value="gbdt">Fast structural analysis</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor={`${baseId}-exe-threshold`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Sensitivity threshold (0–1)
                </label>
                <input
                  id={`${baseId}-exe-threshold`}
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  min="0"
                  max="1"
                  value={exeThreshold}
                  disabled={isSubmitting}
                  placeholder="Profile default"
                  aria-invalid={fieldErrors.threshold ? true : undefined}
                  aria-describedby={`${baseId}-exe-threshold-help`}
                  onChange={(e) => {
                    setExeThreshold(e.currentTarget.value);
                    if (fieldErrors.threshold) {
                      setFieldErrors((prev) => ({ ...prev, threshold: "" }));
                    }
                  }}
                  className={`min-h-11 rounded-lg border bg-canvas px-3 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground/80 focus:border-accent disabled:opacity-60 ${
                    fieldErrors.threshold ? "border-danger" : "border-border-control"
                  }`}
                />
                <p
                  id={`${baseId}-exe-threshold-help`}
                  className="text-xs text-muted-foreground"
                >
                  Detection sensitivity threshold from 0 to 1 (lower values flag more borderline files; default 0.50).
                </p>
                {fieldErrors.threshold && (
                  <p role="alert" className="text-xs font-medium text-danger">
                    {fieldErrors.threshold}
                  </p>
                )}
              </div>

              <div className="flex min-h-11 items-start gap-2.5 pt-1 sm:pt-6">
                <input
                  id={`${baseId}-exe-deep`}
                  type="checkbox"
                  checked={exeDeepInspection}
                  disabled={isSubmitting}
                  onChange={(e) => setExeDeepInspection(e.currentTarget.checked)}
                  className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
                />
                <label
                  htmlFor={`${baseId}-exe-deep`}
                  className="cursor-pointer text-sm text-foreground"
                >
                  Extended static binary inspection
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Inspect file headers, section layout, and digital signature metadata without executing code.
                  </span>
                </label>
              </div>
            </div>
          </AdvancedOptionsPanel>
        )}

        {slug === "pdf" && (
          <AdvancedOptionsPanel>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label
                  htmlFor={`${baseId}-pdf-threshold`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Sensitivity threshold (0–1)
                </label>
                <input
                  id={`${baseId}-pdf-threshold`}
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  min="0"
                  max="1"
                  value={pdfThreshold}
                  disabled={isSubmitting}
                  aria-invalid={fieldErrors.threshold ? true : undefined}
                  aria-describedby={`${baseId}-pdf-threshold-help`}
                  onChange={(e) => {
                    setPdfThreshold(e.currentTarget.value);
                    if (fieldErrors.threshold) {
                      setFieldErrors((prev) => ({ ...prev, threshold: "" }));
                    }
                  }}
                  className={`min-h-11 rounded-lg border bg-canvas px-3 font-mono text-sm text-foreground focus:border-accent disabled:opacity-60 ${
                    fieldErrors.threshold ? "border-danger" : "border-border-control"
                  }`}
                />
                <p
                  id={`${baseId}-pdf-threshold-help`}
                  className="text-xs text-muted-foreground"
                >
                  Detection sensitivity threshold from 0 to 1 (lower values flag more borderline files; default 0.50).
                </p>
                {fieldErrors.threshold && (
                  <p role="alert" className="text-xs font-medium text-danger">
                    {fieldErrors.threshold}
                  </p>
                )}
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor={`${baseId}-pdf-est`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Inspection strategy
                </label>
                <select
                  id={`${baseId}-pdf-est`}
                  value={pdfEstimator}
                  disabled={isSubmitting}
                  onChange={(e) =>
                    setPdfEstimator(
                      e.currentTarget.value as
                        | "ensemble"
                        | "rf"
                        | "et"
                        | "lr"
                        | "lgbm",
                    )
                  }
                  className="min-h-11 rounded-lg border border-border-control bg-canvas px-3 text-sm text-foreground focus:border-accent disabled:opacity-60"
                >
                  <option value="ensemble">
                    Balanced multi-model scan (recommended)
                  </option>
                  <option value="lgbm">Fast structural analysis</option>
                  <option value="rf">Broad tree consensus</option>
                  <option value="et">Fine-grained structure patterns</option>
                  <option value="lr">Lightweight linear baseline</option>
                </select>
              </div>

              <div className="flex min-h-11 items-start gap-2.5">
                <input
                  id={`${baseId}-pdf-deep`}
                  type="checkbox"
                  checked={pdfDeepInspection}
                  disabled={isSubmitting}
                  onChange={(e) => setPdfDeepInspection(e.currentTarget.checked)}
                  className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
                />
                <label
                  htmlFor={`${baseId}-pdf-deep`}
                  className="cursor-pointer text-sm text-foreground"
                >
                  Extended static PDF inspection
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Inspect embedded scripts, launch actions, and document metadata statically.
                  </span>
                </label>
              </div>

              <div className="flex min-h-11 items-start gap-2.5">
                <input
                  id={`${baseId}-pdf-features`}
                  type="checkbox"
                  checked={pdfIncludeFeatures}
                  disabled={isSubmitting}
                  onChange={(e) => setPdfIncludeFeatures(e.currentTarget.checked)}
                  className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
                />
                <label
                  htmlFor={`${baseId}-pdf-features`}
                  className="cursor-pointer text-sm text-foreground"
                >
                  Include raw inspection metrics
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Attach detailed numerical measurements inside Technical Evidence.
                  </span>
                </label>
              </div>
            </div>
          </AdvancedOptionsPanel>
        )}

        {isSubmitting && (
          <div
            aria-busy="true"
            className="px-4 py-2.5 text-xs text-muted-foreground sm:px-5"
          >
            Inspecting {feature.shortLabel.toLowerCase()} structure statically without executing the file...
          </div>
        )}

        {errorResponse && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 bg-danger-bg/20 px-4 py-2.5 text-xs sm:px-5"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <AlertCircle
                aria-hidden="true"
                className="size-3.5 shrink-0 text-danger"
                strokeWidth={1.75}
              />
              <span className="font-medium text-foreground break-words">
                {errorResponse.message}
              </span>
              <span className="font-mono text-muted-foreground">
                · {errorResponse.diagnosticId}
              </span>
              <CopyButton
                value={errorResponse.diagnosticId}
                ariaLabel="Copy diagnostic reference ID"
              />
            </div>

            {errorResponse.retryable && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void runScan()}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border-control bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover active:bg-surface-selected"
              >
                <RefreshCw aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}
      </form>

      {outcome && !isSubmitting && (
        <ScanResultPanel outcome={outcome} onReset={handleReset} />
      )}
    </div>
  );
}
