"use client";

import { AlertCircle, Loader2, Paperclip, RefreshCw, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  FIVE_MIB,
  URL_MAX_BATCH_ITEMS,
  URL_MAX_LENGTH,
  formatBytes,
  getFeatureDefinition,
} from "@/lib/features/catalog";
import type {
  ExecutionState,
  PendingTriageHandoff,
  ScanApiResponse,
  ScanErrorResponse,
  ScanOutcome,
} from "@/lib/features/types";
import { CopyButton } from "./copy-button";
import { ScanResultPanel } from "./scan-result-panel";
import { useTriageHandoff } from "./workspace-provider";

type UrlMode = "single" | "batch";

interface RunScanOverrides {
  mode?: UrlMode;
  singleUrl?: string;
  batchText?: string;
  batchFile?: File | null;
}

export function UrlScannerWorkspace() {
  const feature = getFeatureDefinition("url");
  const { claimHandoff } = useTriageHandoff();
  const baseId = useId();
  const singleInputId = `${baseId}-single-url`;
  const batchInputId = `${baseId}-batch-urls`;
  const fileInputId = `${baseId}-batch-file`;
  const errorId = `${baseId}-error`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const scanSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handledHandoffIdRef = useRef<string | null>(null);

  const [mode, setMode] = useState<UrlMode>("single");
  const [singleUrl, setSingleUrl] = useState("");
  const [batchText, setBatchText] = useState("");
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const [execState, setExecState] = useState<ExecutionState>("idle");
  const [fieldError, setFieldError] = useState<string>("");
  const [errorResponse, setErrorResponse] = useState<ScanErrorResponse | null>(
    null,
  );
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [liveStatus, setLiveStatus] = useState("");

  const isSubmitting = execState === "submitting";

  const parsedBatchLines = batchText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith("#"));

  function selectBatchFile(next: File | null) {
    setBatchFile(next);
    setFieldError("");
    setErrorResponse(null);
    if (next) {
      setMode("batch");
      setLiveStatus(`Selected ${next.name} (${formatBytes(next.size)}).`);
    }
  }

  function openFilePicker() {
    if (isSubmitting) return;
    fileInputRef.current?.click();
  }

  function clearBatchFile() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setBatchFile(null);
    setFieldError("");
    setErrorResponse(null);
    setLiveStatus("Removed selected batch file.");
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
      selectBatchFile(dropped);
    }
  }

  async function runScan(overrides?: RunScanOverrides, supersede = false) {
    if (submittingRef.current && !supersede) return;

    const targetMode = overrides?.mode ?? mode;
    const targetSingleUrl = overrides?.singleUrl ?? singleUrl;
    const targetBatchText = overrides?.batchText ?? batchText;
    const targetBatchFile =
      overrides && "batchFile" in overrides
        ? (overrides.batchFile ?? null)
        : batchFile;
    const targetBatchLines = targetBatchText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => Boolean(line) && !line.startsWith("#"));

    if (targetMode === "single") {
      const trimmed = targetSingleUrl.trim();
      if (!trimmed) {
        setFieldError("Paste or type an HTTP(S) URL or bare domain to inspect.");
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Enter an HTTP(S) URL or bare domain before starting the scan.");
        return;
      }
      if (trimmed.length > URL_MAX_LENGTH) {
        setFieldError(
          `URLs must be ${URL_MAX_LENGTH.toLocaleString()} characters or fewer.`,
        );
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Entered URL exceeds the character limit.");
        return;
      }
    } else if (targetBatchFile) {
      if (targetBatchFile.size === 0) {
        setFieldError("The selected file is empty (0 bytes).");
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Selected file is empty.");
        return;
      }
      if (targetBatchFile.size > FIVE_MIB) {
        setFieldError("URL batch import files must be 5 MiB or smaller.");
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Selected file exceeds the 5 MiB limit.");
        return;
      }
    } else {
      if (targetBatchLines.length === 0) {
        setFieldError(
          "Enter at least 1 URL (one per line) or import a batch file.",
        );
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Enter at least 1 URL or import a batch file.");
        return;
      }
      if (targetBatchLines.length > URL_MAX_BATCH_ITEMS) {
        setFieldError(
          `Batch scans accept at most ${URL_MAX_BATCH_ITEMS} URLs at a time (currently ${targetBatchLines.length}).`,
        );
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Batch URL count exceeds the 256-URL limit.");
        return;
      }
      const tooLongIdx = targetBatchLines.findIndex(
        (line) => line.length > URL_MAX_LENGTH,
      );
      if (tooLongIdx !== -1) {
        setFieldError(
          `Line #${tooLongIdx + 1} exceeds the ${URL_MAX_LENGTH.toLocaleString()}-character limit.`,
        );
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus(`Line #${tooLongIdx + 1} exceeds the character limit.`);
        return;
      }
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
      targetMode === "batch"
        ? "Analyzing URL batch with the offline URL structure and link pattern scanner. Please wait..."
        : "Analyzing URL with the offline URL structure and link pattern scanner. Please wait...",
    );

    try {
      let response: Response;
      if (targetMode === "batch" && targetBatchFile) {
        const formData = new FormData();
        formData.append("file", targetBatchFile);
        formData.append("includeDetails", "true");
        response = await fetch(feature.apiPath, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
      } else if (targetMode === "batch") {
        response = await fetch(feature.apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "batch",
            urls: targetBatchLines.map((url) => ({ url })),
            includeDetails: true,
          }),
          signal: controller.signal,
        });
      } else {
        response = await fetch(feature.apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "single",
            url: targetSingleUrl.trim(),
            includeDetails: true,
          }),
          signal: controller.signal,
        });
      }
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
                message: "Could not complete the URL scan. Please try again.",
                retryable: true,
                diagnosticId: "client-fallback",
              };
        setErrorResponse(err);
        const firstFieldErr = err.fieldErrors
          ? Object.values(err.fieldErrors)[0]
          : undefined;
        if (firstFieldErr) {
          setFieldError(firstFieldErr);
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
          "Network connection was interrupted before the scan finished. Your URL input is preserved — try again.",
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
    if (handoff.kind !== "url") return;
    abortControllerRef.current?.abort();
    submittingRef.current = false;
    setOutcome(null);
    setErrorResponse(null);
    setFieldError("");
    setExecState("idle");
    setBatchFile(null);

    if (handoff.mode === "batch") {
      setMode("batch");
      setBatchText(handoff.text);
      setLiveStatus("Loaded your URL list into batch mode. Review and submit when ready.");
      return;
    }

    setMode("single");
    setSingleUrl(handoff.text);
    if (handoff.autoSubmit) {
      void runScan({ mode: "single", singleUrl: handoff.text, batchFile: null }, true);
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
      const pending = claimHandoff("url");
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

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void runScan();
    }
  }

  function handleReset() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setOutcome(null);
    setErrorResponse(null);
    setFieldError("");
    setExecState("idle");
    setSingleUrl("");
    setBatchText("");
    setBatchFile(null);
    setLiveStatus("Cleared previous scan. Ready for a new URL check.");
  }

  return (
    <div className="space-y-6">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      <form
        id="features-url-workbench"
        onSubmit={handleSubmit}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        noValidate
        className={`workspace-panel divide-y divide-outline overflow-hidden rounded-2xl border bg-surface motion-safe:transition-colors motion-safe:duration-150 ${
          fieldError
            ? "border-danger"
            : dragging
              ? "border-accent bg-surface-selected/35"
              : "border-outline"
        }`}
      >
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept={feature.acceptedExtensions.join(",")}
          disabled={isSubmitting}
          className="sr-only"
          onChange={(event) => {
            const chosen = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = "";
            selectBatchFile(chosen);
          }}
        />

        {/* Top hairline bar: mode tabs + live counter */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6">
          <div
            role="group"
            aria-label="Inspection mode"
            className="flex flex-wrap items-center gap-5"
          >
            <button
              type="button"
              disabled={isSubmitting}
              aria-pressed={mode === "single"}
              onClick={() => {
                setMode("single");
                setFieldError("");
                setErrorResponse(null);
              }}
              className={`-mb-px inline-flex min-h-11 cursor-pointer items-center border-b-2 text-sm font-medium motion-safe:transition-colors motion-safe:duration-150 ${
                mode === "single"
                  ? "workspace-nav-active border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Single URL
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              aria-pressed={mode === "batch"}
              onClick={() => {
                setMode("batch");
                setFieldError("");
                setErrorResponse(null);
              }}
              className={`-mb-px inline-flex min-h-11 cursor-pointer items-center border-b-2 text-sm font-medium motion-safe:transition-colors motion-safe:duration-150 ${
                mode === "batch"
                  ? "workspace-nav-active border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Batch (up to {URL_MAX_BATCH_ITEMS})
            </button>
          </div>

          <span className="py-2 font-mono text-xs text-muted-foreground tabular-nums">
            {mode === "single"
              ? `${singleUrl.trim().length.toLocaleString()} / ${URL_MAX_LENGTH.toLocaleString()}`
              : batchFile
                ? formatBytes(batchFile.size)
                : `${parsedBatchLines.length} / ${URL_MAX_BATCH_ITEMS}`}
          </span>
        </div>

        {/* Main input body */}
        <div className="px-5 py-5 sm:px-6">
          {mode === "single" ? (
            <div className="space-y-1.5">
              <label
                htmlFor={singleInputId}
                className="text-xs font-medium text-muted-foreground"
              >
                HTTP(S) URL or bare domain
              </label>
              <input
                id={singleInputId}
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={singleUrl}
                disabled={isSubmitting}
                maxLength={URL_MAX_LENGTH + 100}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? errorId : undefined}
                placeholder="https://example.com/login or bare-domain.example.com"
                onChange={(event) => {
                  setSingleUrl(event.currentTarget.value);
                  if (fieldError) setFieldError("");
                }}
                className={`min-h-11 w-full rounded-lg border bg-canvas px-3.5 py-2 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:border-accent disabled:opacity-60 ${
                  fieldError ? "border-danger" : "border-border-control"
                }`}
              />
            </div>
          ) : batchFile ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <Paperclip
                  aria-hidden="true"
                  className="size-4 shrink-0 text-accent"
                  strokeWidth={1.75}
                />
                <span
                  className="truncate font-mono text-foreground"
                  title={batchFile.name}
                >
                  {batchFile.name}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  · {formatBytes(batchFile.size)}
                </span>
                <CopyButton
                  value={batchFile.name}
                  ariaLabel="Copy selected batch filename"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={openFilePicker}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border-control bg-canvas px-3.5 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected disabled:cursor-default disabled:opacity-50"
                >
                  Change file
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={clearBatchFile}
                  aria-label="Remove selected batch file"
                  className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-border-control bg-canvas text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50"
                >
                  <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label
                htmlFor={batchInputId}
                className="text-xs font-medium text-muted-foreground"
              >
                Batch URLs (one per line)
              </label>
              <textarea
                id={batchInputId}
                rows={4}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={batchText}
                disabled={isSubmitting}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? errorId : undefined}
                placeholder={
                  "Paste one URL per line, or drop a .txt, .csv, .json, or .jsonl file..."
                }
                onKeyDown={handleTextareaKeyDown}
                onChange={(event) => {
                  setBatchText(event.currentTarget.value);
                  if (fieldError) setFieldError("");
                }}
                className={`min-h-28 w-full rounded-lg border bg-canvas px-3.5 py-2.5 font-mono text-sm leading-6 text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:border-accent disabled:opacity-60 ${
                  fieldError ? "border-danger" : "border-border-control"
                }`}
              />
            </div>
          )}
        </div>

        {/* Footer action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {mode === "batch" && !batchFile ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={openFilePicker}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border-control bg-canvas px-3.5 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected disabled:cursor-default disabled:opacity-50"
              >
                Import file
              </button>
            ) : (
              <p className="max-w-[55ch] text-xs text-muted-foreground">
                Enter full HTTP(S) URLs, IP addresses, or internationalized domains — links are never fetched or opened.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {((mode === "single" && singleUrl.length > 0) ||
              (mode === "batch" && !batchFile && batchText.length > 0)) && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  if (mode === "single") {
                    setSingleUrl("");
                  } else {
                    setBatchText("");
                  }
                  setFieldError("");
                  setErrorResponse(null);
                }}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border-control bg-canvas px-3 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected disabled:cursor-default disabled:opacity-50"
              >
                Clear
              </button>
            )}

            <button
              id="features-url-submit"
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary motion-safe:transition-colors motion-safe:duration-150 hover:bg-primary-hover active:bg-primary-pressed disabled:cursor-default disabled:bg-surface-raised disabled:text-muted-foreground"
            >
              {isSubmitting && (
                <Loader2
                  aria-hidden="true"
                  className="size-4 shrink-0 motion-safe:animate-spin motion-reduce:hidden"
                  strokeWidth={1.75}
                />
              )}
              <span>
                {isSubmitting
                  ? "Scanning..."
                  : mode === "batch"
                    ? "Scan batch"
                    : "Scan URL"}
              </span>
            </button>
          </div>
        </div>

        {fieldError && (
          <div className="bg-danger-bg/20 px-4 py-2.5 sm:px-5">
            <p id={errorId} role="alert" className="text-xs font-medium text-danger break-words">
              {fieldError}
            </p>
          </div>
        )}

        {isSubmitting && (
          <div
            aria-busy="true"
            className="px-4 py-2.5 text-xs text-muted-foreground sm:px-5"
          >
            Checking link structure, domain patterns, and path signals offline — links are never fetched or opened...
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
