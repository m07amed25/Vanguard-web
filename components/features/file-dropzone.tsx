"use client";

import { Loader2, Paperclip, Upload, X } from "lucide-react";
import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { formatBytes } from "@/lib/features/catalog";
import { CopyButton } from "./copy-button";

interface FileDropzoneProps {
  label: string;
  formatLabel: string;
  limitLabel: string;
  acceptedExtensions: readonly string[];
  file: File | null;
  disabled?: boolean;
  submitting?: boolean;
  error?: string | null;
  onFileSelect: (file: File | null) => void;
  submitLabel?: string;
  submitId?: string;
  emptyPrompt?: ReactNode;
}

export function FileDropzone({
  label,
  formatLabel,
  limitLabel,
  file,
  disabled = false,
  submitting = false,
  error,
  onFileSelect,
  submitLabel = "Scan file",
  submitId,
  emptyPrompt = "Drop a file here, or choose one from your device.",
}: FileDropzoneProps) {
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) {
      onFileSelect(dropped);
    }
  }

  function clearFile() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    onFileSelect(null);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`divide-y divide-outline motion-safe:transition-colors motion-safe:duration-150 ${
        dragging ? "bg-surface-selected/40" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-xs sm:px-6">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          <span className="font-mono">{formatLabel}</span>
          <span aria-hidden="true" className="mx-1.5 text-border-control">
            ·
          </span>
          <span className="tabular-nums">{limitLabel}</span>
        </span>
      </div>

      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const chosen = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";
          onFileSelect(chosen);
        }}
      />

      <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0 flex-1">
          {file ? (
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Paperclip
                aria-hidden="true"
                className="size-4 shrink-0 text-accent"
                strokeWidth={1.75}
              />
              <span
                className="truncate font-mono text-sm text-foreground"
                title={file.name}
              >
                {file.name}
              </span>
              <span
                id={helpId}
                className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums"
              >
                · {formatBytes(file.size)}
              </span>
              <CopyButton
                value={file.name}
                ariaLabel="Copy selected filename"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Upload
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
              <p id={helpId}>{emptyPrompt}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            aria-describedby={error ? `${helpId} ${errorId}` : helpId}
            onClick={openPicker}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border-control bg-canvas px-3.5 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected disabled:cursor-default disabled:opacity-50"
          >
            {file ? "Change file" : "Choose file"}
          </button>

          {file && (
            <button
              type="button"
              disabled={disabled}
              onClick={clearFile}
              aria-label="Remove selected file"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-border-control bg-canvas text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground disabled:cursor-default disabled:opacity-50"
            >
              <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </button>
          )}

          <button
            id={submitId}
            type="submit"
            disabled={disabled}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary motion-safe:transition-colors motion-safe:duration-150 hover:bg-primary-hover active:bg-primary-pressed disabled:cursor-default disabled:bg-surface-raised disabled:text-muted-foreground"
          >
            {submitting && (
              <Loader2
                aria-hidden="true"
                className="size-4 shrink-0 motion-safe:animate-spin motion-reduce:hidden"
                strokeWidth={1.75}
              />
            )}
            <span>{submitLabel}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger-bg/20 px-4 py-2.5 sm:px-5">
          <p id={errorId} role="alert" className="text-xs font-medium text-danger break-words">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
