"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

interface AdvancedOptionsPanelProps {
  children: ReactNode;
}

export function AdvancedOptionsPanel({ children }: AdvancedOptionsPanelProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div className="border-t border-outline">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-start text-xs font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover hover:text-foreground sm:px-5"
      >
        <span>Advanced options</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={1.75}
        />
      </button>

      <div
        id={contentId}
        hidden={!open}
        className="border-t border-outline/70 px-4 py-4 sm:px-5"
      >
        {children}
      </div>
    </div>
  );
}
