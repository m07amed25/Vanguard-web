"use client";

import {
  AlertCircle,
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
import { OfficeScanResult } from "./office-scan-result";
import { useReadiness, useTriageHandoff } from "./workspace-provider";

export function OfficeReadinessInline() {
  const {
    snapshot,
    isChecking,
    isInitialLoading,
    refreshError,
    refreshHealth,
  } = useReadiness();

  const current = snapshot.features.office;
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
          aria-label="Refresh Office scanner status"
          title="Refresh Office scanner status"
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

export function OfficeScannerWorkspace() {
  const feature = getFeatureDefinition("office");
  const { claimHandoff } = useTriageHandoff();
  const baseId = useId();
  const fileInputId = `${baseId}-file`;
  const helpId = `${baseId}-help`;
  const errorId = `${baseId}-error`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const selectionSeqRef = useRef(0);
  const scanSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handledHandoffIdRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [execState, setExecState] = useState<ExecutionState>("idle");
  const [fieldError, setFieldError] = useState<string>("");
  const [errorResponse, setErrorResponse] = useState<ScanErrorResponse | null>(
    null,
  );
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [liveStatus, setLiveStatus] = useState("");

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
      setFieldError("");
      setLiveStatus("Removed selected Office document.");
      return;
    }

    setFieldError("");
    const signature = await inspectBrowserFileSignature(next, "office");
    if (seq !== selectionSeqRef.current) return;

    if (!signature.ok) {
      setFieldError(signature.message);
      setLiveStatus(signature.message);
      return;
    }

    setLiveStatus(`Selected ${next.name} (${formatBytes(next.size)}).`);
  }

  async function runScan(overrideFile?: File, supersede = false) {
    if (submittingRef.current && !supersede) return;

    const targetFile = overrideFile ?? file;
    if (!targetFile) {
      setFieldError("Select an Office or RTF document to inspect.");
      setErrorResponse(null);
      setExecState("idle");
      setLiveStatus("Select an Office or RTF document before starting the scan.");
      return;
    }

    if (supersede) {
      abortControllerRef.current?.abort();
    }
    const seq = ++scanSeqRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    submittingRef.current = true;
    setFieldError("");
    setErrorResponse(null);
    setExecState("submitting");
    setLiveStatus(
      `Validating and scanning ${targetFile.name} statically. Please wait.`,
    );

    const signature = await inspectBrowserFileSignature(targetFile, "office");
    if (seq !== scanSeqRef.current) return;
    if (!signature.ok) {
      submittingRef.current = false;
      setFieldError(signature.message);
      setErrorResponse(null);
      setExecState("idle");
      setLiveStatus(signature.message);
      return;
    }

    const formData = new FormData();
    formData.append("file", targetFile);

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
                  "Could not complete this Office document scan. Please try again.",
                retryable: true,
                diagnosticId: "client-fallback",
              };
        setErrorResponse(err);
        if (err.fieldErrors?.file) {
          setFieldError(err.fieldErrors.file);
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
          "Connection was interrupted before the scan finished. Your selected document is preserved — try again.",
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
    if (handoff.kind !== "file" || handoff.slug !== "office") return;
    selectionSeqRef.current += 1;
    abortControllerRef.current?.abort();
    submittingRef.current = false;
    setOutcome(null);
    setErrorResponse(null);
    setFieldError("");
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
      const pending = claimHandoff("office");
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
    setFieldError("");
    setExecState("idle");
    setLiveStatus("Cleared scan result. Ready for another Office document.");
  }

  return (
    <div className="space-y-8">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      <form
        id="features-office-workbench"
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
          Office or RTF document
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
          <span className="font-medium">Office or RTF document</span>
          <span className="font-mono tabular-nums">Up to 25 MiB</span>
        </div>

        <div
          className={`flex flex-col gap-3 rounded-xl border bg-transparent px-4 py-3 motion-safe:transition-colors motion-safe:duration-150 sm:flex-row sm:items-center sm:justify-between ${
            fieldError ? "border-danger" : "border-border-control"
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
                  ariaLabel="Copy selected Office document filename"
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
                  Drop a Word, Excel, PowerPoint, or RTF file here, or choose one.
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
                aria-label="Remove selected Office document"
                className="inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-transparent text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50"
              >
                <X aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
              </button>
            )}

            <button
              type="button"
              disabled={isSubmitting}
              aria-describedby={fieldError ? `${helpId} ${errorId}` : helpId}
              onClick={openPicker}
              className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-transparent px-3.5 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected disabled:cursor-default disabled:opacity-50 sm:flex-none"
            >
              {file ? "Change" : "Choose file"}
            </button>

            <button
              id="features-office-submit"
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
              <span>{isSubmitting ? "Scanning…" : "Scan document"}</span>
            </button>
          </div>
        </div>

        {fieldError && (
          <div className="rounded-xl bg-danger-bg/45 px-3.5 py-2.5">
            <p
              id={errorId}
              role="alert"
              className="flex items-start gap-2 text-xs font-medium text-danger"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
                strokeWidth={1.75}
              />
              <span className="break-words">{fieldError}</span>
            </p>
          </div>
        )}

        {isSubmitting && (
          <p aria-busy="true" className="text-xs text-muted-foreground">
            Inspecting document structure, macros, and embedded objects statically…
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
        <OfficeScanResult outcome={outcome} onReset={handleReset} />
      )}
    </div>
  );
}
