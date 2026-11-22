"use client";

import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Paperclip,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { formatBytes, getFeatureDefinition } from "@/lib/features/catalog";
import { inspectBrowserFileSignature } from "@/lib/features/file-signature";
import type {
  ExecutionState,
  PendingTriageHandoff,
  ScanApiResponse,
  ScanErrorResponse,
  ScanOutcome,
} from "@/lib/features/types";
import { CopyButton } from "./copy-button";
import { ExeScanResult } from "./exe-scan-result";
import { useReadiness, useTriageHandoff } from "./workspace-provider";

type ExeOperatingPoint = "fpr_1pct" | "fpr_0.1pct";
type ExeModelType = "both" | "hybrid" | "gbdt";

const OPERATING_POINT_LABELS: Record<ExeOperatingPoint, string> = {
  fpr_1pct: "Balanced",
  "fpr_0.1pct": "Strict",
};

const MODEL_TYPE_LABELS: Record<ExeModelType, string> = {
  both: "Combined",
  hybrid: "Byte-sequence",
  gbdt: "Structural",
};

export function ExeReadinessInline() {
  const {
    snapshot,
    isChecking,
    isInitialLoading,
    refreshError,
    refreshHealth,
  } = useReadiness();

  const current = snapshot.features.exe;
  const isReady = !isInitialLoading && Boolean(current?.ready);
  const isUnavailable = !isInitialLoading && !current?.ready;

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex items-center gap-1">
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-1.5 text-xs"
        >
          {isInitialLoading && (
            <>
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full border border-info bg-info/40 motion-safe:animate-pulse forced-colors:border-[CanvasText]"
              />
              <span className="text-muted-foreground">Checking…</span>
            </>
          )}
          {isReady && (
            <>
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full border border-transparent bg-positive forced-colors:border-[CanvasText]"
              />
              <span className="text-muted-foreground">Ready</span>
            </>
          )}
          {isUnavailable && (
            <>
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rotate-45 border border-transparent bg-caution forced-colors:border-[CanvasText]"
              />
              <span className="font-medium text-caution">Unavailable</span>
            </>
          )}
        </div>

        <button
          type="button"
          disabled={isChecking}
          aria-label="Refresh executable scanner status"
          title="Refresh executable scanner status"
          onClick={() => void refreshHealth()}
          className="-me-3 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface hover:text-foreground active:bg-surface-selected disabled:cursor-default disabled:opacity-50"
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-3.5 shrink-0 ${
              isChecking ? "motion-safe:animate-spin motion-reduce:hidden" : ""
            }`}
            strokeWidth={1.75}
          />
        </button>
      </div>

      {refreshError && (
        <p role="status" aria-live="polite" className="text-xs text-caution">
          {refreshError}
        </p>
      )}
    </div>
  );
}

export function ExeScannerWorkspace() {
  const feature = getFeatureDefinition("exe");
  const { claimHandoff } = useTriageHandoff();
  const baseId = useId();
  const fileInputId = `${baseId}-file`;
  const helpId = `${baseId}-help`;
  const fileErrorId = `${baseId}-file-error`;
  const optionsPanelId = `${baseId}-options`;
  const opId = `${baseId}-op`;
  const modelId = `${baseId}-model`;
  const thresholdId = `${baseId}-threshold`;
  const thresholdHelpId = `${baseId}-threshold-help`;
  const thresholdErrorId = `${baseId}-threshold-error`;
  const deepId = `${baseId}-deep`;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const selectionSeqRef = useRef(0);
  const scanSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handledHandoffIdRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [execState, setExecState] = useState<ExecutionState>("idle");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorResponse, setErrorResponse] = useState<ScanErrorResponse | null>(
    null,
  );
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [liveStatus, setLiveStatus] = useState("");

  // EXE scan options (tucked behind quiet Options disclosure; defaults match gateway)
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [operatingPoint, setOperatingPoint] =
    useState<ExeOperatingPoint>("fpr_1pct");
  const [modelType, setModelType] = useState<ExeModelType>("both");
  const [threshold, setThreshold] = useState("");
  const [deepInspection, setDeepInspection] = useState(true);

  const isSubmitting = execState === "submitting";

  function openPicker() {
    if (isSubmitting) return;
    fileInputRef.current?.click();
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSubmitting) setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    if (isSubmitting) return;
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) {
      void handleFileSelect(dropped);
    }
  }

  async function handleFileSelect(next: File | null) {
    const seq = ++selectionSeqRef.current;
    setFile(next);
    setOutcome(null);
    setErrorResponse(null);
    setExecState("idle");

    if (!next) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setFieldErrors((prev) => ({ ...prev, file: "" }));
      setLiveStatus("Removed selected Windows binary.");
      return;
    }

    setFieldErrors((prev) => ({ ...prev, file: "" }));
    const signature = await inspectBrowserFileSignature(next, "exe");
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
      nextErrors.file = "Select a .exe, .dll, or .sys file to inspect.";
    }

    const trimmedThreshold = threshold.trim();
    if (trimmedThreshold !== "") {
      const parsed = Number(trimmedThreshold);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        nextErrors.threshold =
          "Sensitivity threshold must be a number between 0 and 1.";
      }
    }

    if (Object.keys(nextErrors).length > 0 || !targetFile) {
      setFieldErrors(nextErrors);
      if (nextErrors.threshold) {
        setOptionsOpen(true);
      }
      setErrorResponse(null);
      setExecState("idle");
      setLiveStatus("Fix the highlighted input before starting the scan.");
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
    setLiveStatus(
      `Validating and scanning ${targetFile.name} statically. Please wait.`,
    );

    const signature = await inspectBrowserFileSignature(targetFile, "exe");
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
    formData.append("operatingPoint", operatingPoint);
    formData.append("modelType", modelType);
    if (trimmedThreshold !== "") {
      formData.append("threshold", trimmedThreshold);
    }
    formData.append("deepInspection", String(deepInspection));

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
                message:
                  "Could not complete this binary scan. Please try again.",
                retryable: true,
                diagnosticId: "client-fallback",
              };
        setErrorResponse(err);
        if (err.fieldErrors) {
          setFieldErrors(err.fieldErrors);
          if (
            err.fieldErrors.threshold ||
            err.fieldErrors.operatingPoint ||
            err.fieldErrors.modelType
          ) {
            setOptionsOpen(true);
          }
        }
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
          "Connection was interrupted before the scan finished. Your selected binary is preserved — try again.",
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
    if (handoff.kind !== "file" || handoff.slug !== "exe") return;
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
      const pending = claimHandoff("exe");
      if (!pending || pending.id === handledHandoffIdRef.current) return;
      handledHandoffIdRef.current = pending.id;
      runScanWithHandoffRef.current(pending);
    });
    return () => {
      active = false;
    };
  }, [claimHandoff]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runScan();
  }

  function handleReset() {
    selectionSeqRef.current += 1;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setFile(null);
    setOutcome(null);
    setErrorResponse(null);
    setFieldErrors({});
    setExecState("idle");
    setLiveStatus("Cleared scan result. Ready for another Windows binary.");
  }

  const parsedThreshold = Number(threshold.trim());
  const thresholdSummary =
    threshold.trim() !== "" && Number.isFinite(parsedThreshold)
      ? parsedThreshold.toFixed(2)
      : null;
  const optionsSummaryParts = [
    MODEL_TYPE_LABELS[modelType],
    OPERATING_POINT_LABELS[operatingPoint],
    ...(thresholdSummary ? [thresholdSummary] : []),
    ...(deepInspection ? [] : ["Basic"]),
  ];

  return (
    <div className="space-y-8">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      <form
        id="features-exe-workbench"
        onSubmit={handleSubmit}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        noValidate
        className={`space-y-3 rounded-xl motion-safe:transition-[outline-color] motion-safe:duration-150 ${
          dragging ? "outline-2 outline-dashed outline-accent outline-offset-8" : ""
        }`}
      >
        <label htmlFor={fileInputId} className="sr-only">
          Windows binary (.exe, .dll, .sys)
        </label>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          tabIndex={-1}
          aria-hidden="true"
          accept={feature.acceptedExtensions.join(",")}
          disabled={isSubmitting}
          className="sr-only"
          onChange={(event) => {
            const chosen = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = "";
            void handleFileSelect(chosen);
          }}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium">
            Windows binary (.exe, .dll, .sys)
          </span>
          <span className="font-mono tabular-nums">Up to 25 MiB</span>
        </div>

        <div
          className={`flex flex-col gap-3 rounded-xl border bg-transparent px-4 py-3 motion-safe:transition-colors motion-safe:duration-150 sm:flex-row sm:items-center sm:justify-between ${
            fieldErrors.file ? "border-danger" : "border-border-control"
          }`}
        >
          <div className="min-w-0 flex-1">
            {file ? (
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <Paperclip
                  aria-hidden="true"
                  className="size-4 shrink-0 text-accent"
                  strokeWidth={1.75}
                />
                <span
                  className="truncate font-mono text-foreground"
                  title={file.name}
                >
                  {file.name}
                </span>
                <span
                  id={helpId}
                  className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
                >
                  {formatBytes(file.size)}
                </span>
                <CopyButton
                  value={file.name}
                  ariaLabel="Copy selected binary filename"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Upload
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <p id={helpId}>
                  Drop a{" "}
                  <span className="font-mono text-foreground/90">.exe</span>,{" "}
                  <span className="font-mono text-foreground/90">.dll</span>, or{" "}
                  <span className="font-mono text-foreground/90">.sys</span>{" "}
                  file here, or choose one.
                </p>
              </div>
            )}
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            {file && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleFileSelect(null)}
                aria-label="Remove selected Windows binary"
                className="inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-transparent text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
              </button>
            )}

            <button
              type="button"
              disabled={isSubmitting}
              aria-describedby={fieldErrors.file ? `${helpId} ${fileErrorId}` : helpId}
              onClick={openPicker}
              className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-transparent px-3.5 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected disabled:cursor-default disabled:opacity-50 sm:flex-none"
            >
              {file ? "Change" : "Choose file"}
            </button>

            <button
              id="features-exe-submit"
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-12 flex-[2_1_0%] cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-on-primary motion-safe:transition-colors motion-safe:duration-150 hover:bg-primary-hover active:bg-primary-pressed disabled:cursor-default disabled:bg-surface-raised disabled:text-muted-foreground sm:flex-none"
            >
              {isSubmitting && (
                <Loader2
                  aria-hidden="true"
                  className="size-4 shrink-0 motion-safe:animate-spin motion-reduce:hidden"
                  strokeWidth={1.75}
                />
              )}
              <span>{isSubmitting ? "Scanning…" : "Scan binary"}</span>
            </button>
          </div>
        </div>

        {/* Quiet collapsed options disclosure */}
        <div className="border-b border-outline">
          <button
            type="button"
            aria-expanded={optionsOpen}
            aria-controls={optionsPanelId}
            onClick={() => setOptionsOpen((prev) => !prev)}
            className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 py-2 text-start text-xs motion-safe:transition-colors motion-safe:duration-150 hover:text-foreground"
          >
            <span className="font-medium text-muted-foreground">Options</span>

            <span className="flex items-center gap-2 font-mono tabular-nums text-muted-foreground">
              <span>{optionsSummaryParts.join(" · ")}</span>
              <ChevronDown
                aria-hidden="true"
                className={`size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150 ${
                  optionsOpen ? "rotate-180" : ""
                }`}
                strokeWidth={1.75}
              />
            </span>
          </button>

          <div
            id={optionsPanelId}
            hidden={!optionsOpen}
            className="border-t border-outline/70 py-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label
                  htmlFor={opId}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Alert sensitivity
                </label>
                <select
                  id={opId}
                  value={operatingPoint}
                  disabled={isSubmitting}
                  onChange={(e) =>
                    setOperatingPoint(e.currentTarget.value as ExeOperatingPoint)
                  }
                  className="min-h-11 rounded-lg border border-border-control bg-canvas px-3 text-sm text-foreground focus:border-accent disabled:opacity-60"
                >
                  <option value="fpr_1pct">
                    Balanced (fewer missed threats)
                  </option>
                  <option value="fpr_0.1pct">
                    Strict (fewer false alarms)
                  </option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor={modelId}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Inspection strategy
                </label>
                <select
                  id={modelId}
                  value={modelType}
                  disabled={isSubmitting}
                  onChange={(e) =>
                    setModelType(e.currentTarget.value as ExeModelType)
                  }
                  className="min-h-11 rounded-lg border border-border-control bg-canvas px-3 text-sm text-foreground focus:border-accent disabled:opacity-60"
                >
                  <option value="both">
                    Combined multi-model scan (recommended)
                  </option>
                  <option value="hybrid">Byte-sequence pattern scan</option>
                  <option value="gbdt">Fast structural analysis</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor={thresholdId}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Sensitivity threshold (0–1)
                </label>
                <input
                  id={thresholdId}
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  min="0"
                  max="1"
                  value={threshold}
                  disabled={isSubmitting}
                  placeholder="Profile default"
                  aria-invalid={fieldErrors.threshold ? true : undefined}
                  aria-describedby={
                    fieldErrors.threshold
                      ? `${thresholdHelpId} ${thresholdErrorId}`
                      : thresholdHelpId
                  }
                  onChange={(e) => {
                    setThreshold(e.currentTarget.value);
                    if (fieldErrors.threshold) {
                      setFieldErrors((prev) => ({ ...prev, threshold: "" }));
                    }
                  }}
                  className={`min-h-11 rounded-lg border bg-transparent px-3 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground/80 focus:border-accent disabled:opacity-60 ${
                    fieldErrors.threshold ? "border-danger" : "border-border-control"
                  }`}
                />
                <p id={thresholdHelpId} className="text-xs text-muted-foreground">
                  Optional override from 0 to 1; lower values flag more files.
                </p>
                {fieldErrors.threshold && (
                  <p
                    id={thresholdErrorId}
                    role="alert"
                    className="text-xs font-medium text-danger"
                  >
                    {fieldErrors.threshold}
                  </p>
                )}
              </div>

              <div className="flex min-h-11 items-start gap-2.5 sm:pt-6">
                <input
                  id={deepId}
                  type="checkbox"
                  checked={deepInspection}
                  disabled={isSubmitting}
                  onChange={(e) => setDeepInspection(e.currentTarget.checked)}
                  className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
                />
                <label
                  htmlFor={deepId}
                  className="cursor-pointer text-sm text-foreground"
                >
                  Extended static inspection
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Inspect PE headers, section layout, and signature metadata statically.
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {fieldErrors.file && (
          <div className="rounded-xl bg-danger-bg/45 px-3.5 py-2.5">
            <p
              id={fileErrorId}
              role="alert"
              className="flex items-start gap-2 text-xs font-medium text-danger"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
                strokeWidth={1.75}
              />
              <span className="break-words">{fieldErrors.file}</span>
            </p>
          </div>
        )}

        {isSubmitting && (
          <p aria-busy="true" className="text-xs text-muted-foreground">
            Inspecting PE headers, sections, and import tables statically…
          </p>
        )}

        {errorResponse && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger-bg/45 px-3.5 py-2.5 text-xs"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <AlertCircle
                aria-hidden="true"
                className="size-3.5 shrink-0 text-danger"
                strokeWidth={1.75}
              />
              <span className="break-words font-medium text-foreground">
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
                <RefreshCw
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={1.75}
                />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}
      </form>

      {outcome && !isSubmitting && (
        <ExeScanResult outcome={outcome} onReset={handleReset} />
      )}
    </div>
  );
}
