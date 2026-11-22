import type {
  FeatureGroupDefinition,
  FeatureSlug,
  ScanningFeatureDefinition,
} from "./types.ts";

export const FIVE_MIB = 5 * 1024 * 1024;
export const TWENTY_FIVE_MIB = 25 * 1024 * 1024;
export const SINGLE_SCAN_TIMEOUT_MS = 30_000;
export const SMS_BATCH_TIMEOUT_MS = 60_000;
export const SMS_MAX_TEXT_LENGTH = 20_000;
export const SMS_MAX_BATCH_ITEMS = 256;
export const SMS_MAX_META_LENGTH = 256;
export const URL_BATCH_TIMEOUT_MS = 60_000;
export const URL_MAX_LENGTH = 8_192;
export const URL_MAX_BATCH_ITEMS = 256;
export const URL_MAX_ID_LENGTH = 128;

export const FEATURE_DOMAIN_GROUPS: readonly FeatureGroupDefinition[] = [
  {
    category: "Links & Destinations",
    slugs: ["url"],
  },
  {
    category: "Messages",
    slugs: ["email", "sms"],
  },
  {
    category: "Files & Binaries",
    slugs: ["office", "pdf", "exe"],
  },
] as const;

export const FEATURE_CATALOG: readonly ScanningFeatureDefinition[] = [
  {
    slug: "url",
    name: "URL Phishing & Malware Scanning",
    shortLabel: "URL",
    category: "Links & Destinations",
    iconKey: "link",
    summary:
      "Inspect HTTP(S) URLs and domains offline for phishing patterns, suspicious subdomains, and obfuscated paths.",
    route: "/features/url",
    apiPath: "/api/features/url",
    inputKind: "text-or-batch",
    acceptedExtensions: [".txt", ".csv", ".json", ".jsonl"],
    formatLabel: "HTTP(S) URL or bare host · .txt / .csv / .json / .jsonl",
    limitLabel: "8,192 chars · 256 URLs / 5 MiB batch",
    maxFileSizeBytes: FIVE_MIB,
    maxTextLength: URL_MAX_LENGTH,
    maxBatchItems: URL_MAX_BATCH_ITEMS,
    timeoutMs: SINGLE_SCAN_TIMEOUT_MS,
    batchTimeoutMs: URL_BATCH_TIMEOUT_MS,
    hasBatchMode: true,
    hasAdvancedOptions: false,
    staticSafetyNote:
      "Offline URL structure and pattern analysis only — links are never fetched, resolved, or opened.",
  },
  {
    slug: "email",
    name: "Email Scanning",
    shortLabel: "Email",
    category: "Messages",
    iconKey: "mail",
    summary:
      "Inspect raw .eml messages for phishing, fraud, and malicious links or attachments.",
    route: "/features/email",
    apiPath: "/api/features/email",
    inputKind: "file",
    acceptedExtensions: [".eml"],
    formatLabel: ".eml",
    limitLabel: "Up to 5 MiB (.eml)",
    maxFileSizeBytes: FIVE_MIB,
    maxTextLength: null,
    maxBatchItems: null,
    timeoutMs: SINGLE_SCAN_TIMEOUT_MS,
    batchTimeoutMs: null,
    hasBatchMode: false,
    hasAdvancedOptions: false,
    staticSafetyNote:
      "Static MIME inspection only. Links are never fetched, attachments are never opened or executed, and submitted messages are not stored after your result is returned.",
  },
  {
    slug: "sms",
    name: "SMS Spam & Smishing",
    shortLabel: "SMS",
    category: "Messages",
    iconKey: "message-square",
    summary:
      "Analyze single or batch multilingual text messages for text-message phishing (smishing) links, impersonation, and obfuscation.",
    route: "/features/sms",
    apiPath: "/api/features/sms",
    inputKind: "text-or-batch",
    acceptedExtensions: [".txt", ".csv", ".json", ".jsonl"],
    formatLabel: "Text or .txt / .csv / .json / .jsonl",
    limitLabel: "20,000 chars · 256 messages / 5 MiB batch",
    maxFileSizeBytes: FIVE_MIB,
    maxTextLength: SMS_MAX_TEXT_LENGTH,
    maxBatchItems: SMS_MAX_BATCH_ITEMS,
    timeoutMs: SINGLE_SCAN_TIMEOUT_MS,
    batchTimeoutMs: SMS_BATCH_TIMEOUT_MS,
    hasBatchMode: true,
    hasAdvancedOptions: false,
    staticSafetyNote:
      "Offline text analysis only. Extracted URLs, phone numbers, and verification codes are shown strictly as non-clickable plain text and are never retained on the server.",
  },
  {
    slug: "office",
    name: "Office Document Scanning",
    shortLabel: "Office",
    category: "Files & Binaries",
    iconKey: "file-spreadsheet",
    summary:
      "Inspect Office documents and RTF files statically for malicious macros, embedded objects, and suspicious structure.",
    route: "/features/office",
    apiPath: "/api/features/office",
    inputKind: "file",
    acceptedExtensions: [
      ".docx",
      ".docm",
      ".xlsx",
      ".xlsm",
      ".pptx",
      ".pptm",
      ".doc",
      ".xls",
      ".ppt",
      ".rtf",
    ],
    formatLabel:
      ".docx, .docm, .xlsx, .xlsm, .pptx, .pptm, .doc, .xls, .ppt, .rtf",
    limitLabel: "Up to 25 MiB",
    maxFileSizeBytes: TWENTY_FIVE_MIB,
    maxTextLength: null,
    maxBatchItems: null,
    timeoutMs: SINGLE_SCAN_TIMEOUT_MS,
    batchTimeoutMs: null,
    hasBatchMode: false,
    hasAdvancedOptions: false,
    staticSafetyNote:
      "Static inspection without executing macros or external templates. Encrypted, partial, or unsupported files always surface as review rather than an unqualified clean verdict.",
  },
  {
    slug: "pdf",
    name: "PDF Document Scanning",
    shortLabel: "PDF",
    category: "Files & Binaries",
    iconKey: "file-text",
    summary:
      "Check PDF files statically for embedded scripts, auto-actions, launch triggers, and hidden payloads.",
    route: "/features/pdf",
    apiPath: "/api/features/pdf",
    inputKind: "file",
    acceptedExtensions: [".pdf"],
    formatLabel: ".pdf",
    limitLabel: "Up to 25 MiB",
    maxFileSizeBytes: TWENTY_FIVE_MIB,
    maxTextLength: null,
    maxBatchItems: null,
    timeoutMs: SINGLE_SCAN_TIMEOUT_MS,
    batchTimeoutMs: null,
    hasBatchMode: false,
    hasAdvancedOptions: true,
    staticSafetyNote:
      "Static structural PDF inspection without rendering scripts or following URIs. Password-protected or unparseable PDFs are flagged with incomplete coverage for review.",
  },
  {
    slug: "exe",
    name: "Windows Executable Scanning",
    shortLabel: "Executable",
    category: "Files & Binaries",
    iconKey: "binary",
    summary:
      "Static Portable Executable (PE) inspection for Windows binaries (.exe, .dll, .sys) checking malware patterns, packing, and suspicious imports.",
    route: "/features/exe",
    apiPath: "/api/features/exe",
    inputKind: "file",
    acceptedExtensions: [".exe", ".dll", ".sys"],
    formatLabel: ".exe, .dll, .sys",
    limitLabel: "Up to 25 MiB",
    maxFileSizeBytes: TWENTY_FIVE_MIB,
    maxTextLength: null,
    maxBatchItems: null,
    timeoutMs: SINGLE_SCAN_TIMEOUT_MS,
    batchTimeoutMs: null,
    hasBatchMode: false,
    hasAdvancedOptions: true,
    staticSafetyNote:
      "Static binary inspection only. Uploaded executables and libraries are never executed on the server or in your browser, and raw bytes are discarded immediately after scoring.",
  },
] as const;

export const FEATURE_BY_SLUG: Record<FeatureSlug, ScanningFeatureDefinition> =
  Object.fromEntries(
    FEATURE_CATALOG.map((item) => [item.slug, item]),
  ) as Record<FeatureSlug, ScanningFeatureDefinition>;

export function getFeatureDefinition(
  slug: FeatureSlug,
): ScanningFeatureDefinition {
  return FEATURE_BY_SLUG[slug];
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) {
    return "Unavailable";
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  const clamped = Math.max(0, Math.min(1, value));
  return `${(clamped * 100).toFixed(1)}%`;
}
