"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { FileDropzone } from "./file-dropzone";
import { ScanResultPanel } from "./scan-result-panel";
import { useTriageHandoff } from "./workspace-provider";

export function EmailScannerWorkspace() {
  const feature = getFeatureDefinition("email");
  const { claimHandoff } = useTriageHandoff();
  const submittingRef = useRef(false);
  const selectionSeqRef = useRef(0);
  const scanSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handledHandoffIdRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [execState, setExecState] = useState<ExecutionState>("idle");
  const [fieldError, setFieldError] = useState<string>("");
  const [errorResponse, setErrorResponse] = useState<ScanErrorResponse | null>(
    null,
  );
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [liveStatus, setLiveStatus] = useState("");

  const isSubmitting = execState === "submitting";

  async function handleFileSelect(next: File | null) {
    const seq = ++selectionSeqRef.current;
    setFile(next);
    setErrorResponse(null);

    if (!next) {
      setFieldError("");
      setLiveStatus("Removed selected email file.");
      return;
    }

    setFieldError("");
    const signature = await inspectBrowserFileSignature(next, "email");
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
      setFieldError("Select a raw .eml file to inspect.");
      setErrorResponse(null);
      setExecState("idle");
      setLiveStatus("Select a raw .eml file before starting the scan.");
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
    setLiveStatus(`Validating and scanning ${targetFile.name} statically. Please wait...`);

    const signature = await inspectBrowserFileSignature(targetFile, "email");
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
                message: "Could not complete this email scan. Please try again.",
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
          "Network connection was interrupted before the scan finished. Your selected .eml file is preserved — try again.",
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
    if (handoff.kind !== "file" || handoff.slug !== "email") return;
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
      const pending = claimHandoff("email");
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
    setFile(null);
    setOutcome(null);
    setErrorResponse(null);
    setFieldError("");
    setExecState("idle");
    setLiveStatus("Cleared scan result. Ready for another .eml file.");
  }

  return (
    <div className="space-y-6">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      <form
        id="features-email-workbench"
        onSubmit={handleSubmit}
        noValidate
        className={`workspace-panel divide-y divide-outline overflow-hidden rounded-2xl border bg-surface motion-safe:transition-colors motion-safe:duration-150 ${
          fieldError ? "border-danger" : "border-outline"
        }`}
      >
        <FileDropzone
          label="Raw email message (.eml)"
          formatLabel={feature.formatLabel}
          limitLabel={feature.limitLabel}
          acceptedExtensions={feature.acceptedExtensions}
          file={file}
          disabled={isSubmitting}
          submitting={isSubmitting}
          error={fieldError}
          submitId="features-email-submit"
          submitLabel={isSubmitting ? "Scanning..." : "Scan email"}
          emptyPrompt={
            <>
              Drop a raw <span className="font-mono text-foreground/90">.eml</span>{" "}
              file here, or choose one from your device.
            </>
          }
          onFileSelect={(next) => {
            void handleFileSelect(next);
          }}
        />

        {isSubmitting && (
          <div
            aria-busy="true"
            className="px-4 py-2.5 text-xs text-muted-foreground sm:px-5"
          >
            Inspecting email headers, body text, links, and attachments statically without opening links or files...
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
