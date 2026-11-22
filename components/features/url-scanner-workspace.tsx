"use client";

import {
  AlertCircle,
  Link2,
  List,
  Loader2,
  Paperclip,
  RefreshCw,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
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
import { UrlScanResult } from "./url-scan-result";
import { useReadiness, useTriageHandoff } from "./workspace-provider";

type UrlMode = "single" | "batch";

interface RunScanOverrides {
  mode?: UrlMode;
  singleUrl?: string;
  batchText?: string;
  batchFile?: File | null;
}

function parseBatchLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith("#"));
}

export function UrlReadinessInline() {
  const {
    snapshot,
    isChecking,
    isInitialLoading,
    refreshError,
    refreshHealth,
  } = useReadiness();

  const current = snapshot.features.url;
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
          aria-label="Refresh URL scanner status"
          title="Refresh URL scanner status"
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
  const parsedBatchLines = parseBatchLines(batchText);
  const trimmedSingleLength = singleUrl.trim().length;
  const showSingleCounter = trimmedSingleLength > 500;

  function switchMode(next: UrlMode) {
    setMode(next);
    setFieldError("");
    setErrorResponse(null);
  }

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
    setOutcome(null);
    setFieldError("");
    setErrorResponse(null);
    setExecState("idle");
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

  function handleSinglePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    if (!/\r|\n/.test(pasted)) return;
    const lines = parseBatchLines(pasted);
    if (lines.length < 2) return;
    event.preventDefault();
    setMode("batch");
    setBatchFile(null);
    setBatchText(pasted);
    setFieldError("");
    setErrorResponse(null);
    setLiveStatus(
      `Switched to batch mode with ${lines.length} URLs. Submit when ready.`,
    );
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
    const targetBatchLines = parseBatchLines(targetBatchText);

    if (targetMode === "single") {
      const trimmed = targetSingleUrl.trim();
      if (!trimmed) {
        setFieldError("Enter an HTTP(S) URL or domain to inspect.");
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Enter an HTTP(S) URL or domain before starting the scan.");
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
        setFieldError("Batch files must be 5 MiB or smaller.");
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Selected file exceeds the 5 MiB limit.");
        return;
      }
    } else {
      if (targetBatchLines.length === 0) {
        setFieldError("Enter at least 1 URL or import a batch file.");
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Enter at least 1 URL or import a batch file.");
        return;
      }
      if (targetBatchLines.length > URL_MAX_BATCH_ITEMS) {
        setFieldError(
          `Batch scans accept up to ${URL_MAX_BATCH_ITEMS} URLs at a time (currently ${targetBatchLines.length}).`,
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
        ? "Analyzing URL batch offline. Please wait."
        : "Analyzing URL offline. Please wait.",
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
          "Connection was interrupted before the scan finished. Your input is kept — try again.",
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
      setLiveStatus(
        "Loaded your URL list into batch mode. Review and submit when ready.",
      );
      return;
    }

    setMode("single");
    setSingleUrl(handoff.text);
    if (handoff.autoSubmit) {
      void runScan(
        { mode: "single", singleUrl: handoff.text, batchFile: null },
        true,
      );
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

  const submitButton = (
    <button
      id="features-url-submit"
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
      <span>
        {isSubmitting
          ? "Scanning…"
          : mode === "batch"
            ? "Scan batch"
            : "Scan URL"}
      </span>
    </button>
  );

  return (
    <div className="space-y-8">
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
        className={`space-y-3 rounded-xl motion-safe:transition-[outline-color] motion-safe:duration-150 ${
          dragging ? "outline-2 outline-dashed outline-accent outline-offset-8" : ""
        }`}
      >
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
            selectBatchFile(chosen);
          }}
        />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            {mode === "single" ? (
              <>
                <label
                  htmlFor={singleInputId}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Link or domain
                </label>
                {showSingleCounter && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      trimmedSingleLength > URL_MAX_LENGTH
                        ? "text-danger"
                        : "text-muted-foreground"
                    }`}
                  >
                    {trimmedSingleLength.toLocaleString()} /{" "}
                    {URL_MAX_LENGTH.toLocaleString()}
                  </span>
                )}
              </>
            ) : (
              <>
                {batchFile ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    Batch file
                  </span>
                ) : (
                  <label
                    htmlFor={batchInputId}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    URLs, one per line
                  </label>
                )}

                {!batchFile && parsedBatchLines.length > 0 && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      parsedBatchLines.length > URL_MAX_BATCH_ITEMS
                        ? "text-danger"
                        : "text-muted-foreground"
                    }`}
                  >
                    {parsedBatchLines.length} / {URL_MAX_BATCH_ITEMS}
                  </span>
                )}
              </>
            )}
          </div>

          <div
            role="group"
            aria-label="Inspection mode"
            className="inline-flex items-center gap-0.5 rounded-xl border border-border-control/70 bg-canvas p-0.5"
          >
            <button
              type="button"
              aria-pressed={mode === "single"}
              disabled={isSubmitting}
              onClick={() => switchMode("single")}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-xs font-medium motion-safe:transition-colors motion-safe:duration-150 disabled:cursor-default disabled:opacity-50 ${
                mode === "single"
                  ? "workspace-nav-active bg-surface-hover text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Link2
                aria-hidden="true"
                className={`size-3.5 shrink-0 ${
                  mode === "single" ? "text-accent" : ""
                }`}
                strokeWidth={1.75}
              />
              <span>Single</span>
            </button>

            <button
              type="button"
              aria-pressed={mode === "batch"}
              disabled={isSubmitting}
              onClick={() => switchMode("batch")}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-xs font-medium motion-safe:transition-colors motion-safe:duration-150 disabled:cursor-default disabled:opacity-50 ${
                mode === "batch"
                  ? "workspace-nav-active bg-surface-hover text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List
                aria-hidden="true"
                className={`size-3.5 shrink-0 ${
                  mode === "batch" ? "text-accent" : ""
                }`}
                strokeWidth={1.75}
              />
              <span>Batch</span>
            </button>
          </div>
        </div>

        {mode === "single" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                placeholder="https://example.com/login or example.com"
                onPaste={handleSinglePaste}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setSingleUrl(next);
                  if (fieldError) setFieldError("");
                  if (next.trim().length === 0) {
                    setOutcome(null);
                    setErrorResponse(null);
                    setExecState("idle");
                  }
                }}
                className={`min-h-12 min-w-0 flex-1 rounded-xl border bg-transparent px-4 py-2.5 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:border-accent disabled:opacity-60 ${
                  fieldError ? "border-danger" : "border-border-control"
                }`}
              />

              <div className="flex w-full items-center gap-2 sm:w-auto">
                {singleUrl.length > 0 && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setSingleUrl("");
                      setOutcome(null);
                      setFieldError("");
                      setErrorResponse(null);
                      setExecState("idle");
                    }}
                    aria-label="Clear URL"
                    className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border-control bg-transparent px-4 text-sm font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50 sm:w-12 sm:flex-none sm:px-0"
                  >
                    <X aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="sm:hidden">Clear</span>
                  </button>
                )}
                {submitButton}
              </div>
          </div>
        ) : (
          <div className="space-y-3">
            {batchFile ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border-control px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatBytes(batchFile.size)}
                  </span>
                  <CopyButton
                    value={batchFile.name}
                    ariaLabel="Copy selected batch filename"
                  />
                </div>

                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={clearBatchFile}
                    aria-label="Remove selected batch file"
                    className="inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-transparent text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50"
                  >
                    <X aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={openFilePicker}
                    className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-transparent px-3.5 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected disabled:cursor-default disabled:opacity-50 sm:flex-none"
                  >
                    Change
                  </button>
                  {submitButton}
                </div>
              </div>
            ) : (
              <>
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
                  placeholder="Paste one URL per line, or drop a .txt, .csv, .json, or .jsonl file"
                  onKeyDown={handleTextareaKeyDown}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setBatchText(next);
                    if (fieldError) setFieldError("");
                    if (next.trim().length === 0) {
                      setOutcome(null);
                      setErrorResponse(null);
                      setExecState("idle");
                    }
                  }}
                  className={`min-h-32 w-full rounded-xl border bg-transparent px-4 py-3 font-mono text-sm leading-6 text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:border-accent disabled:opacity-60 ${
                    fieldError ? "border-danger" : "border-border-control"
                  }`}
                />

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={openFilePicker}
                    className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border-control bg-transparent px-3.5 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected disabled:cursor-default disabled:opacity-50 sm:w-auto"
                  >
                    <Paperclip
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                    <span>Import file</span>
                  </button>

                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    {batchText.length > 0 && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          setBatchText("");
                          setOutcome(null);
                          setFieldError("");
                          setErrorResponse(null);
                          setExecState("idle");
                        }}
                        className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-transparent px-3.5 text-sm font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50 sm:flex-none"
                      >
                        Clear
                      </button>
                    )}
                    {submitButton}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

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
            Inspecting link structure and domain patterns offline…
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
        <UrlScanResult outcome={outcome} onReset={handleReset} />
      )}
    </div>
  );
}
