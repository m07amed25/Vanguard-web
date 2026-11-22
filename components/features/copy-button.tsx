"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface CopyButtonProps {
  /** Exact text or lazy getter to copy to the clipboard. */
  value: string | (() => string);
  /** Visible button label (omit for compact icon-only inline rows). */
  label?: string;
  /** Visible label shown briefly after copying when `label` is provided. */
  copiedLabel?: string;
  /** Accessible name for screen readers and tooltip title. */
  ariaLabel: string;
  /** Visual variant: "secondary" for toolbar actions, "inline" for ledger rows. */
  variant?: "secondary" | "inline";
}

export function CopyButton({
  value,
  label,
  copiedLabel = "Copied",
  ariaLabel,
  variant = "inline",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    const text = typeof value === "function" ? value() : value;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      // Clipboard API may be unavailable in restricted contexts.
    }
  }

  if (variant === "secondary") {
    return (
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={copied ? `${ariaLabel} (copied)` : ariaLabel}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border-control bg-surface px-3 text-xs font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected"
      >
        {copied ? (
          <Check
            aria-hidden="true"
            className="size-3.5 shrink-0 text-positive"
            strokeWidth={1.75}
          />
        ) : (
          <Copy
            aria-hidden="true"
            className="size-3.5 shrink-0"
            strokeWidth={1.75}
          />
        )}
        <span>{copied ? copiedLabel : (label ?? "Copy")}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? `${ariaLabel} (copied)` : ariaLabel}
      title={copied ? "Copied" : ariaLabel}
      className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground active:bg-surface-selected"
    >
      {copied ? (
        <Check
          aria-hidden="true"
          className="size-3.5 shrink-0 text-positive"
          strokeWidth={1.75}
        />
      ) : (
        <Copy
          aria-hidden="true"
          className="size-3.5 shrink-0"
          strokeWidth={1.75}
        />
      )}
      {label && (
        <span className="ms-1 pr-1 text-xs font-medium">
          {copied ? copiedLabel : label}
        </span>
      )}
    </button>
  );
}
