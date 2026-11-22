"use client";

import {
  AlertCircle,
  List,
  Loader2,
  MessageSquare,
  Paperclip,
  RefreshCw,
  X,
} from "lucide-react";
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
  SMS_MAX_BATCH_ITEMS,
  SMS_MAX_TEXT_LENGTH,
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
import { SmsScanResult } from "./sms-scan-result";
import { useReadiness, useTriageHandoff } from "./workspace-provider";

type SmsMode = "single" | "batch";

interface RunScanOverrides {
  mode?: SmsMode;
  singleText?: string;
  batchText?: string;
  batchFile?: File | null;
}

function parseBatchLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function SmsReadinessInline() {
  const {
    snapshot,
    isChecking,
    isInitialLoading,
    refreshError,
    refreshHealth,
  } = useReadiness();

  const current = snapshot.features.sms;
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
          aria-label="Refresh SMS scanner status"
          title="Refresh SMS scanner status"
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

export function SmsScannerWorkspace() {
  const feature = getFeatureDefinition("sms");
  const { claimHandoff } = useTriageHandoff();
  const baseId = useId();
  const singleInputId = `${baseId}-sms-single`;
  const batchInputId = `${baseId}-sms-batch`;
  const fileInputId = `${baseId}-sms-file`;
  const errorId = `${baseId}-sms-error`;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const scanSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handledHandoffIdRef = useRef<string | null>(null);

  const [mode, setMode] = useState<SmsMode>("single");
  const [singleText, setSingleText] = useState("");
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
  const showSingleCounter = singleText.length > 500;

  function switchMode(next: SmsMode) {
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
    setLiveStatus("Removed batch file. Ready for pasted batch messages.");
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
    const targetSingleText = overrides?.singleText ?? singleText;
    const targetBatchText = overrides?.batchText ?? batchText;
    const targetBatchFile =
      overrides && "batchFile" in overrides
        ? (overrides.batchFile ?? null)
        : batchFile;
    const targetBatchLines = parseBatchLines(targetBatchText);

    if (targetMode === "single") {
      const trimmed = targetSingleText.trim();
      if (!trimmed) {
        setFieldError("Paste or type an SMS message to inspect.");
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Enter an SMS message before starting the scan.");
        return;
      }
      if (targetSingleText.length > SMS_MAX_TEXT_LENGTH) {
        setFieldError(
          `SMS messages must be ${SMS_MAX_TEXT_LENGTH.toLocaleString()} characters or fewer.`,
        );
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("SMS message exceeds the character limit.");
        return;
      }
    } else if (targetBatchFile) {
      if (targetBatchFile.size === 0) {
        setFieldError("The selected file is empty (0 bytes).");
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Selected batch file is empty.");
        return;
      }
      if (targetBatchFile.size > FIVE_MIB) {
        setFieldError("Batch files must be 5 MiB or smaller.");
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Selected batch file exceeds the 5 MiB limit.");
        return;
      }
    } else {
      if (targetBatchLines.length === 0) {
        setFieldError("Enter at least 1 SMS message or import a batch file.");
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Provide batch messages or import a batch file.");
        return;
      }
      if (targetBatchLines.length > SMS_MAX_BATCH_ITEMS) {
        setFieldError(
          `Batch scans accept up to ${SMS_MAX_BATCH_ITEMS} messages at a time (currently ${targetBatchLines.length}).`,
        );
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus("Batch exceeds the 256-message limit.");
        return;
      }
      const tooLongIdx = targetBatchLines.findIndex(
        (line) => line.length > SMS_MAX_TEXT_LENGTH,
      );
      if (tooLongIdx !== -1) {
        setFieldError(
          `Line #${tooLongIdx + 1} exceeds the ${SMS_MAX_TEXT_LENGTH.toLocaleString()}-character limit.`,
        );
        setErrorResponse(null);
        setExecState("idle");
        setLiveStatus(
          `Line #${tooLongIdx + 1} exceeds the character limit.`,
        );
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
        ? "Analyzing SMS batch offline. Please wait."
        : "Analyzing SMS message offline. Please wait.",
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
            messages: targetBatchLines.map((text) => ({ text })),
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
            text: targetSingleText.trim(),
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
                message: "Could not complete the SMS scan. Please try again.",
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
          "Connection was interrupted before the scan finished. Your SMS input is kept — try again.",
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
    if (handoff.kind !== "sms") return;
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
      if (handoff.autoSubmit) {
        void runScan(
          { mode: "batch", batchText: handoff.text, batchFile: null },
          true,
        );
      } else {
        setLiveStatus(
          "Loaded your SMS list into batch mode. Review and submit when ready.",
        );
      }
      return;
    }

    setMode("single");
    setSingleText(handoff.text);
    if (handoff.autoSubmit) {
      void runScan(
        { mode: "single", singleText: handoff.text, batchFile: null },
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
      const pending = claimHandoff("sms");
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
    setSingleText("");
    setBatchText("");
    setBatchFile(null);
    setLiveStatus("Cleared previous scan. Ready for a new SMS check.");
  }

  const submitButton = (
    <button
      id="features-sms-submit"
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
            : "Scan SMS"}
      </span>
    </button>
  );

  return (
    <div className="space-y-8">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      <form
        id="features-sms-workbench"
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
                  SMS message
                </label>
                {showSingleCounter && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      singleText.length > SMS_MAX_TEXT_LENGTH
                        ? "text-danger"
                        : "text-muted-foreground"
                    }`}
                  >
                    {singleText.length.toLocaleString()} /{" "}
                    {SMS_MAX_TEXT_LENGTH.toLocaleString()}
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
                    Messages, one per line
                  </label>
                )}

                {!batchFile && parsedBatchLines.length > 0 && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      parsedBatchLines.length > SMS_MAX_BATCH_ITEMS
                        ? "text-danger"
                        : "text-muted-foreground"
                    }`}
                  >
                    {parsedBatchLines.length} / {SMS_MAX_BATCH_ITEMS}
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
              <MessageSquare
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
          <div className="space-y-3">
            <textarea
              id={singleInputId}
              dir="auto"
              rows={3}
              value={singleText}
              disabled={isSubmitting}
              maxLength={SMS_MAX_TEXT_LENGTH + 100}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? errorId : undefined}
              placeholder="Paste the SMS text message to inspect"
              onKeyDown={handleTextareaKeyDown}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setSingleText(next);
                if (fieldError) setFieldError("");
                if (next.trim().length === 0) {
                  setOutcome(null);
                  setErrorResponse(null);
                  setExecState("idle");
                }
              }}
              className={`min-h-28 w-full rounded-xl border bg-transparent px-4 py-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:border-accent disabled:opacity-60 ${
                fieldError ? "border-danger" : "border-border-control"
              }`}
            />

            <div className="flex w-full items-center justify-end gap-2">
              {singleText.length > 0 && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setSingleText("");
                    setOutcome(null);
                    setFieldError("");
                    setErrorResponse(null);
                    setExecState("idle");
                  }}
                  className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-transparent px-4 text-sm font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50 sm:flex-none"
                >
                  Clear
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
                    <X
                      aria-hidden="true"
                      className="size-4 shrink-0"
                      strokeWidth={1.75}
                    />
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
                  dir="auto"
                  rows={4}
                  value={batchText}
                  disabled={isSubmitting}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? errorId : undefined}
                  placeholder="Paste one SMS message per line, or drop a .txt, .csv, .json, or .jsonl file"
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
                  className={`min-h-32 w-full rounded-xl border bg-transparent px-4 py-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:border-accent disabled:opacity-60 ${
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
                        className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-transparent px-4 text-sm font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50 sm:flex-none"
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
            {mode === "batch"
              ? "Analyzing SMS batch offline. Please wait…"
              : "Analyzing SMS message offline. Please wait…"}
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
        <SmsScanResult outcome={outcome} onReset={handleReset} />
      )}
    </div>
  );
}
