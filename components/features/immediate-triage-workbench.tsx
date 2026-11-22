"use client";

import { AlertCircle, Loader2, Paperclip, RefreshCw, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  FEATURE_BY_SLUG,
  FEATURE_CATALOG,
  formatBytes,
} from "@/lib/features/catalog";
import { inspectBrowserFileSignature } from "@/lib/features/file-signature";
import {
  TRIAGE_MAX_SMS_LENGTH,
  TRIAGE_MAX_URL_LENGTH,
  validateSmsTriageInput,
  validateUrlTriageInput,
  type TriageValidationShortcut,
} from "@/lib/features/triage-validation";
import type { FileScannerSlug, TriageMode } from "@/lib/features/types";
import { CopyButton } from "./copy-button";
import { useReadiness, useTriageHandoff } from "./workspace-provider";

const MODES: ReadonlyArray<{ value: TriageMode; label: string }> = [
  { value: "file", label: "File" },
  { value: "url", label: "URL" },
  { value: "sms", label: "SMS" },
];

interface FileClassification {
  slug: FileScannerSlug;
  label: string;
}

interface UnavailableNotice {
  slug: keyof typeof FEATURE_BY_SLUG;
  scannerName: string;
}

export function ImmediateTriageWorkbench() {
  const router = useRouter();
  const baseId = useId();
  const fileInputId = `${baseId}-file`;
  const urlInputId = `${baseId}-url`;
  const smsInputId = `${baseId}-sms`;
  const errorId = `${baseId}-error`;

  const {
    snapshot,
    isInitialLoading,
    waitForInitialSnapshot,
    refreshHealth,
    isChecking,
    refreshError,
  } = useReadiness();
  const { drafts, setFileDraft, setUrlDraft, setSmsDraft, stageHandoff } =
    useTriageHandoff();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionSeqRef = useRef(0);
  const submittingRef = useRef(false);

  const [mode, setMode] = useState<TriageMode>("file");
  const [dragging, setDragging] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState<FileClassification | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [shortcuts, setShortcuts] = useState<TriageValidationShortcut[]>([]);
  const [unavailable, setUnavailable] = useState<UnavailableNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [liveStatus, setLiveStatus] = useState("");

  function clearAlerts() {
    setFieldError("");
    setShortcuts([]);
    setUnavailable(null);
  }

  async function handleFileSelected(next: File | null) {
    const seq = ++selectionSeqRef.current;
    clearAlerts();
    setClassification(null);
    setFileDraft(next);
    if (!next) {
      setLiveStatus("Removed selected file.");
      return;
    }
    setClassifying(true);
    const result = await inspectBrowserFileSignature(next);
    if (seq !== selectionSeqRef.current) return;
    setClassifying(false);
    if (result.ok) {
      const label = FEATURE_BY_SLUG[result.targetSlug].name;
      setClassification({ slug: result.targetSlug, label });
      setLiveStatus(
        `Detected ${result.detectedLabel} (${formatBytes(next.size)}). Ready to inspect with ${label}.`,
      );
    } else {
      setFieldError(result.message);
      setLiveStatus(result.message);
    }
  }

  function switchMode(next: TriageMode) {
    selectionSeqRef.current += 1;
    setClassifying(false);
    setMode(next);
    clearAlerts();
  }

  function applyShortcut(shortcut: TriageValidationShortcut) {
    clearAlerts();
    if (shortcut.kind === "switch_to_sms") {
      setSmsDraft(shortcut.text);
      setMode("sms");
      setLiveStatus("Switched to SMS mode with your text preserved.");
      return;
    }
    stageHandoff({
      kind: "url",
      slug: "url",
      mode: "batch",
      text: shortcut.text,
      autoSubmit: false,
    });
    router.push("/features/url");
  }

  async function ensureReady(slug: keyof typeof FEATURE_BY_SLUG): Promise<boolean> {
    const current = isInitialLoading ? await waitForInitialSnapshot() : snapshot;
    if (current.features[slug]?.ready) return true;
    const scannerName = FEATURE_BY_SLUG[slug].name;
    setUnavailable({ slug, scannerName });
    setLiveStatus(
      `${scannerName} is temporarily unavailable. Your input was kept so you can retry.`,
    );
    return false;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    clearAlerts();

    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (mode === "file") {
        const file = drafts.file;
        if (!file) {
          setFieldError("Choose a file to inspect.");
          return;
        }
        const seq = ++selectionSeqRef.current;
        const result = await inspectBrowserFileSignature(file);
        if (seq !== selectionSeqRef.current) return;
        if (!result.ok) {
          setFieldError(result.message);
          setLiveStatus(result.message);
          return;
        }
        if (!(await ensureReady(result.targetSlug))) return;
        stageHandoff({
          kind: "file",
          slug: result.targetSlug,
          mode: "single",
          file,
          autoSubmit: true,
        });
        setClassification(null);
        router.push(FEATURE_BY_SLUG[result.targetSlug].route);
        return;
      }

      if (mode === "url") {
        const result = validateUrlTriageInput(drafts.url);
        if (!result.ok) {
          setFieldError(result.fieldError);
          setShortcuts(
            [result.shortcut, result.secondaryShortcut].filter(
              (s): s is TriageValidationShortcut => Boolean(s),
            ),
          );
          setLiveStatus(result.fieldError);
          return;
        }
        if (!(await ensureReady("url"))) return;
        stageHandoff({
          kind: "url",
          slug: "url",
          mode: "single",
          text: result.normalizedText,
          autoSubmit: true,
        });
        router.push("/features/url");
        return;
      }

      const result = validateSmsTriageInput(drafts.sms);
      if (!result.ok) {
        setFieldError(result.fieldError);
        setLiveStatus(result.fieldError);
        return;
      }
      if (!(await ensureReady("sms"))) return;
      stageHandoff({
        kind: "sms",
        slug: "sms",
        mode: "single",
        text: result.normalizedText,
        autoSubmit: true,
      });
      router.push("/features/sms");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleClear() {
    clearAlerts();
    if (mode === "file") {
      selectionSeqRef.current += 1;
      if (fileInputRef.current) fileInputRef.current.value = "";
      setClassification(null);
      setClassifying(false);
      setFileDraft(null);
    } else if (mode === "url") {
      setUrlDraft("");
    } else {
      setSmsDraft("");
    }
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    if (mode !== "file") return;
    event.preventDefault();
    if (!submitting) setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLFormElement>) {
    if (mode !== "file") return;
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    if (mode !== "file") return;
    event.preventDefault();
    setDragging(false);
    if (submitting) return;
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) void handleFileSelected(dropped);
  }

  const hasDraft =
    mode === "file"
      ? Boolean(drafts.file)
      : mode === "url"
        ? drafts.url.length > 0
        : drafts.sms.length > 0;

  const meta =
    mode === "file"
      ? drafts.file
        ? null
        : "25 MiB max"
      : mode === "url"
        ? drafts.url.length > 0
          ? `${drafts.url.trim().length.toLocaleString()} / ${TRIAGE_MAX_URL_LENGTH.toLocaleString()}`
          : null
        : drafts.sms.length > 0
          ? `${drafts.sms.length.toLocaleString()} / ${TRIAGE_MAX_SMS_LENGTH.toLocaleString()}`
          : null;

  const submitLabel =
    mode === "file" ? "Inspect" : mode === "url" ? "Scan URL" : "Scan SMS";

  const describedBy = fieldError ? errorId : undefined;

  const submitButton = (
    <button
      type="submit"
      disabled={submitting || classifying}
      className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary motion-safe:transition-colors motion-safe:duration-150 hover:bg-primary-hover active:bg-primary-pressed disabled:cursor-default disabled:bg-surface-raised disabled:text-muted-foreground"
    >
      {submitting && (
        <Loader2
          aria-hidden="true"
          className="size-4 shrink-0 motion-safe:animate-spin motion-reduce:hidden"
          strokeWidth={1.75}
        />
      )}
      <span>{submitting ? "Checking…" : submitLabel}</span>
    </button>
  );

  return (
    <section aria-labelledby={`${baseId}-heading`} className="space-y-3">
      <h2 id={`${baseId}-heading`} className="sr-only">
        Inspect a suspicious item
      </h2>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>

      <form
        onSubmit={handleSubmit}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        noValidate
        className={`workspace-panel space-y-4 rounded-2xl border p-4 motion-safe:transition-colors motion-safe:duration-150 sm:p-5 ${
          dragging
            ? "border-accent bg-surface-selected/25"
            : "border-outline bg-surface"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Triage input mode"
            className="inline-flex items-center gap-1 rounded-xl bg-canvas p-1"
          >
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={mode === m.value}
                disabled={submitting}
                onClick={() => switchMode(m.value)}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3.5 text-sm font-medium motion-safe:transition-colors motion-safe:duration-150 ${
                  mode === m.value
                    ? "workspace-nav-active bg-surface-selected text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {meta && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {meta}
            </span>
          )}
        </div>

        {mode === "file" && (
          <div>
            <label htmlFor={fileInputId} className="sr-only">
              Suspicious file to inspect
            </label>
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              tabIndex={-1}
              aria-hidden="true"
              disabled={submitting}
              className="sr-only"
              onChange={(event) => {
                const chosen = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                void handleFileSelected(chosen);
              }}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {drafts.file ? (
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Paperclip
                    aria-hidden="true"
                    className="size-4 shrink-0 text-accent"
                    strokeWidth={1.75}
                  />
                  <span
                    className="min-w-0 max-w-full truncate font-mono text-foreground"
                    title={drafts.file.name}
                  >
                    {drafts.file.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {formatBytes(drafts.file.size)}
                  </span>
                  {classifying && (
                    <span className="text-xs text-muted-foreground">
                      Checking…
                    </span>
                  )}
                  {classification && !classifying && (
                    <span className="workspace-badge inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 text-xs font-medium text-info">
                      {classification.label}
                    </span>
                  )}
                  <CopyButton
                    value={drafts.file.name}
                    ariaLabel="Copy selected filename"
                  />
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  <Upload
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm text-foreground">
                      Drop a file to inspect
                    </p>
                    <p className="text-xs text-muted-foreground">
                      .eml, Office, PDF, or Windows executable
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {drafts.file && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleClear}
                    aria-label="Remove selected file"
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-canvas text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50"
                  >
                    <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  </button>
                )}
                <button
                  type="button"
                  disabled={submitting}
                  aria-describedby={describedBy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border-control bg-canvas px-3.5 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected disabled:cursor-default disabled:opacity-50"
                >
                  {drafts.file ? "Change" : "Choose file"}
                </button>
                {submitButton}
              </div>
            </div>
          </div>
        )}

        {mode === "url" && (
          <div className="space-y-1.5">
            <label
              htmlFor={urlInputId}
              className="block text-xs font-medium text-muted-foreground"
            >
              Link or domain
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id={urlInputId}
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={drafts.url}
                disabled={submitting}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={describedBy}
                placeholder="https://example.com/login or example.com"
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData("text");
                  if (/\r|\n/.test(pasted)) {
                    event.preventDefault();
                    setUrlDraft(pasted);
                    const result = validateUrlTriageInput(pasted);
                    if (!result.ok) {
                      setFieldError(result.fieldError);
                      setShortcuts(
                        [result.shortcut, result.secondaryShortcut].filter(
                          (s): s is TriageValidationShortcut => Boolean(s),
                        ),
                      );
                    }
                  }
                }}
                onChange={(event) => {
                  setUrlDraft(event.currentTarget.value);
                  if (fieldError) clearAlerts();
                }}
                className={`min-h-11 min-w-0 flex-1 rounded-xl border bg-canvas px-3.5 py-2 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:border-accent disabled:opacity-60 ${
                  fieldError ? "border-danger" : "border-border-control"
                }`}
              />
              <div className="flex items-center gap-2">
                {hasDraft && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleClear}
                    aria-label="Clear URL"
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-border-control bg-canvas text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50"
                  >
                    <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  </button>
                )}
                {submitButton}
              </div>
            </div>
          </div>
        )}

        {mode === "sms" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor={smsInputId}
                className="block text-xs font-medium text-muted-foreground"
              >
                Message text
              </label>
              <textarea
                id={smsInputId}
                dir="auto"
                rows={3}
                value={drafts.sms}
                disabled={submitting}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={describedBy}
                placeholder="Paste the message as you received it"
                onChange={(event) => {
                  setSmsDraft(event.currentTarget.value);
                  if (fieldError) clearAlerts();
                }}
                className={`min-h-28 w-full rounded-xl border bg-canvas px-3.5 py-2.5 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:border-accent disabled:opacity-60 ${
                  fieldError ? "border-danger" : "border-border-control"
                }`}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              {hasDraft && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleClear}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border-control bg-canvas px-3.5 text-sm font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50"
                >
                  Clear
                </button>
              )}
              {submitButton}
            </div>
          </div>
        )}

        {fieldError && (
          <div className="space-y-2 rounded-xl bg-danger-bg/50 px-3.5 py-2.5">
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
            {shortcuts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {shortcuts.map((shortcut) => (
                  <button
                    key={shortcut.kind}
                    type="button"
                    onClick={() => applyShortcut(shortcut)}
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border-control bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover"
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {unavailable && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-caution-bg/50 px-3.5 py-2.5 text-xs"
          >
            <div className="space-y-1">
              <p className="flex items-start gap-2 font-medium text-foreground">
                <span
                  aria-hidden="true"
                  className="mt-1 size-1.5 shrink-0 rotate-45 border border-transparent bg-caution forced-colors:border-[CanvasText]"
                />
                <span>
                  {unavailable.scannerName} is temporarily unavailable. Your input is kept.
                </span>
              </p>
              {refreshError && (
                <p className="ps-3.5 text-xs text-caution">{refreshError}</p>
              )}
            </div>
            <button
              type="button"
              disabled={isChecking}
              onClick={() =>
                void refreshHealth().then((nextSnap) => {
                  if (nextSnap.features[unavailable.slug]?.ready) {
                    setUnavailable(null);
                    setLiveStatus(
                      `${unavailable.scannerName} is ready. You can submit your scan now.`,
                    );
                  }
                })
              }
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border-control bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-3.5 ${isChecking ? "motion-safe:animate-spin motion-reduce:hidden" : ""}`}
                strokeWidth={1.75}
              />
              <span>{isChecking ? "Checking…" : "Refresh status"}</span>
            </button>
          </div>
        )}
      </form>

      <noscript>
        <p className="text-xs text-muted-foreground">
          Immediate triage needs JavaScript. Open a scanner directly:{" "}
          {FEATURE_CATALOG.map((feature, idx) => (
            <span key={feature.slug}>
              <Link href={feature.route} className="text-accent underline underline-offset-4">
                {feature.shortLabel}
              </Link>
              {idx < FEATURE_CATALOG.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>
      </noscript>
    </section>
  );
}
