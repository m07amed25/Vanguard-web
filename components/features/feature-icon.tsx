import {
  Binary,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  Link2,
  Mail,
  MessageSquareText,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import type { FeatureIconKey } from "@/lib/features/types";

const ICON_BY_KEY: Record<FeatureIconKey, ComponentType<LucideProps>> = {
  overview: LayoutGrid,
  link: Link2,
  mail: Mail,
  "message-square": MessageSquareText,
  "file-spreadsheet": FileSpreadsheet,
  "file-text": FileText,
  binary: Binary,
};

interface FeatureIconProps {
  iconKey: FeatureIconKey;
  className?: string;
}

export function FeatureIcon({
  iconKey,
  className = "size-4 shrink-0",
}: FeatureIconProps) {
  const Icon = ICON_BY_KEY[iconKey];
  return <Icon aria-hidden="true" className={className} strokeWidth={1.75} />;
}
